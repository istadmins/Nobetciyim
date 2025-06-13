// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Ana dizindeki db.js'e erişim
const { notifyAllOfDutyChange } = require('../telegram_bot_handler'); // Bildirim fonksiyonu
const crypto = require('crypto');

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
        console.log(`[API] Aktif nöbetçi manuel olarak değiştirildi: ${newActive.name}`);

        // Tüm kullanıcılara bildirim gönder
        await notifyAllOfDutyChange(newActive.name);

        res.json({ message: `Aktif nöbetçi başarıyla ${newActive.name} olarak ayarlandı.` });

    } catch (error) {
        console.error("[API /set-aktif] Hata:", error.message);
        res.status(500).json({ error: "Aktif nöbetçi ayarlanırken sunucuda bir hata oluştu." });
    }
});


// --- Arayüzün Düzgün Çalışması İçin Gerekli Diğer Rotalar ---

router.get('/', (req, res) => {
    db.all("SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
        if (err) res.status(500).json({ "error": err.message });
        else res.json(rows);
    });
});

router.post('/', (req, res) => {
    const { name, password, telegram_id, telefon_no } = req.body;
    db.run('INSERT INTO Nobetciler (name, password, telegram_id, telefon_no) VALUES (?, ?, ?, ?)', [name, password, telegram_id, telefon_no], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({ id: this.lastID });
    });
});

router.delete('/:id', (req, res) => {
    db.run('DELETE FROM Nobetciler WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Nöbetçi silindi' });
    });
});

router.post('/reset-password/:id', (req, res) => {
    const newPassword = crypto.randomBytes(4).toString('hex');
    db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [newPassword, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Nöbetçi bulunamadı.' });
        res.json({ newPassword });
    });
});

router.put('/:id/telegram-id', (req, res) => {
    db.run('UPDATE Nobetciler SET telegram_id = ? WHERE id = ?', [req.body.telegram_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Telegram ID güncellendi' });
    });
});

router.put('/:id/telefon-no', (req, res) => {
    db.run('UPDATE Nobetciler SET telefon_no = ? WHERE id = ?', [req.body.telefon_no, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Telefon numarası güncellendi' });
    });
});

router.put('/kredileri-guncelle', (req, res) => {
    const krediler = req.body;
    const promises = krediler.map(k => new Promise((resolve, reject) => {
        db.run('UPDATE Nobetciler SET kredi = ? WHERE id = ?', [k.kredi, k.id], (err) => err ? reject(err) : resolve());
    }));
    Promise.all(promises)
        .then(() => res.json({ message: 'Kazanılan krediler güncellendi' }))
        .catch(err => res.status(500).json({ error: err.message }));
});

router.put('/pay-edilen-kredileri-guncelle', (req, res) => {
    const krediler = req.body;
    const promises = krediler.map(k => new Promise((resolve, reject) => {
        db.run('UPDATE Nobetciler SET pay_edilen_kredi = ? WHERE id = ?', [k.pay_edilen_kredi, k.id], (err) => err ? reject(err) : resolve());
    }));
    Promise.all(promises)
        .then(() => res.json({ message: 'Pay edilen krediler güncellendi' }))
        .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
