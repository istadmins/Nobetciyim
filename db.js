// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
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
    initializeSchema();
  }
});

db.run('PRAGMA foreign_keys = ON');

function initializeSchema() {
  db.serialize(() => {
    logger.info("Veritabanı şeması başlatılıyor...");
    const tables = [
      {
        name: 'Nobetciler',
        sql: `CREATE TABLE IF NOT EXISTS Nobetciler (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, kredi INTEGER DEFAULT 0 CHECK(kredi >= 0), is_aktif INTEGER DEFAULT 0 CHECK(is_aktif IN (0, 1)), pay_edilen_kredi INTEGER DEFAULT 0 CHECK(pay_edilen_kredi >= 0), telegram_id TEXT DEFAULT NULL UNIQUE, telefon_no TEXT DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
      },
      // Diğer tabloların CREATE sorguları buraya eklenebilir.
    ];
    tables.forEach(table => db.run(table.sql, (err) => { if (err) logger.error(`Error creating table ${table.name}:`, err); }));
    logger.info("Veritabanı şema kontrolü tamamlandı.");
  });
}

/**
 * GÜVENLİ VE DÜZELTİLMİŞ setAktifNobetci FONKSİYONU
 * Bu fonksiyon, bir nöbetçiyi aktif yapar. Tüm işlemi bir transaction içinde
 * yürüterek veri bütünlüğünü garanti altına alır ve hataları doğru şekilde yakalar.
 * @param {number} nobetciId - Aktif yapılacak nöbetçinin ID'si (sayı olmalı)
 */
db.setAktifNobetci = function(nobetciId) {
    return new Promise((resolve, reject) => {
        // Gelen ID'nin geçerli bir sayı olduğunu kontrol et
        if (nobetciId === null || nobetciId === undefined || typeof nobetciId !== 'number' || nobetciId <= 0) {
            return reject(new Error('Geçersiz nöbetçi ID. ID bir sayı olmalıdır.'));
        }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION;", (err) => {
                if (err) return reject(new Error("Transaction başlatılamadı: " + err.message));
            });

            // Adım 1: Sadece mevcut aktif olanı pasif yap (daha verimli)
            db.run("UPDATE Nobetciler SET is_aktif = 0, updated_at = CURRENT_TIMESTAMP WHERE is_aktif = 1;", function(err) {
                if (err) {
                    db.run("ROLLBACK;");
                    return reject(new Error("Aktif nöbetçi sıfırlanamadı: " + err.message));
                }

                // Adım 2: Yeni nöbetçiyi aktif yap
                db.run("UPDATE Nobetciler SET is_aktif = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nobetciId], function(errUpdate) {
                    if (errUpdate) {
                        db.run("ROLLBACK;");
                        return reject(new Error("Nöbetçi aktif olarak ayarlanamadı: " + errUpdate.message));
                    }
                    // Eğer hiçbir satır güncellenmediyse, o ID'de nöbetçi yok demektir.
                    if (this.changes === 0) {
                        db.run("ROLLBACK;");
                        return reject(new Error(`Ayarlanmak istenen nöbetçi (ID: ${nobetciId}) bulunamadı.`));
                    }
                    
                    // Her şey yolundaysa, işlemi onayla
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) return reject(new Error("Transaction bitirilemedi: " + commitErr.message));
                        resolve({ success: true, message: "Nöbetçi başarıyla güncellendi." }); // Başarılı
                    });
                });
            });
        });
    });
};

// --- Diğer Veritabanı Fonksiyonları ---

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
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) return resolve(null); // Geçersiz ID gelirse null dön
        this.get("SELECT * FROM Nobetciler WHERE id = ?", [numericId], (err, row) => {
            if (err) { console.error(`DB Error (getNobetciById - ID: ${numericId}):`, err.message); reject(err); }
            else { resolve(row); }
        });
    });
};

db.getAllNobetcilerWithTelegramId = function() {
    return new Promise((resolve, reject) => {
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
