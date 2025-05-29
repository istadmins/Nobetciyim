// node2/db.js
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
        telefon_no TEXT DEFAULT NULL /* YENİ SÜTUN EKLENDİ */
      )
    `, (err) => {
        if (err) console.error("Nobetciler tablo oluşturma hatası:", err.message);
        else {
            console.log("Nobetciler tablosu kontrol edildi/oluşturuldu.");
            // Mevcut telegram_id sütun kontrolü
            columnExists('Nobetciler', 'telegram_id', (err, exists) => {
                if (err) return console.error("Nobetciler.telegram_id kontrol hatası:", err.message);
                if (!exists) {
                    db.run("ALTER TABLE Nobetciler ADD COLUMN telegram_id TEXT DEFAULT NULL UNIQUE", (alterErr) => {
                        if (alterErr) console.error("Nobetciler tablosuna telegram_id eklenirken hata:", alterErr.message);
                        else console.log("Nobetciler tablosuna telegram_id sütunu eklendi.");
                    });
                }
            });
            // Yeni telefon_no sütun kontrolü ve eklenmesi
            columnExists('Nobetciler', 'telefon_no', (err, exists) => {
                if (err) return console.error("Nobetciler.telefon_no kontrol hatası:", err.message);
                if (!exists) {
                    db.run("ALTER TABLE Nobetciler ADD COLUMN telefon_no TEXT DEFAULT NULL", (alterErr) => {
                        if (alterErr) console.error("Nobetciler tablosuna telefon_no eklenirken hata:", alterErr.message);
                        else console.log("Nobetciler tablosuna telefon_no sütunu eklendi.");
                    });
                }
            });
        }
    });

    // kredi_kurallari Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS kredi_kurallari (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kural_adi TEXT NOT NULL,
        kredi INTEGER NOT NULL,
        tarih TEXT,
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

    // nobet_kredileri Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS nobet_kredileri (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kredi_dakika INTEGER NOT NULL,
        baslangic_saat TEXT NOT NULL,
        bitis_saat TEXT NOT NULL,
        UNIQUE(baslangic_saat, bitis_saat)
      )
    `, (err) => {
        if(err) console.error("nobet_kredileri tablo oluşturma hatası:", err.message);
    });

    // users Tablosu
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
        else {
            console.log("Users tablosu kontrol edildi/oluşturuldu.");
            const userColumnsToEnsure = [
                { name: 'email', type: 'TEXT UNIQUE' },
                { name: 'role', type: 'TEXT DEFAULT \'user\''},
                { name: 'reset_password_token', type: 'TEXT' },
                { name: 'reset_password_expires', type: 'INTEGER' }
            ];
            userColumnsToEnsure.forEach(column => {
                columnExists('users', column.name, (err, exists) => {
                    if (err) return console.error(`Users.${column.name} kontrol hatası:`, err.message);
                    if (!exists) {
                        const typeForAlter = column.type.split(' ')[0];
                        const defaultValueClause = column.type.includes('DEFAULT') ? `DEFAULT ${column.type.split('DEFAULT ')[1]}` : '';
                        db.run(`ALTER TABLE users ADD COLUMN ${column.name} ${typeForAlter} ${defaultValueClause}`, (alterErr) => {
                            if (alterErr) console.error(`Users tablosuna '${column.name}' sütunu eklenirken hata:`, alterErr.message);
                            else console.log(`Users tablosuna '${column.name}' sütunu eklendi.`);
                        });
                    }
                });
            });
        }
    });

    // takvim_aciklamalari Tablosu
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
        else {
            columnExists('takvim_aciklamalari', 'nobetci_id_override', (err, exists) => {
                if (err) return console.error("takvim_aciklamalari.nobetci_id_override kontrol hatası:", err.message);
                if (!exists) {
                    db.run("ALTER TABLE takvim_aciklamalari ADD COLUMN nobetci_id_override INTEGER DEFAULT NULL REFERENCES Nobetciler(id) ON DELETE SET NULL", (alterErr) => {
                        if (alterErr) console.error("takvim_aciklamalari tablosuna nobetci_id_override eklenirken hata:", alterErr.message);
                        else console.log("takvim_aciklamalari tablosuna nobetci_id_override sütunu eklendi.");
                    });
                }
            });
        }
    });
    
    // uygulama_ayarlari Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS uygulama_ayarlari (
        ayar_key TEXT PRIMARY KEY,
        ayar_value TEXT
      )
    `, function(err) {
      if (err) console.error("uygulama_ayarlari tablosu oluşturulurken hata:", err.message);
      else {
        const resortConfigDefault = JSON.stringify({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
        db.run("INSERT OR IGNORE INTO uygulama_ayarlari (ayar_key, ayar_value) VALUES (?, ?)",
            ['resort_config', resortConfigDefault]);
      }
    });
    console.log("Veritabanı şeması başlatma tamamlandı.");
  });
}

module.exports = db;