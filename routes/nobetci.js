// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Ana dizindeki db.js'e erişim
const { notifyAllOfDutyChange } = require('../telegram_bot_handler'); // Bildirim fonksiyonu
const crypto = require('crypto');

// Hatalı 'require' kaldırıldı. Yerine basit console log kullanılıyor.
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args)
};

// -----------------------------------------------------------------------------
// --- YENİ VE GÜVENLİ AKTİF NÖBETÇİ DEĞİŞTİRME ROTASI ---
// -----------------------------------------------------------------------------
router.post('/:id/set-aktif', async (req, res) => {
    // 1. ID'yi al ve number'a (tam sayıya) çevir.
    const nobetciIdToSet = parseInt(req.params.id, 10);

    // 2. ID'nin geçerli bir sayı olup olmadığını kontrol et.
    if (isNaN(nobetciIdToSet) || nobetciIdToSet <= 0) {
        logger.warn(`Geçersiz set-aktif denemesi. Gelen ID: ${req.params.id}`);
        return res.status(400).json({ success: false, error: "Geçersiz veya eksik nöbetçi ID'si." });
    }

    try {
        // 3. Güvenli veritabanı fonksiyonunu çağır (db.js'teki yeni fonksiyonu).
        await db.setAktifNobetci(nobetciIdToSet);

        // 4. İşlem sonrası teyit için nöbetçi bilgisini al
        const newActive = await db.getNobetciById(nobetciIdToSet);
        if (!newActive) {
            logger.error(`setAktifNobetci başarılı oldu ama ardından ${nobetciIdToSet} ID'li nöbetçi bulunamadı.`);
            return res.status(404).json({ success: false, error: 'Nöbetçi ayarlandı ancak teyit edilemedi.' });
        }
        
        logger.info(`Aktif nöbetçi API üzerinden başarıyla değiştirildi: ${newActive.name}`);

        // 5. Telegram'a bildirim gönder (hata verirse bile işlemi durdurma).
        notifyAllOfDutyChange(newActive.name).catch(err => {
            logger.error("set-aktif sonrası Telegram bildirimi gönderilemedi:", err.message);
        });
        
        // 6. Başarılı yanıtı gönder.
        res.json({ 
            success: true, 
            message: `Aktif nöbetçi başarıyla ${newActive.name} olarak ayarlandı.` 
        });

    } catch (error) {
        // 7. Detaylı hata yönetimi.
        logger.error(`API /set-aktif Hata (ID: ${nobetciIdToSet}): ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Aktif nöbetçi ayarlanırken sunucuda bir hata oluştu." 
        });
    }
});


// --- MEVCUT DİĞER ROTALAR ---

// Tüm nöbetçileri listele
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

// Yeni nöbetçi ekle
router.post('/', (req, res) => {
    const { name, password, telegram_id, telefon_no } = req.body;
    logger.info(`Yeni nöbetçi oluşturuluyor: ${name}`);
    // Not: Şifreler her zaman hash'lenmelidir. Bu örnekte basitlik için düz metin varsayılmıştır.
    db.run('INSERT INTO Nobetciler (name, password, telegram_id, telefon_no) VALUES (?, ?, ?, ?)', [name, password, telegram_id, telefon_no], function(err) {
        if (err) {
            logger.error('Nöbetçi oluşturulamadı:', err.message);
            return res.status(400).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: `${name} başarıyla eklendi.` });
    });
});


module.exports = router;
