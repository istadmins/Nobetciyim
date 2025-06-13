// routes/takvim_remarks.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyAllOfDutyChange } = require('../telegram_bot_handler');

function getWeekOfYear(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
}

router.get('/', (req, res) => {
    const { yil } = req.query;
    if (!yil) return res.status(400).json({ error: "Yıl parametresi eksik." });
    const sql = `
        SELECT ta.yil, ta.hafta, ta.aciklama, ta.nobetci_id_override, n.name as nobetci_adi_override
        FROM takvim_aciklamalari ta
        LEFT JOIN Nobetciler n ON n.id = ta.nobetci_id_override
        WHERE ta.yil = ?
    `;
    db.all(sql, [yil], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// TAKVİM ÜZERİNDEN ATAMA YAPAR VE BİLDİRİM GÖNDERİR
router.post('/', async (req, res) => {
    const { yil, hafta, aciklama, nobetci_id_override } = req.body;
    const sql = `
        INSERT INTO takvim_aciklamalari (yil, hafta, aciklama, nobetci_id_override)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(yil, hafta) DO UPDATE SET
        aciklama = excluded.aciklama,
        nobetci_id_override = excluded.nobetci_id_override;
    `;
    try {
        await db.run(sql, [yil, hafta, aciklama, nobetci_id_override]);

        const now = new Date();
        if (parseInt(yil) === now.getFullYear() && parseInt(hafta) === getWeekOfYear(now) && nobetci_id_override) {
            console.log("[API /remarks] Mevcut haftayı etkileyen bir manuel atama yapıldı.");
            const currentActive = await db.getAktifNobetci();
            const newActive = await db.getNobetciById(nobetci_id_override);

            if (newActive && (!currentActive || currentActive.id !== newActive.id)) {
                await db.setAktifNobetci(newActive.id);
                console.log(`[API /remarks] Takvimden aktif nöbetçi değiştirildi: ${newActive.name}`);
                await notifyAllOfDutyChange(newActive.name);
            }
        }
        
        res.json({ message: "Takvim verisi başarıyla kaydedildi." });
    } catch (err) {
        console.error("[API /remarks] Hata:", err.message);
        res.status(500).json({ error: "Takvim verisi kaydedilirken bir hata oluştu." });
    }
});

module.exports = router;
