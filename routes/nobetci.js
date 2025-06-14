// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Ana dizindeki db.js'e erişim
const { notifyAllOfDutyChange } = require('../telegram_bot_handler'); // Bildirim fonksiyonu
const crypto = require('crypto');

// Simple console logger
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

// AKTİF NÖBETÇİYİ DEĞİŞTİRİR VE BİLDİRİM GÖNDERİR
router.post('/:id/set-aktif', async (req, res) => {
    const nobetciIdToSet = req.params.id;
    try {
        const currentActive = await db.getAktifNobetci();
        const newActive = await db.getNobetciById(nobetciIdToSet);

        if (!newActive) {
            return res.status(404).json({ error: "Ayarlanmak istenen nöbetçi bulunamadı." });
        }

        if (currentActive && currentActive.id === parseInt(nobetciIdToSet)) {
            return res.json({ message: `${newActive.name} zaten aktif nöbetçi.` });
        }
        
        await db.setAktifNobetci(nobetciIdToSet);
        logger.info(`Aktif nöbetçi manuel olarak değiştirildi: ${newActive.name}`);

        // Tüm kullanıcılara bildirim gönder
        await notifyAllOfDutyChange(newActive.name);

        res.json({ message: `Aktif nöbetçi başarıyla ${newActive.name} olarak ayarlandı.` });

    } catch (error) {
        logger.error("API /set-aktif Hata:", error.message);
        res.status(500).json({ error: "Aktif nöbetçi ayarlanırken sunucuda bir hata oluştu." });
    }
});

// --- Arayüzün Düzgün Çalışması İçin Gerekli Diğer Rotalar ---

router.get('/', (req, res) => {
    db.all("SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
        if (err) {
            logger.error('Failed to get nobetciler:', err);
            res.status(500).json({ "error": err.message });
        } else {
            logger.debug(`Retrieved ${rows.length} nobetciler from database`);
            res.json(rows);
        }
    });
});

router.post('/', (req, res) => {
    const { name, password, telegram_id, telefon_no } = req.body;
    logger.info(`Creating new nobetci: ${name}`);
    
    db.run('INSERT INTO Nobetciler (name, password, telegram_id, telefon_no) VALUES (?, ?, ?, ?)', [name, password, telegram_id, telefon_no], function(err) {
        if (err) {
            logger.error('Failed to create nobetci:', err);
            return res.status(400).json({ error: err.message });
        }
        logger.info(`Successfully created nobetci: ${name} with ID: ${this.lastID}`);
        res.status(201).json({ id: this.lastID });
    });
});

router.delete('/:id', (req, res) => {
    logger.info(`Deleting nobetci with ID: ${req.params.id}`);
    
    db.run('DELETE FROM Nobetciler WHERE id = ?', req.params.id, function(err) {
        if (err) {
            logger.error('Failed to delete nobetci:', err);
            return res.status(500).json({ error: err.message });
        }
        logger.info(`Successfully deleted nobetci with ID: ${req.params.id}`);
        res.json({ message: 'Nöbetçi silindi' });
    });
});

router.post('/reset-password/:id', (req, res) => {
    const newPassword = crypto.randomBytes(4).toString('hex');
    logger.info(`Resetting password for nobetci ID: ${req.params.id}`);
    
    db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [newPassword, req.params.id], function(err) {
        if (err) {
            logger.error('Failed to reset password:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            logger.warn(`No nobetci found with ID: ${req.params.id} for password reset`);
            return res.status(404).json({ error: 'Nöbetçi bulunamadı.' });
        }
        logger.info(`Successfully reset password for nobetci ID: ${req.params.id}, new password: ${newPassword}`);
        res.json({ newPassword });
    });
});

