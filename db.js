// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./nobet.db', (err) => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err.message);
  } else {
    console.log('SQLite veritabanına bağlandı.');
    initializeSchema();
  }
});

// Sütunun var olup olmadığını kontrol eden yardımcı fonksiyon
function columnExists(tableName, columnName, callback) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      return callback(err);
    }
    const exists = columns.some(col => col.name === columnName);
    callback(null, exists);
  });
}

function initializeSchema() {
  db.serialize(() => {
    console.log("Veritabanı şeması başlatılıyor...");

    // Nobetciler Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS Nobetciler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        kredi INTEGER DEFAULT 0,
        is_aktif INTEGER DEFAULT 0,
        pay_edilen_kredi INTEGER DEFAULT 0,
        telegram_id TEXT DEFAULT NULL UNIQUE,
        telefon_no TEXT DEFAULT NULL
      )
    `, (err) => {
        if (err) console.error("Nobetciler tablo oluşturma hatası:", err.message);
        else {
            console.log("Nobetciler tablosu kontrol edildi/oluşturuldu.");
            const columnsToEnsure = [
                { name: 'telegram_id', type: 'TEXT DEFAULT NULL UNIQUE' },
                { name: 'telefon_no', type: 'TEXT DEFAULT NULL' },
                { name: 'pay_edilen_kredi', type: 'INTEGER DEFAULT 0' }
            ];
            columnsToEnsure.forEach(column => {
                columnExists('Nobetciler', column.name, (err, exists) => {
                    if (err) return console.error(`Nobetciler.${column.name} kontrol hatası:`, err.message);
                    if (!exists) {
                        db.run(`ALTER TABLE Nobetciler ADD COLUMN ${column.name} ${column.type}`, (alterErr) => {
                            if (alterErr) console.error(`Nobetciler tablosuna ${column.name} eklenirken hata:`, alterErr.message);
                            else console.log(`Nobetciler tablosuna ${column.name} sütunu eklendi.`);
                        });
                    }
                });
            });
        }
    });

    // kredi_kurallari Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS kredi_kurallari (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kural_adi TEXT NOT NULL,
        kredi INTEGER NOT NULL,
        tarih TEXT, -- YYYY-MM-DD formatında
        sabit_kural INTEGER DEFAULT 0,
        UNIQUE(kural_adi, tarih)
      )
    `, (err) => {
        if(err) console.error("kredi_kurallari tablo oluşturma hatası:", err.message);
        else {
            db.run(`INSERT OR IGNORE INTO kredi_kurallari (kural_adi, kredi, sabit_kural, tarih) VALUES (?, ?, ?, ?)`,
                ['Hafta Sonu', 0, 1, null],
                (insertErr) => {
                    if (insertErr) console.error("Varsayılan 'Hafta Sonu' kuralı eklenirken hata:", insertErr.message);
                }
            );
        }
    });

    // nobet_kredileri Tablosu (Vardiya Saat Aralıkları)
    db.run(`
      CREATE TABLE IF NOT EXISTS nobet_kredileri (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kredi_dakika INTEGER NOT NULL,
        baslangic_saat TEXT NOT NULL, -- HH:MM formatında
        bitis_saat TEXT NOT NULL,   -- HH:MM formatında
        UNIQUE(baslangic_saat, bitis_saat)
      )
    `, (err) => {
        if(err) console.error("nobet_kredileri tablo oluşturma hatası:", err.message);
    });

    // users Tablosu (Admin girişi için)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        email TEXT UNIQUE,
        reset_password_token TEXT,
        reset_password_expires INTEGER
      )
    `, (err) => {
        if(err) console.error("Users tablo oluşturma hatası:", err.message);
    });

    // takvim_aciklamalari Tablosu (Manuel atamalar ve notlar için)
    db.run(`
      CREATE TABLE IF NOT EXISTS takvim_aciklamalari (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        yil INTEGER NOT NULL,
        hafta INTEGER NOT NULL,
        aciklama TEXT,
        nobetci_id_override INTEGER DEFAULT NULL REFERENCES Nobetciler(id) ON DELETE SET NULL,
        UNIQUE(yil, hafta)
      )
    `, (err) => {
        if (err) console.error("takvim_aciklamalari tablo oluşturma hatası:", err.message);
    });
    
    // uygulama_ayarlari Tablosu (Yeniden sıralama, Telegram ayarları vb. için)
    db.run(`
      CREATE TABLE IF NOT EXISTS uygulama_ayarlari (
        ayar_key TEXT PRIMARY KEY,
        ayar_value TEXT
      )
    `, function(err) {
      if (err) console.error("uygulama_ayarlari tablosu oluşturulurken hata:", err.message);
      else {
        const defaultSettings = [
            { key: 'resort_config', value: JSON.stringify({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 }) },
            { key: 'telegram_group_id', value: null }, // Burayı kendi grup ID'nizle doldurun veya arayüzden ayarlanabilir yapın
            { key: 'is_telegram_active', value: 'false' } // Varsayılan olarak false
        ];
        defaultSettings.forEach(setting => {
            db.run("INSERT OR IGNORE INTO uygulama_ayarlari (ayar_key, ayar_value) VALUES (?, ?)",
                [setting.key, setting.value]);
        });
      }
    });
    console.log("Veritabanı şeması başlatma tamamlandı.");
  });
}


// --- Yardımcı Fonksiyonlar ---

db.getShiftTimeRanges = function() {
    return new Promise((resolve, reject) => {
        this.all('SELECT id, kredi_dakika, baslangic_saat, bitis_saat FROM nobet_kredileri ORDER BY baslangic_saat ASC', [], (err, rows) => {
            if (err) { console.error("DB Error (getShiftTimeRanges):", err.message); reject(err); }
            else { resolve(rows); }
        });
    });
};

db.setAktifNobetci = function(nobetciId) {
    return new Promise((resolve, reject) => {
        this.serialize(() => {
            this.run("UPDATE Nobetciler SET is_aktif = 0", (err) => {
                if (err) { console.error("DB Error (setAktifNobetci - step 1):", err.message); return reject(err); }
                if (nobetciId !== null && typeof nobetciId !== 'undefined') {
                    this.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [nobetciId], function(errUpdate) {
                        if (errUpdate) { console.error("DB Error (setAktifNobetci - step 2):", errUpdate.message); return reject(errUpdate); }
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    });
};

db.getAktifNobetci = function() {
    return new Promise((resolve, reject) => {
        this.get("SELECT id, name, kredi, telegram_id, is_aktif FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
            if (err) { console.error("DB Error (getAktifNobetci):", err.message); reject(err); }
            else { resolve(row); }
        });
    });
};

db.getNobetciById = function(id) {
     return new Promise((resolve, reject) => {
        this.get("SELECT id, name, kredi, is_aktif, telegram_id, telefon_no, pay_edilen_kredi FROM Nobetciler WHERE id = ?", [id], (err, row) => {
            if (err) { console.error(`DB Error (getNobetciById - ID: ${id}):`, err.message); reject(err); }
            else { resolve(row); }
        });
    });
};

db.getAllKrediKurallari = function() {
     return new Promise((resolve, reject) => {
        this.all("SELECT id, kural_adi, kredi, tarih, sabit_kural FROM kredi_kurallari", [], (err, rows) => {
            if (err) { console.error("DB Error (getAllKrediKurallari):", err.message); reject(err); }
            else { resolve(rows); }
        });
    });
};

db.updateNobetciKredi = function(nobetciId, yeniKredi) {
    return new Promise((resolve, reject) => {
        this.run("UPDATE Nobetciler SET kredi = ? WHERE id = ?", [yeniKredi, nobetciId], function(err) {
            if (err) { console.error(`DB Error (updateNobetciKredi - ID: ${nobetciId}):`, err.message); reject(err); }
            else { resolve(); }
        });
    });
};

db.getDutyOverride = function(yil, hafta) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT ta.nobetci_id_override, n.name as nobetci_adi_override
            FROM takvim_aciklamalari ta
            LEFT JOIN Nobetciler n ON n.id = ta.nobetci_id_override
            WHERE ta.yil = ? AND ta.hafta = ?
        `;
        this.get(sql, [yil, hafta], (err, row) => {
            if (err) {
                console.error(`DB Error (getDutyOverride - ${yil}/${hafta}):`, err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

db.getSettings = function() {
    return new Promise((resolve, reject) => {
        this.all("SELECT ayar_key, ayar_value FROM uygulama_ayarlari", [], (err, rows) => {
            if (err) {
                console.error("DB Error (getSettings):", err.message);
                reject(err);
            } else {
                const settings = {};
                rows.forEach(row => {
                    if (row.ayar_key === 'is_telegram_active') {
                        settings[row.ayar_key] = (row.ayar_value === 'true');
                    } else {
                        settings[row.ayar_key] = row.ayar_value;
                    }
                });
                resolve(settings);
            }
        });
    });
};

module.exports = db;
