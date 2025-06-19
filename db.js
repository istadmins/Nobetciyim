// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args)
};

const dataDir = path.dirname(process.env.DB_PATH || './data/nobet.db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || './data/nobet.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Veritabanı bağlantı hatası:', err);
    process.exit(1);
  } else {
    logger.info('SQLite veritabanına bağlandı:', dbPath);
  }
});

db.setAktifNobetci = function(nobetciId) {
    return new Promise((resolve, reject) => {
        if (nobetciId === null || typeof nobetciId !== 'number' || nobetciId <= 0) {
            return reject(new Error('Geçersiz nöbetçi ID. ID pozitif bir sayı olmalıdır.'));
        }
        db.serialize(() => {
            db.run("BEGIN TRANSACTION;");
            db.run("UPDATE Nobetciler SET is_aktif = 0 WHERE is_aktif = 1;");
            db.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [nobetciId], function(errUpdate) {
                if (errUpdate || this.changes === 0) {
                    db.run("ROLLBACK;");
                    return reject(new Error(errUpdate ? errUpdate.message : `Nöbetçi (ID: ${nobetciId}) bulunamadı.`));
                }
                db.run("COMMIT;", (commitErr) => {
                    if (commitErr) return reject(new Error("Transaction bitirilemedi: " + commitErr.message));
                    resolve({ success: true });
                });
            });
        });
    });
};

db.getNobetciById = function(id) {
     return new Promise((resolve, reject) => {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) return resolve(null);
        this.get("SELECT * FROM Nobetciler WHERE id = ?", [numericId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.getAktifNobetci = function() {
    return new Promise((resolve, reject) => {
        this.get("SELECT * FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// YENİ EKLENEN/DOĞRULANAN FONKSİYON
db.getDutyOverride = function(yil, hafta) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT ta.nobetci_id_override, n.name as nobetci_adi_override
            FROM takvim_aciklamalari ta
            LEFT JOIN Nobetciler n ON n.id = ta.nobetci_id_override
            WHERE ta.yil = ? AND ta.hafta = ?
        `;
        db.get(sql, [yil, hafta], (err, row) => {
            if (err) {
                console.error(`DB Error (getDutyOverride - ${yil}/${hafta}):`, err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};


// Diğer db fonksiyonlarınız burada yer alabilir.
// ...

module.exports = db;
