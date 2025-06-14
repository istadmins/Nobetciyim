// Nobetciyim/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Simple console logger fallback
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

// Ensure data directory exists
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

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

function columnExists(tableName, columnName, callback) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) return callback(err);
    const exists = columns.some(col => col.name === columnName);
    callback(null, exists);
  });
}

function initializeSchema() {
  db.serialize(() => {
    logger.info("Veritabanı şeması başlatılıyor...");
    
    // Create tables with better constraints and indexes
    const tables = [
      {
        name: 'Nobetciler',
        sql: `CREATE TABLE IF NOT EXISTS Nobetciler (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password TEXT NOT NULL,
          kredi INTEGER DEFAULT 0 CHECK(kredi >= 0),
          is_aktif INTEGER DEFAULT 0 CHECK(is_aktif IN (0, 1)),
          pay_edilen_kredi INTEGER DEFAULT 0 CHECK(pay_edilen_kredi >= 0),
          telegram_id TEXT DEFAULT NULL UNIQUE,
          telefon_no TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'kredi_kurallari',
        sql: `CREATE TABLE IF NOT EXISTS kredi_kurallari (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kural_adi TEXT NOT NULL,
          kredi INTEGER NOT NULL CHECK(kredi >= 0),
          tarih TEXT,
          sabit_kural INTEGER DEFAULT 0 CHECK(sabit_kural IN (0, 1)),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(kural_adi, tarih)
        )`
      },
      {
        name: 'nobet_kredileri',
        sql: `CREATE TABLE IF NOT EXISTS nobet_kredileri (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kredi_dakika INTEGER NOT NULL CHECK(kredi_dakika > 0),
          baslangic_saat TEXT NOT NULL,
          bitis_saat TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(baslangic_saat, bitis_saat)
        )`
      },
      {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
          email TEXT UNIQUE,
          reset_password_token TEXT,
          reset_password_expires INTEGER,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'takvim_aciklamalari',
        sql: `CREATE TABLE IF NOT EXISTS takvim_aciklamalari (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          yil INTEGER NOT NULL CHECK(yil >= 2020 AND yil <= 2050),
          hafta INTEGER NOT NULL CHECK(hafta >= 1 AND hafta <= 53),
          aciklama TEXT,
          nobetci_id_override INTEGER DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(yil, hafta),
          FOREIGN KEY (nobetci_id_override) REFERENCES Nobetciler(id) ON DELETE SET NULL
        )`
      },
      {
        name: 'uygulama_ayarlari',
        sql: `CREATE TABLE IF NOT EXISTS uygulama_ayarlari (
          ayar_key TEXT PRIMARY KEY,
          ayar_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      }
    ];

    // Create tables
    tables.forEach(table => {
      db.run(table.sql, (err) => {
        if (err) {
          logger.error(`Error creating table ${table.name}:`, err);
        } else {
          logger.debug(`Table ${table.name} created/verified successfully`);
        }
      });
    });

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_nobetciler_is_aktif ON Nobetciler(is_aktif)',
      'CREATE INDEX IF NOT EXISTS idx_nobetciler_telegram_id ON Nobetciler(telegram_id)',
      'CREATE INDEX IF NOT EXISTS idx_kredi_kurallari_tarih ON kredi_kurallari(tarih)',
      'CREATE INDEX IF NOT EXISTS idx_takvim_yil_hafta ON takvim_aciklamalari(yil, hafta)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'
    ];

    indexes.forEach(indexSql => {
      db.run(indexSql, (err) => {
        if (err) {
          logger.error('Error creating index:', err);
        }
      });
    });

    logger.info("Veritabanı şema kontrolü tamamlandı.");
  });
}

// --- YARDIMCI FONKSİYONLAR ---

db.getShiftTimeRanges = function() {
    return new Promise((resolve, reject) => {
        this.all('SELECT id, kredi_dakika, baslangic_saat, bitis_saat FROM nobet_kredileri ORDER BY baslangic_saat ASC', [], (err, rows) => {
            if (err) { 
                logger.error("DB Error (getShiftTimeRanges):", err);
                reject(new Error('Vardiya zaman aralıkları alınamadı'));
            } else { 
                resolve(rows || []); 
            }
        });
    });
};

db.setAktifNobetci = function(nobetciId) {
    return new Promise((resolve, reject) => {
        // Validate input
        if (nobetciId !== null && (typeof nobetciId !== 'number' || nobetciId <= 0)) {
            return reject(new Error('Geçersiz nöbetçi ID'));
        }

        this.serialize(() => {
            this.run("UPDATE Nobetciler SET is_aktif = 0, updated_at = CURRENT_TIMESTAMP", (err) => {
                if (err) { 
                    logger.error("DB Error (setAktifNobetci - step 1):", err);
                    return reject(new Error('Aktif nöbetçi sıfırlanamadı'));
                }
                
                if (nobetciId !== null && typeof nobetciId !== 'undefined') {
                    this.run("UPDATE Nobetciler SET is_aktif = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nobetciId], function(errUpdate) {
                        if (errUpdate) { 
                            logger.error("DB Error (setAktifNobetci - step 2):", errUpdate);
                            return reject(new Error('Nöbetçi aktif olarak ayarlanamadı'));
                        }
                        if (this.changes === 0) {
                            return reject(new Error('Nöbetçi bulunamadı'));
                        }
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
