// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const nodemailer = require('nodemailer'); // E-POSTA İÇİN GEREKLİ

// --- Telegram Bildirim Fonksiyonu ---
async function sendTelegramNotificationForActiveGuardChange(newActiveGuardName) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        console.warn("Telegram bot token veya chat ID eksik (.env). Aktif nöbetçi değişimi bildirimi gönderilemedi.");
        return;
    }
    const message = `🔔 Aktif Nöbetçi Değiştirildi (Liste Üzerinden) 🔔\nYeni aktif nöbetçi: *${newActiveGuardName}*`;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chatId, text: message, parse_mode: 'Markdown'
        });
        console.log("Aktif nöbetçi değişimi (liste üzerinden) için Telegram bildirimi başarıyla gönderildi:", message);
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Aktif nöbetçi değişimi (liste üzerinden) için Telegram bildirimi gönderilirken hata oluştu:", errorMessage);
    }
}

function generateRandomPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// ======================================================================================
// EKSİK OLAN VE YENİDEN EKLEDİĞİMİZ ADMIN ŞİFRE SIFIRLAMA ENDPOINT'İ
// ======================================================================================
router.post('/reset-admin-password', async (req, res) => {
    const adminUsername = 'admin'; // Sıfırlanacak kullanıcı adı

    try {
        // 1. Veritabanından admin kullanıcısını bul
        db.get('SELECT id FROM Nobetciler WHERE name = ?', [adminUsername], async (err, user) => {
            if (err) {
                console.error('Admin şifre sıfırlama (DB arama) hatası:', err.message);
                return res.status(500).json({ success: false, message: 'Veritabanı hatası oluştu.' });
            }
            if (!user) {
                return res.status(404).json({ success: false, message: 'Admin kullanıcısı bulunamadı.' });
            }

            // 2. Yeni şifre oluştur ve şifrele
            const newPassword = generateRandomPassword(8);
            const hashedPassword = bcrypt.hashSync(newPassword, 10);

            // 3. Veritabanında şifreyi güncelle
            db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [hashedPassword, user.id], async function(updateErr) {
                if (updateErr) {
                    console.error('Admin şifre sıfırlama (DB güncelleme) hatası:', updateErr.message);
                    return res.status(500).json({ success: false, message: 'Şifre güncellenirken hata oluştu.' });
                }

                // 4. E-posta gönder
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT,
                    secure: process.env.SMTP_PORT == 465, // port 465 ise true
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });

                await transporter.sendMail({
                    from: `"Nöbetçiyim Sistemi" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                    to: process.env.ADMIN_EMAIL, // .env dosyanızdaki admin e-postası
                    subject: 'Admin Şifresi Sıfırlandı',
                    html: `<p>Merhaba, admin hesabınızın şifresi sıfırlandı.</p><p><b>Yeni Şifreniz:</b> ${newPassword}</p>`
                });

                console.log(`Admin şifresi sıfırlandı ve e-posta ${process.env.ADMIN_EMAIL} adresine gönderildi.`);
                res.json({ success: true, message: 'Admin şifresi başarıyla sıfırlandı ve e-posta ile gönderildi.' });
            });
        });
    } catch (error) {
        console.error('Admin şifre sıfırlama genel hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucuda beklenmedik bir hata oluştu.' });
    }
});
// ======================================================================================
// MEVCUT KODUNUZ BURADAN AYNEN DEVAM EDİYOR
// ======================================================================================

// Yeni nöbetçi ekle
router.post('/', (req, res) => {
    const { name, password, telegram_id, telefon_no } = req.body;
    const initialKredi = 0;
    if (!name || !password) {
        return res.status(400).json({ error: 'İsim ve şifre alanları zorunludur.' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const telegramIdToSave = (telegram_id && String(telegram_id).trim() !== "") ? String(telegram_id).trim() : null;
    const telefonNoToSave = (telefon_no && String(telefon_no).trim() !== "") ? String(telefon_no).trim() : null;
    db.run('INSERT INTO Nobetciler (name, kredi, password, telegram_id, telefon_no, pay_edilen_kredi) VALUES (?, ?, ?, ?, ?, ?)',
        [name, initialKredi, hashedPassword, telegramIdToSave, telefonNoToSave, 0],
        function(err) {
            if (err) {
                console.error("Yeni nöbetçi eklenirken DB hatası:", err.message);
                if (err.message.includes("UNIQUE constraint failed: Nobetciler.telegram_id") && telegramIdToSave !== null) {
                    return res.status(400).json({ error: `Bu Telegram ID (${telegramIdToSave}) zaten başka bir nöbetçi tarafından kullanılıyor.` });
                }
                if (err.message.includes("UNIQUE constraint failed: Nobetciler.name")) {
                    return res.status(400).json({ error: `Bu isim (${name}) zaten başka bir nöbetçi tarafından kullanılıyor.` });
                }
                return res.status(500).json({ error: "Nöbetçi eklenirken bir sunucu hatası oluştu." });
            }
            res.status(201).json({
                id: this.lastID, name, kredi: initialKredi, telegram_id: telegramIdToSave, telefon_no: telefonNoToSave, pay_edilen_kredi: 0, message: "Nöbetçi başarıyla eklendi."
            });
        });
});

// Nöbetçi Sil
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM Nobetciler WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            console.error(`Nöbetçi silinirken DB hatası (ID: ${req.params.id}):`, err.message);
            return res.status(500).json({ error: "Nöbetçi silinirken bir sunucu hatası oluştu." });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Nöbetçi bulunamadı' });
        db.run("UPDATE takvim_aciklamalari SET nobetci_id_override = NULL WHERE nobetci_id_override = ?", [req.params.id]);
        res.json({ message: 'Nöbetçi başarıyla silindi' });
    });
});

// Şifre Sıfırlama (Panel içi)
router.post('/reset-password/:id', (req, res) => {
    const newPassword = generateRandomPassword(8);
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [hashedPassword, req.params.id], function(err) {
        if (err) {
            console.error(`Şifre sıfırlanırken DB hatası (ID: ${req.params.id}):`, err.message);
            return res.status(500).json({ error: "Şifre sıfırlanırken bir sunucu hatası oluştu." });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Nöbetçi bulunamadı' });
        res.json({ message: 'Şifre başarıyla sıfırlandı', newPassword });
    });
});

// Tüm nöbetçileri döndür
router.get('/', (req, res) => {
    db.all('SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler ORDER BY id ASC', [], (err, rows) => {
        if (err) {
            console.error("Tüm nöbetçiler getirilirken DB hatası:", err.message);
            return res.status(500).json({ error: "Sunucu hatası: Nöbetçiler alınamadı." });
        }
        res.json(rows);
    });
});

// Telegram ID ile nöbetçi bilgilerini getir
router.get('/by-telegram/:telegramId', (req, res) => {
    const telegramId = req.params.telegramId;
    if (!telegramId) {
        return res.status(400).json({ error: "Telegram ID parametresi eksik." });
    }
    db.get("SELECT id, name, telegram_id, telefon_no FROM Nobetciler WHERE telegram_id = ?", [telegramId], (err, row) => {
        if (err) {
            console.error(`Telegram ID (${telegramId}) ile nöbetçi aranırken DB hatası:`, err.message);
            return res.status(500).json({ error: "Nöbetçi bilgileri alınırken bir sunucu hatası oluştu." });
        }
        if (!row) {
            return res.status(404).json({ error: "Bu Telegram ID ile kayıtlı bir nöbetçi bulunamadı." });
        }
        res.json(row);
    });
});

// Bir nöbetçiyi aktif olarak ayarla
router.post('/:id/set-aktif', (req, res) => {
    const nobetciIdToActivate = parseInt(req.params.id);
    console.log(`[API] /api/nobetci/${nobetciIdToActivate}/set-aktif isteği alındı.`);
    let newActiveGuardName = 'Bilinmiyor';
    db.serialize(() => {
        db.get("SELECT name FROM Nobetciler WHERE id = ?", [nobetciIdToActivate], (errName, rowName) => {
            if (errName) { console.error(`Aktif edilecek nöbetçi (ID: ${nobetciIdToActivate}) adı alınırken hata:`, errName.message); }
            else if (rowName) { newActiveGuardName = rowName.name; }
            db.run("UPDATE Nobetciler SET is_aktif = 0", function(errReset) {
                if (errReset) {
                    console.error("Aktif nöbetçi ayarlanırken (pasif) DB hatası:", errReset.message);
                    return res.status(500).json({ error: "Aktif nöbetçi ayarlanırken bir hata oluştu (adım 1)." });
                }
                console.log("Tüm nöbetçiler pasif olarak ayarlandı.");
                db.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [nobetciIdToActivate], async function(errUpdate) {
                    if (errUpdate) {
                        console.error(`Aktif nöbetçi ayarlanırken (aktif) DB hatası (ID: ${nobetciIdToActivate}):`, errUpdate.message);
                        return res.status(500).json({ error: "Aktif nöbetçi ayarlanırken bir hata oluştu (adım 2)." });
                    }
                    if (this.changes === 0) { return res.status(404).json({ error: "Belirtilen ID ile nöbetçi bulunamadı." }); }
                    console.log(`Nöbetçi ${newActiveGuardName} (ID: ${nobetciIdToActivate}) aktif olarak ayarlandı.`);
                    await sendTelegramNotificationForActiveGuardChange(newActiveGuardName);
                    res.json({ message: `Nöbetçi ${newActiveGuardName} (ID: ${nobetciIdToActivate}) aktif olarak ayarlandı.` });
                });
            });
        });
    });
});

// Bir nöbetçinin Telegram ID'sini güncelle
router.put('/:id/telegram-id', (req, res) => {
    const nobetciId = parseInt(req.params.id);
    const { telegram_id } = req.body;
    const telegramIdToSave = (telegram_id && String(telegram_id).trim() !== "") ? String(telegram_id).trim() : null;
    console.log(`[API] Nöbetçi ID ${nobetciId} için Telegram ID güncelleme isteği: ${telegramIdToSave}`);
    db.run("UPDATE Nobetciler SET telegram_id = ? WHERE id = ?", [telegramIdToSave, nobetciId], function(err) {
        if (err) {
            console.error(`Telegram ID güncellenirken DB hatası (ID: ${nobetciId}):`, err.message);
            if (err.message.includes("UNIQUE constraint failed: Nobetciler.telegram_id") && telegramIdToSave !== null) {
                return res.status(400).json({ error: `Bu Telegram ID (${telegramIdToSave}) zaten başka bir nöbetçi tarafından kullanılıyor.` });
            }
            return res.status(500).json({ error: "Telegram ID güncellenirken bir sunucu hatası oluştu." });
        }
        if (this.changes === 0) { return res.status(404).json({ error: `Nöbetçi ID ${nobetciId} bulunamadı.` }); }
        res.json({ message: `Nöbetçi ID ${nobetciId} için Telegram ID başarıyla güncellendi.` });
    });
});

// Bir nöbetçinin Telefon Numarasını güncelle
router.put('/:id/telefon-no', (req, res) => {
    const nobetciId = parseInt(req.params.id);
    const { telefon_no } = req.body;
    const telefonNoToSave = (telefon_no && String(telefon_no).trim() !== "") ? String(telefon_no).trim() : null;
    console.log(`[API] Nöbetçi ID ${nobetciId} için Telefon No güncelleme isteği: ${telefonNoToSave}`);
    db.run("UPDATE Nobetciler SET telefon_no = ? WHERE id = ?",
        [telefonNoToSave, nobetciId],
        function(err) {
            if (err) {
                console.error(`Telefon No güncellenirken DB hatası (ID: ${nobetciId}):`, err.message);
                return res.status(500).json({ error: "Telefon numarası güncellenirken bir sunucu hatası oluştu." });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: `Nöbetçi ID ${nobetciId} bulunamadı.` });
            }
            res.json({ message: `Nöbetçi ID ${nobetciId} için telefon numarası başarıyla güncellendi.` });
        }
    );
});

// Kredi güncelleme endpoint'leri
router.put('/kredileri-guncelle', (req, res) => {
    const nobetciKredileri = req.body;
    if (!Array.isArray(nobetciKredileri) || nobetciKredileri.some(n => typeof n.id === 'undefined' || typeof n.kredi === 'undefined')) {
        return res.status(400).json({ error: 'Geçersiz veri formatı. [{id, kredi}, ...] bekleniyor.' });
    }
    db.serialize(() => {
        const stmt = db.prepare("UPDATE Nobetciler SET kredi = ? WHERE id = ?");
        let errors = [];
        let updatedCount = 0;
        nobetciKredileri.forEach(nobetci => {
            stmt.run(nobetci.kredi, nobetci.id, function(err) {
                if (err) errors.push(`ID ${nobetci.id} için "kredi" güncellenirken hata: ${err.message}`);
                else if (this.changes > 0) updatedCount++;
            });
        });
        stmt.finalize((err) => {
            if (err) errors.push(`Statement finalize hatası (kredi): ${err.message}`);
            if (errors.length > 0) {
                return res.status(500).json({ error: "Bazı kazanılan krediler güncellenirken hatalar oluştu.", details: errors });
            }
            res.json({ message: `${updatedCount} nöbetçinin kazanılan kredisi güncellendi.` });
        });
    });
});

router.put('/pay-edilen-kredileri-guncelle', (req, res) => {
    const nobetciPayEdilenKredileri = req.body;
    if (!Array.isArray(nobetciPayEdilenKredileri) || nobetciPayEdilenKredileri.some(n => typeof n.id === 'undefined' || typeof n.pay_edilen_kredi === 'undefined')) {
        return res.status(400).json({ error: 'Geçersiz veri formatı. [{id, pay_edilen_kredi}, ...] bekleniyor.' });
    }
    db.serialize(() => {
        const stmt = db.prepare("UPDATE Nobetciler SET pay_edilen_kredi = ? WHERE id = ?");
        let errors = [];
        let updatedCount = 0;
        nobetciPayEdilenKredileri.forEach(nobetci => {
            stmt.run(nobetci.pay_edilen_kredi, nobetci.id, function(err) {
                if (err) errors.push(`ID ${nobetci.id} için "pay_edilen_kredi" güncellenirken hata: ${err.message}`);
                else if (this.changes > 0) updatedCount++;
            });
        });
        stmt.finalize((err) => {
            if (err) errors.push(`Statement finalize hatası (pay_edilen_kredi): ${err.message}`);
            if (errors.length > 0) {
                return res.status(500).json({ error: "Bazı pay edilen krediler güncellenirken hatalar oluştu.", details: errors });
            }
            res.json({ message: `${updatedCount} nöbetçinin pay edilen kredisi güncellendi.` });
        });
    });
});

module.exports = router;
