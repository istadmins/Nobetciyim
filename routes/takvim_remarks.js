// routes/takvim_remarks.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios'); // Telegram API'sine istek göndermek için

// --- Telegram Bildirim Fonksiyonu ---
async function sendTelegramNotification(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("Telegram bot token veya chat ID eksik. .env dosyasını kontrol edin. Bildirim gönderilemedi.");
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown' // İsteğe bağlı: Mesaj formatlaması için (örn: *kalın*, _italik_)
        });
        console.log("Telegram bildirimi başarıyla gönderildi:", message);
    } catch (error) {
        console.error("Telegram bildirimi gönderilirken hata oluştu:", error.response ? error.response.data : error.message);
    }
}

// Belirli bir yıla ait tüm takvim açıklamalarını ve manuel nöbetçi atamalarını getir
router.get('/', (req, res) => {
    const { yil } = req.query;

    if (!yil) {
        return res.status(400).json({ error: 'Yıl parametresi zorunludur.' });
    }

    const sql = `
        SELECT ta.yil, ta.hafta, ta.aciklama, ta.nobetci_id_override, n.name as nobetci_adi_override
        FROM takvim_aciklamalari ta
        LEFT JOIN Nobetciler n ON n.id = ta.nobetci_id_override
        WHERE ta.yil = ?
    `;
    db.all(sql, [parseInt(yil)], (err, rows) => {
        if (err) {
            console.error("Takvim verileri (remarks GET) getirilirken DB hatası:", err.message);
            return res.status(500).json({ error: "Takvim verileri alınırken bir sunucu hatası oluştu." });
        }
        res.json(rows);
    });
});

// Yeni bir takvim açıklaması/manuel nöbetçi ataması ekle veya mevcut olanı güncelle
router.post('/', (req, res) => {
    const { yil, hafta, aciklama, nobetci_id_override } = req.body;
    console.log(`POST /api/remarks isteği alındı:`, req.body);

    if (typeof yil === 'undefined' || typeof hafta === 'undefined') {
        console.error("POST /api/remarks - Eksik parametreler: yil veya hafta tanımsız.");
        return res.status(400).json({ error: 'yil ve hafta alanları zorunludur.' });
    }

    const nobetciIdToSave = (typeof nobetci_id_override !== 'undefined' && nobetci_id_override !== null && !isNaN(parseInt(nobetci_id_override)))
                            ? parseInt(nobetci_id_override)
                            : null;
    const aciklamaToSave = (typeof aciklama === 'undefined') ? "" : aciklama;

    console.log(`Veritabanına kaydedilecek veriler: Yil: ${yil}, Hafta: ${hafta}, Açıklama: '${aciklamaToSave}', OverrideID: ${nobetciIdToSave}`);

    // Önce mevcut durumu alalım (eğer varsa) bildirim için
    db.get("SELECT nobetci_id_override FROM takvim_aciklamalari WHERE yil = ? AND hafta = ?", [parseInt(yil), parseInt(hafta)], (err, currentRow) => {
        if (err) {
            console.error("Mevcut nöbetçi bilgisi alınırken DB hatası:", err.message);
            // Hata olsa bile kaydetmeye devam et, bildirim gönderilemeyebilir sadece.
        }
        const previousNobetciId = currentRow ? currentRow.nobetci_id_override : null;

        const stmt = db.prepare(`
            INSERT INTO takvim_aciklamalari (yil, hafta, aciklama, nobetci_id_override)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(yil, hafta) DO UPDATE SET
            aciklama = excluded.aciklama,
            nobetci_id_override = excluded.nobetci_id_override
        `);

        stmt.run(parseInt(yil), parseInt(hafta), aciklamaToSave, nobetciIdToSave, async function(runErr) { // async eklendi
            if (runErr) {
                console.error("Takvim verisi (remark/override POST) kaydedilirken DB hatası:", runErr.message, { yil, hafta, aciklamaToSave, nobetciIdToSave });
                return res.status(500).json({ error: "Takvim verisi kaydedilirken bir sunucu hatası oluştu." });
            }
            console.log(`Takvim verisi POST başarılı: Yil: ${yil}, Hafta: ${hafta}, Açıklama: '${aciklamaToSave}', OverrideID: ${nobetciIdToSave}. Etkilenen satır(lar): ${this.changes}, Son Eklenen ID (eğer yeni ise): ${this.lastID}`);
            
            // Bildirim gönder (eğer nöbetçi değiştiyse)
            if (this.changes > 0 && nobetciIdToSave !== previousNobetciId) {
                let nobetciAdi = 'Bilinmiyor';
                if (nobetciIdToSave !== null) {
                    try {
                        const nobetci = await new Promise((resolve, reject) => {
                            db.get("SELECT name FROM Nobetciler WHERE id = ?", [nobetciIdToSave], (errNob, rowNob) => {
                                if (errNob) reject(errNob);
                                else resolve(rowNob);
                            });
                        });
                        if (nobetci) nobetciAdi = nobetci.name;
                    } catch (dbErr) {
                        console.error("Bildirim için nöbetçi adı alınırken hata:", dbErr.message);
                    }
                }
                
                let mesaj;
                if (nobetciIdToSave !== null) {
                    mesaj = `🗓️ Nöbet Değişikliği 🗓️\n*Yıl:* ${yil}, *Hafta:* ${hafta}\n*Yeni Nöbetçi:* ${nobetciAdi}\n*Açıklama:* ${aciklamaToSave || "(Belirtilmemiş)"}`;
                } else {
                    mesaj = `🗓️ Nöbet Değişikliği 🗓️\n*Yıl:* ${yil}, *Hafta:* ${hafta}\nManuel nöbetçi ataması kaldırıldı. Açıklama: ${aciklamaToSave || "(Belirtilmemiş)"}`;
                }
                sendTelegramNotification(mesaj);
            }

            res.status(201).json({ message: "Takvim verisi başarıyla kaydedildi/güncellendi.", insertedId: this.lastID, changes: this.changes });
        });
        stmt.finalize();
    });
});

