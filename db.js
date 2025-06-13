// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/nobet.db', (err) => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err.message);
  } else {
    console.log('SQLite veritabanına bağlandı.');
    initializeSchema();
  }
});

function columnExists(tableName, columnName, callback) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) return callback(err);
    const exists = columns.some(col => col.name === columnName);
    callback(null, exists);
  });
}

function initializeSchema() {
  db.serialize(() => {
    console.log("Veritabanı şeması başlatılıyor...");
    db.run(`CREATE TABLE IF NOT EXISTS Nobetciler (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, password TEXT NOT NULL, kredi INTEGER DEFAULT 0, is_aktif INTEGER DEFAULT 0, pay_edilen_kredi INTEGER DEFAULT 0, telegram_id TEXT DEFAULT NULL UNIQUE, telefon_no TEXT DEFAULT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS kredi_kurallari (id INTEGER PRIMARY KEY AUTOINCREMENT, kural_adi TEXT NOT NULL, kredi INTEGER NOT NULL, tarih TEXT, sabit_kural INTEGER DEFAULT 0, UNIQUE(kural_adi, tarih))`);
    db.run(`CREATE TABLE IF NOT EXISTS nobet_kredileri (id INTEGER PRIMARY KEY AUTOINCREMENT, kredi_dakika INTEGER NOT NULL, baslangic_saat TEXT NOT NULL, bitis_saat TEXT NOT NULL, UNIQUE(baslangic_saat, bitis_saat))`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT DEFAULT 'user', email TEXT UNIQUE, reset_password_token TEXT, reset_password_expires INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS takvim_aciklamalari (id INTEGER PRIMARY KEY AUTOINCREMENT, yil INTEGER NOT NULL, hafta INTEGER NOT NULL, aciklama TEXT, nobetci_id_override INTEGER DEFAULT NULL REFERENCES Nobetciler(id) ON DELETE SET NULL, UNIQUE(yil, hafta))`);
    db.run(`CREATE TABLE IF NOT EXISTS uygulama_ayarlari (ayar_key TEXT PRIMARY KEY, ayar_value TEXT)`);
    console.log("Veritabanı şema kontrolü tamamlandı.");
  });
}

// --- YARDIMCI FONKSİYONLAR ---

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

/**
 * Telegram ID'si boş veya null olmayan tüm nöbetçileri getirir.
 */
db.getAllNobetcilerWithTelegramId = function() {
    return new Promise((resolve, reject) => {
        // telegram_id'si boş veya null olmayan tüm kullanıcıları seçer
        this.all("SELECT id, name, telegram_id FROM Nobetciler WHERE telegram_id IS NOT NULL AND telegram_id != ''", [], (err, rows) => {
            if (err) {
                console.error("DB Error (getAllNobetcilerWithTelegramId):", err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

module.exports = db;
