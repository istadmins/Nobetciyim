// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyAllOfDutyChange } = require('../telegram_bot_handler');
const crypto = require('crypto');

const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args)
};

// DÜZELTME: KREDİ PAY DAĞITIM ENDPOINT'İ
// Frontend'den gelen isteğin adresiyle tam uyumlu hale getirildi.
router.put('/guncelleKazanilanKrediler', (req, res) => {
    logger.info("Kredi pay dağıtım işlemi API üzerinden başlatıldı (/guncelleKazanilanKrediler).");
    db.serialize(() => {
        db.run("BEGIN TRANSACTION", (err) => {
            if (err) return res.status(500).json({ success: false, error: "Veritabanı işlemi başlatılamadı." });
        });

        db.all("SELECT id, kredi, pay_edilen_kredi FROM Nobetciler", [], (err, rows) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ success: false, error: "Nöbetçi bilgileri alınamadı." });
            }

            const updatePromises = rows.map(nobetci => {
                return new Promise((resolve, reject) => {
                    const yeniPayEdilenKredi = (nobetci.pay_edilen_kredi || 0) + (nobetci.kredi || 0);
                    db.run("UPDATE Nobetciler SET kredi = 0, pay_edilen_kredi = ? WHERE id = ?", [yeniPayEdilenKredi, nobetci.id], (updateErr) => {
                        if (updateErr) reject(updateErr);
                        else resolve();
                    });
                });
            });

            Promise.all(updatePromises).then(() => {
                db.run("COMMIT", (commitErr) => {
                    if (commitErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ success: false, error: "Değişiklikler kaydedilemedi." });
                    }
                    res.json({ success: true, message: "Kredi dağıtımı başarıyla tamamlandı." });
                });
            }).catch(promiseErr => {
                db.run("ROLLBACK");
                res.status(500).json({ success: false, error: "Krediler güncellenirken bir hata oluştu." });
            });
        });
    });
});

// YENİ: KULLANICI ADIYLA ŞİFRE SIFIRLAMA ENDPOINT'İ
// login.js'in "Şifre Sıfırla" butonu için kullanacağı adres.
router.post('/request-password-reset', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: "Kullanıcı adı gerekli." });
    }

    db.get("SELECT id FROM Nobetciler WHERE name = ?", [username], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Veritabanı hatası." });
        }
        if (!row) {
            return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
        }

        const newPassword = crypto.randomBytes(4).toString('hex');
        const userId = row.id;

        db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [newPassword, userId], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ success: false, message: "Şifre güncellenirken hata oluştu." });
            }
            logger.info(`Kullanıcı ${username} (ID: ${userId}) şifresi sıfırlandı.`);
            res.json({ success: true, newPassword: newPassword });
        });
    });
});


// --- AKTİF NÖBETÇİ DEĞİŞTİRME ---
router.post('/:id/set-aktif', async (req, res) => {
    const nobetciIdToSet = parseInt(req.params.id, 10);
    if (isNaN(nobetciIdToSet) || nobetciIdToSet <= 0) {
        return res.status(400).json({ success: false, error: "Geçersiz veya eksik nöbetçi ID'si." });
    }
    try {
        await db.setAktifNobetci(nobetciIdToSet);
        const newActive = await db.getNobetciById(nobetciIdToSet);
        if (!newActive) {
            return res.status(404).json({ success: false, error: 'Nöbetçi ayarlandı ancak teyit edilemedi.' });
        }
        logger.info(`Aktif nöbetçi API üzerinden başarıyla değiştirildi: ${newActive.name}`);
        notifyAllOfDutyChange(newActive.name).catch(err => logger.error("Telegram bildirimi gönderilemedi:", err.message));
        res.json({ success: true, message: `Aktif nöbetçi başarıyla ${newActive.name} olarak ayarlandı.` });
    } catch (error) {
        logger.error(`API /set-aktif Hata (ID: ${nobetciIdToSet}): ${error.message}`);
        res.status(500).json({ success: false, error: error.message || "Aktif nöbetçi ayarlanırken sunucuda bir hata oluştu." });
    }
});

// --- ŞİFRE SIFIRLAMA (ID ile - Panel içi kullanım için) ---
router.post('/reset-password/:id', async (req, res) => {
    const nobetciId = parseInt(req.params.id, 10);
    if (isNaN(nobetciId)) {
        return res.status(400).json({ success: false, error: "Geçersiz nöbetçi ID" });
    }
    try {
        const newPassword = crypto.randomBytes(4).toString('hex');
        db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [newPassword, nobetciId], function(err) {
            if (err) {
                logger.error(`Şifre sıfırlama DB hatası (ID: ${nobetciId}):`, err.message);
                return res.status(500).json({ success: false, error: "Veritabanı hatası oluştu." });
            }
            if (this.changes === 0) {
                return res.status(404).json({ success: false, error: "Nöbetçi bulunamadı." });
            }
            logger.info(`Kullanıcı ${nobetciId} şifresi sıfırlandı.`);
            res.json({ success: true, newPassword: newPassword });
        });
    } catch (error) {
        logger.error(`Şifre sıfırlama genel hata (ID: ${nobetciId}):`, error.message);
        res.status(500).json({ success: false, error: "Sunucu hatası oluştu." });
    }
});


// --- DİĞER ROTALAR ---
router.get('/', (req, res) => {
    db.all("SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
        if (err) {
            logger.error('Nöbetçiler getirilemedi:', err.message);
            res.status(500).json({ "error": err.message });
        } else {
            res.json(rows);
        }
    });
});

router.post('/', (req, res) => {
    const { name, password, telegram_id, telefon_no } = req.body;
    db.run('INSERT INTO Nobetciler (name, password, telegram_id, telefon_no) VALUES (?, ?, ?, ?)', [name, password, telegram_id, telefon_no], function(err) {
        if (err) {
            logger.error('Nöbetçi oluşturulamadı:', err.message);
            return res.status(400).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: `${name} başarıyla eklendi.` });
    });
});

module.exports = router;