router.put('/:id/telegram-id', (req, res) => {
    logger.info(`Updating Telegram ID for nobetci ID: ${req.params.id} to: ${req.body.telegram_id}`);
    
    db.run('UPDATE Nobetciler SET telegram_id = ? WHERE id = ?', [req.body.telegram_id, req.params.id], function(err) {
        if (err) {
            logger.error('Failed to update Telegram ID:', err);
            return res.status(500).json({ error: err.message });
        }
        logger.info(`Successfully updated Telegram ID for nobetci ID: ${req.params.id}`);
        res.json({ message: 'Telegram ID güncellendi' });
    });
});

router.put('/:id/telefon-no', (req, res) => {
    logger.info(`Updating phone number for nobetci ID: ${req.params.id} to: ${req.body.telefon_no}`);
    
    db.run('UPDATE Nobetciler SET telefon_no = ? WHERE id = ?', [req.body.telefon_no, req.params.id], function(err) {
        if (err) {
            logger.error('Failed to update phone number:', err);
            return res.status(500).json({ error: err.message });
        }
        logger.info(`Successfully updated phone number for nobetci ID: ${req.params.id}`);
        res.json({ message: 'Telefon numarası güncellendi' });
    });
});

// CREDIT UPDATE WITH DETAILED LOGGING
router.put('/kredileri-guncelle', (req, res) => {
    const krediler = req.body;
    logger.info(`🏆 CREDIT UPDATE STARTED: Updating credits for ${krediler.length} users`);
    
    // Log each credit update
    krediler.forEach(k => {
        logger.info(`🏆 CREDIT UPDATE: User ID ${k.id} -> ${k.kredi} credits`);
    });
    
    const promises = krediler.map(k => new Promise((resolve, reject) => {
        db.run('UPDATE Nobetciler SET kredi = ? WHERE id = ?', [k.kredi, k.id], (err) => {
            if (err) {
                logger.error(`🏆 CREDIT UPDATE ERROR: Failed to update credits for user ID ${k.id}:`, err);
                reject(err);
            } else {
                logger.info(`🏆 CREDIT UPDATE SUCCESS: User ID ${k.id} credits updated to ${k.kredi}`);
                resolve();
            }
        });
    }));
    
    Promise.all(promises)
        .then(() => {
            logger.info('🏆 CREDIT UPDATE COMPLETED: All credit updates finished successfully');
            res.json({ message: 'Kazanılan krediler güncellendi' });
        })
        .catch(err => {
            logger.error('🏆 CREDIT UPDATE FAILED:', err);
            res.status(500).json({ error: err.message });
        });
});

// PAY EDILEN CREDIT UPDATE WITH DETAILED LOGGING
router.put('/pay-edilen-kredileri-guncelle', (req, res) => {
    const krediler = req.body;
    logger.info(`💰 PAY CREDIT UPDATE STARTED: Updating pay credits for ${krediler.length} users`);
    
    // Log each pay credit update
    krediler.forEach(k => {
        logger.info(`💰 PAY CREDIT UPDATE: User ID ${k.id} -> ${k.pay_edilen_kredi} pay credits`);
    });
    
    const promises = krediler.map(k => new Promise((resolve, reject) => {
        db.run('UPDATE Nobetciler SET pay_edilen_kredi = ? WHERE id = ?', [k.pay_edilen_kredi, k.id], (err) => {
            if (err) {
                logger.error(`💰 PAY CREDIT UPDATE ERROR: Failed to update pay credits for user ID ${k.id}:`, err);
                reject(err);
            } else {
                logger.info(`💰 PAY CREDIT UPDATE SUCCESS: User ID ${k.id} pay credits updated to ${k.pay_edilen_kredi}`);
                resolve();
            }
        });
    }));
    
    Promise.all(promises)
        .then(() => {
            logger.info('💰 PAY CREDIT UPDATE COMPLETED: All pay credit updates finished successfully');
            res.json({ message: 'Pay edilen krediler güncellendi' });
        })
        .catch(err => {
            logger.error('💰 PAY CREDIT UPDATE FAILED:', err);
            res.status(500).json({ error: err.message });
        });
});

module.exports = router;