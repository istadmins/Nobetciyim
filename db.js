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
        // Veritabanı tablolarını oluşturan fonksiyonu burada çağırıyoruz.
        initializeSchema();
    }
});

/**
 * Veritabanı tablolarının var olup olmadığını kontrol eder ve yoksa oluşturur.
 * Bu fonksiyon, uygulamanın çökmesini engeller.
 */
function initializeSchema() {
    const createTablesSql = `
        CREATE TABLE IF NOT EXISTS Nobetciler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password TEXT NOT NULL,
            kredi INTEGER DEFAULT 0,
            is_aktif INTEGER DEFAULT 0,
            pay_edilen_kredi INTEGER DEFAULT 0,
            telegram_id TEXT UNIQUE,
            telefon_no TEXT
        );

        CREATE TABLE IF NOT EXISTS takvim_aciklamalari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            yil INTEGER NOT NULL,
            hafta INTEGER NOT NULL,
            aciklama TEXT,
            nobetci_id_override INTEGER,
            UNIQUE(yil, hafta),
            FOREIGN KEY (nobetci_id_override) REFERENCES Nobetciler(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS kredi_kurallari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kural_adi TEXT NOT NULL,
            kredi INTEGER NOT NULL,
            tarih TEXT
        );

        CREATE TABLE IF NOT EXISTS nobet_kredileri (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kredi_dakika INTEGER NOT NULL,
            baslangic_saat TEXT NOT NULL,
            bitis_saat TEXT NOT NULL,
            vardiya_adi TEXT
        );

        CREATE TABLE IF NOT EXISTS nobetci_izinleri (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nobetci_id INTEGER NOT NULL,
            baslangic_tarihi TEXT NOT NULL,
            bitis_tarihi TEXT NOT NULL,
            gunduz_yedek_id INTEGER,
            gece_yedek_id INTEGER,
            FOREIGN KEY (nobetci_id) REFERENCES Nobetciler(id),
            FOREIGN KEY (gunduz_yedek_id) REFERENCES Nobetciler(id),
            FOREIGN KEY (gece_yedek_id) REFERENCES Nobetciler(id)
        );

        CREATE TABLE IF NOT EXISTS uygulama_ayarlari (
            ayar_key TEXT PRIMARY KEY,
            ayar_value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS AktifNobetciOverride (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nobetci_id INTEGER,
            atama_zamani TEXT,
            FOREIGN KEY (nobetci_id) REFERENCES Nobetciler(id)
        );
    `;

    db.exec(createTablesSql, (err) => {
        if (err) {
            logger.error('Veritabanı şeması oluşturulurken hata:', err.message);
        } else {
            logger.info('Veritabanı şeması başarıyla doğrulandı/oluşturuldu.');
        }
    });
}

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

        db.get("SELECT * FROM Nobetciler WHERE id = ?", [numericId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.getAktifNobetci = function() {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.getDutyOverride = function(yil, hafta) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT ta.nobetci_id_override, ta.aciklama, n.name as nobetci_adi_override
            FROM takvim_aciklamalari ta
            LEFT JOIN Nobetciler n ON n.id = ta.nobetci_id_override
            WHERE ta.yil = ? AND ta.hafta = ?
        `;
        
        console.log(`[DEBUG] getDutyOverride çağrıldı: Yıl=${yil}, Hafta=${hafta}`);
        
        db.get(sql, [yil, hafta], (err, row) => {
            if (err) {
                logger.error(`DB Error (getDutyOverride - ${yil}/${hafta}):`, err.message);
                reject(err);
            } else {
                console.log(`[DEBUG] getDutyOverride sonucu:`, row);
                resolve(row);
            }
        });
    });
};

// Diğer dosyaların ihtiyaç duyduğu ek fonksiyonlar
db.getAllNobetcilerWithTelegramId = function() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, name, telegram_id FROM Nobetciler WHERE telegram_id IS NOT NULL AND telegram_id != ''", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.getAllKrediKurallari = function() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM kredi_kurallari", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.getShiftTimeRanges = function() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM nobet_kredileri ORDER BY baslangic_saat ASC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.updateNobetciKredi = function(id, kredi) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE Nobetciler SET kredi = ? WHERE id = ?", [kredi, id], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

db.getIzinliNobetciIdleri = function(baslangicTarihi, bitisTarihi) {
    return new Promise((resolve, reject) => {
        // İzinli olanlar: izin başlangıcı <= bitiş ve izin bitişi >= başlangıç (çakışan aralıklar)
        db.all(
            `SELECT nobetci_id FROM nobetci_izinleri WHERE NOT (bitis_tarihi <= ? OR baslangic_tarihi >= ?)`,
            [baslangicTarihi, bitisTarihi],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.nobetci_id));
            }
        );
    });
};

db.getIzinlerForDateRange = function(baslangicTarihi, bitisTarihi) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT i.*, n1.name as nobetci_adi, n2.name as gunduz_yedek_adi, n3.name as gece_yedek_adi
             FROM nobetci_izinleri i
             LEFT JOIN Nobetciler n1 ON i.nobetci_id = n1.id
             LEFT JOIN Nobetciler n2 ON i.gunduz_yedek_id = n2.id
             LEFT JOIN Nobetciler n3 ON i.gece_yedek_id = n3.id
             WHERE NOT (i.bitis_tarihi <= ? OR i.baslangic_tarihi >= ?)
             ORDER BY i.baslangic_tarihi ASC`,
            [baslangicTarihi, bitisTarihi],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
};

db.getIzinliNobetciVeYedekleri = function(date) {
    return new Promise((resolve, reject) => {
        // date: Date nesnesi veya ISO string
        let d = (date instanceof Date) ? date : new Date(date);
        // Local ISO string (YYYY-MM-DDTHH:mm)
        function toLocalISOString(date) {
            const pad = n => n < 10 ? '0' + n : n;
            return date.getFullYear() + '-' +
                pad(date.getMonth() + 1) + '-' +
                pad(date.getDate()) + 'T' +
                pad(date.getHours()) + ':' +
                pad(date.getMinutes());
        }
        let nowLocalISO = toLocalISOString(d);
        db.all(
            `SELECT i.*, n1.name as nobetci_adi, n2.name as gunduz_yedek_adi, n3.name as gece_yedek_adi
             FROM nobetci_izinleri i
             LEFT JOIN Nobetciler n1 ON i.nobetci_id = n1.id
             LEFT JOIN Nobetciler n2 ON i.gunduz_yedek_id = n2.id
             LEFT JOIN Nobetciler n3 ON i.gece_yedek_id = n3.id
             WHERE i.baslangic_tarihi <= ? AND i.bitis_tarihi > ?
             ORDER BY i.baslangic_tarihi ASC`,
            [nowLocalISO, nowLocalISO],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
};

db.setAktifNobetciOverride = function(nobetciId) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`INSERT INTO AktifNobetciOverride (id, nobetci_id, atama_zamani) VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET nobetci_id = excluded.nobetci_id, atama_zamani = excluded.atama_zamani`,
            [nobetciId, now],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};
db.getAktifNobetciOverride = function() {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM AktifNobetciOverride WHERE id = 1", [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};
db.clearAktifNobetciOverride = function() {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM AktifNobetciOverride WHERE id = 1", [], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

module.exports = db;