// Belirli bir haftadaki manuel nöbetçi atamasını sil (açıklamayı koru)
router.delete('/manual-assignment', (req, res) => {
    const { yil, hafta } = req.query;
    console.log(`DELETE /api/remarks/manual-assignment isteği alındı: Yıl: ${yil}, Hafta: ${hafta}`);

    if (typeof yil === 'undefined' || typeof hafta === 'undefined') {
        return res.status(400).json({ error: 'yil ve hafta parametreleri zorunludur.' });
    }

    // Önce mevcut durumu alalım (eğer varsa) bildirim için
    db.get("SELECT nobetci_id_override FROM takvim_aciklamalari WHERE yil = ? AND hafta = ?", [parseInt(yil), parseInt(hafta)], (err, currentRow) => {
        if (err) {
            console.error("Manuel atama silinirken mevcut nöbetçi bilgisi alınamadı:", err.message);
        }
        const previousNobetciId = currentRow ? currentRow.nobetci_id_override : null;

        db.run(
            'UPDATE takvim_aciklamalari SET nobetci_id_override = NULL WHERE yil = ? AND hafta = ?',
            [parseInt(yil), parseInt(hafta)],
            async function(runErr) { // async eklendi
                if (runErr) {
                    console.error("Manuel nöbetçi ataması silinirken DB hatası:", runErr.message);
                    return res.status(500).json({ error: "Manuel nöbetçi ataması silinirken bir sunucu hatası oluştu." });
                }
                console.log(`Manuel nöbetçi ataması silindi: Yıl: ${yil}, Hafta: ${hafta}. Etkilenen satır(lar): ${this.changes}`);
                
                // Bildirim gönder (eğer gerçekten bir atama kaldırıldıysa)
                if (this.changes > 0 && previousNobetciId !== null) {
                    const mesaj = `🗓️ Nöbet Ataması Kaldırıldı 🗓️\n*Yıl:* ${yil}, *Hafta:* ${hafta}\nBu hafta için manuel nöbetçi ataması kaldırıldı, varsayılan sıralama geçerli olacak.`;
                    sendTelegramNotification(mesaj);
                }
                res.json({ message: 'Manuel nöbetçi ataması başarıyla kaldırıldı (varsayılana dönüldü).' });
            }
        );
    });
});

module.exports = router;
