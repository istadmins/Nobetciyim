// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs =require('fs');

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

/**
 * GÜVENLİ VE DÜZELTİLMİŞ setAktifNobetci FONKSİYONU
 * "updated_at" sütunu ile ilgili hata düzeltildi.
 */
db.setAktifNobetci = function(nobetciId) {
    return new Promise((resolve, reject) => {
        if (nobetciId === null || typeof nobetciId !== 'number' || nobetciId <= 0) {
            return reject(new Error('Geçersiz nöbetçi ID. ID pozitif bir sayı olmalıdır.'));
        }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION;", (err) => {
                if (err) return reject(new Error("Transaction başlatılamadı: " + err.message));
            });

            // "updated_at" sütunu sorgudan kaldırıldı.
            db.run("UPDATE Nobetciler SET is_aktif = 0 WHERE is_aktif = 1;", function(err) {
                if (err) {
                    db.run("ROLLBACK;");
                    return reject(new Error("Aktif nöbetçi sıfırlanamadı: " + err.message));
                }

                // "updated_at" sütunu sorgudan kaldırıldı.
                db.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [nobetciId], function(errUpdate) {
                    if (errUpdate) {
                        db.run("ROLLBACK;");
                        return reject(new Error("Nöbetçi aktif olarak ayarlanamadı: " + errUpdate.message));
                    }
                    if (this.changes === 0) {
                        db.run("ROLLBACK;");
                        return reject(new Error(`Ayarlanmak istenen nöbetçi (ID: ${nobetciId}) bulunamadı.`));
                    }
                    
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) return reject(new Error("Transaction bitirilemedi: " + commitErr.message));
                        resolve({ success: true, message: "Nöbetçi başarıyla güncellendi." });
                    });
                });
            });
        });
    });
};

db.getNobetciById = function(id) {
     return new Promise((resolve, reject) => {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) return resolve(null);
        this.get("SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler WHERE id = ?", [numericId], (err, row) => {
            if (err) { 
                logger.error(`DB Error (getNobetciById - ID: ${numericId}):`, err.message); 
                reject(err); 
            }
            else { resolve(row); }
        });
    });
};

// --- DİĞER DB FONKSİYONLARI ---
// Bu alana projenizin ihtiyaç duyduğu diğer db fonksiyonları (getAktifNobetci, getAllKrediKurallari vb.) eklenebilir.
// Mevcut cron-jobs.js dosyanızda kullanılan tüm db fonksiyonlarının burada tanımlı olduğundan emin olun.

db.getAktifNobetci = function() {
    return new Promise((resolve, reject) => {
        this.get("SELECT * FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.getAllNobetcilerWithTelegramId = function() {
    return new Promise((resolve, reject) => {
        this.all("SELECT id, name, telegram_id FROM Nobetciler WHERE telegram_id IS NOT NULL AND telegram_id != ''", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

db.getAllKrediKurallari = function() {
    return new Promise((resolve, reject) => {
        this.all("SELECT * FROM kredi_kurallari", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.getShiftTimeRanges = function() {
    return new Promise((resolve, reject) => {
        this.all("SELECT * FROM nobet_kredileri ORDER BY baslangic_saat ASC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.updateNobetciKredi = function(id, kredi) {
    return new Promise((resolve, reject) => {
        this.run("UPDATE Nobetciler SET kredi = ? WHERE id = ?", [kredi, id], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};


module.exports = db;
