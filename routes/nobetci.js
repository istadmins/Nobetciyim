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

// --- YENİ: ŞİFRE SIFIRLAMA ENDPOINT'İ ---
router.post('/reset-password/:id', async (req, res) => {
    const nobetciId = parseInt(req.params.id, 10);
    if (isNaN(nobetciId)) {
        return res.status(400).json({ success: false, error: "Geçersiz nöbetçi ID" });
    }
    try {
        const newPassword = crypto.randomBytes(4).toString('hex'); // 8 karakterli yeni şifre
        // NOT: Güvenli bir sistemde şifreler veritabanına doğrudan yazılmaz, hash'lenir.
        // Mevcut yapınızda hash'leme yoksa bu şekilde devam edilebilir.
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
