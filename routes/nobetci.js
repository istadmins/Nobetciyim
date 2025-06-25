// routes/nobetci.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const nodemailer = require('nodemailer');

function generateRandomPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*()+=;:,.?';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Şifre Sıfırlama - DETAYLI LOGLAMA İLE GÜNCELLENDİ
router.post('/reset-admin-password', (req, res) => {
    const adminUsername = 'admin';

    db.get('SELECT id, username FROM Users WHERE username = ?', [adminUsername], (err, user) => {
        if (err) {
            console.error(`[HATA] Admin kullanıcısı aranırken DB hatası:`, err.message);
            return res.status(500).json({ error: "Veritabanı hatası oluştu." });
        }
        if (!user) {
            console.error(`[HATA] '${adminUsername}' kullanıcısı veritabanında bulunamadı.`);
            return res.status(404).json({ error: `'${adminUsername}' kullanıcısı veritabanında bulunamadı.` });
        }

        const newPassword = generateRandomPassword(8);
        const hashedPassword = bcrypt.hashSync(newPassword, 10);

        db.run('UPDATE Users SET password = ? WHERE username = ?', [hashedPassword, adminUsername], async function(err) {
            if (err) {
                console.error(`[HATA] Admin şifresi güncellenirken DB hatası:`, err.message);
                return res.status(500).json({ error: "Şifre güncellenirken bir sunucu hatası oluştu." });
            }

            // E-posta gönderme işlemi
            try {
                const mailConfig = {
                    host: process.env.SES_SMTP_HOST,
                    port: parseInt(process.env.SES_SMTP_PORT || "587"),
                    secure: (process.env.SES_SMTP_PORT === '465'), // Port 465 ise true
                    auth: {
                        user: process.env.SES_SMTP_USER,
                        pass: process.env.SES_SMTP_PASSWORD,
                    },
                };
                
                // YENİ EKLENDİ: Hangi ayarlarla bağlanıldığını logla
                console.log(`[LOG] E-posta sunucusuna bağlanılıyor... Ayarlar: Host=${mailConfig.host}, Port=${mailConfig.port}, User=${mailConfig.auth.user}`);

                const transporter = nodemailer.createTransport(mailConfig);
                
                // YENİ EKLENDİ: Bağlantıyı doğrula
                await transporter.verify();
                console.log('[LOG] SMTP sunucu bağlantısı başarılı.');

                const mailOptions = {
                    from: `"Nöbetçi Sistemi" <${process.env.EMAIL_FROM_SES_SMTP}>`,
                    to: process.env.EMAIL_FROM_SES_SMTP,
                    subject: 'Admin Şifre Sıfırlama Bilgilendirmesi',
                    html: `Merhaba,<br><br><b>${user.username}</b> adlı kullanıcının şifresi başarıyla sıfırlanmıştır.<br><br>Yeni şifresi: <b>${newPassword}</b>`
                };

                // YENİ EKLENDİ: Gönderilecek e-posta detaylarını logla
                console.log(`[LOG] E-posta gönderiliyor... Kime: ${mailOptions.to}, Kimden: ${mailOptions.from}, Konu: ${mailOptions.subject}`);
                
                const info = await transporter.sendMail(mailOptions);
                
                // YENİ EKLENDİ: SMTP sunucusundan gelen başarılı yanıtı logla
                console.log(`[BAŞARILI] E-posta gönderildi. Sunucu yanıtı: ${info.response}`);
                res.json({ message: 'Admin şifresi sıfırlandı ve yöneticiye e-posta ile bildirildi.' });

            } catch (emailError) {
                // YENİ EKLENDİ: Hata durumunda detaylı loglama
                console.error("[HATA] E-posta gönderilirken kritik bir hata oluştu:", emailError);
                res.status(500).json({ message: 'Şifre sıfırlandı ancak bildirim e-postası gönderilemedi. Sunucu loglarını kontrol edin.' });
            }
        });
    });
});

// === DİĞER TÜM NÖBETÇİ İŞLEMLERİ OLDUĞU GİBİ BIRAKILDI ===
// (Bu kısım, bir önceki yanıttaki 'Nobetciler' tablosuyla çalışan tam kodun aynısıdır)
// ...
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
router.get('/', (req, res) => {
    db.all('SELECT id, name, kredi, is_aktif, pay_edilen_kredi, telegram_id, telefon_no FROM Nobetciler ORDER BY id ASC', [], (err, rows) => {
        if (err) {
            console.error("Tüm nöbetçiler getirilirken DB hatası:", err.message);
            return res.status(500).json({ error: "Sunucu hatası: Nöbetçiler alınamadı." });
        }
        res.json(rows);
    });
});
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
router.post('/:id/set-aktif', (req, res) => {
    const nobetciIdToActivate = parseInt(req.params.id);
    let newActiveGuardName = 'Bilinmiyor';
    db.serialize(() => {
        db.get("SELECT name FROM Nobetciler WHERE id = ?", [nobetciIdToActivate], (errName, rowName) => {
            if (errName) { console.error(`Aktif edilecek nöbetçi adı alınırken hata:`, errName.message); }
            else if (rowName) { newActiveGuardName = rowName.name; }
            db.run("UPDATE Nobetciler SET is_aktif = 0", function(errReset) {
                if (errReset) {
                    console.error("Aktif nöbetçi ayarlanırken (pasif) DB hatası:", errReset.message);
                    return res.status(500).json({ error: "Aktif nöbetçi ayarlanırken bir hata oluştu (adım 1)." });
                }
                db.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [nobetciIdToActivate], async function(errUpdate) {
                    if (errUpdate) {
                        console.error(`Aktif nöbetçi ayarlanırken (aktif) DB hatası:`, errUpdate.message);
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
router.put('/:id/telegram-id', (req, res) => {
    const nobetciId = parseInt(req.params.id);
    const { telegram_id } = req.body;
    const telegramIdToSave = (telegram_id && String(telegram_id).trim() !== "") ? String(telegram_id).trim() : null;
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
router.put('/:id/telefon-no', (req, res) => {
    const nobetciId = parseInt(req.params.id);
    const { telefon_no } = req.body;
    const telefonNoToSave = (telefon_no && String(telefon_no).trim() !== "") ? String(telefon_no).trim() : null;
    db.run("UPDATE Nobetciler SET telefon_no = ? WHERE id = ?", [telefonNoToSave, nobetciId], function(err) {
        if (err) {
            console.error(`Telefon No güncellenirken DB hatası (ID: ${nobetciId}):`, err.message);
            return res.status(500).json({ error: "Telefon numarası güncellenirken bir sunucu hatası oluştu." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: `Nöbetçi ID ${nobetciId} bulunamadı.` });
        }
        res.json({ message: `Nöbetçi ID ${nobetciId} için telefon numarası başarıyla güncellendi.` });
    });
});
router.put('/kredileri-guncelle', (req, res) => {
    const nobetciKredileri = req.body;
    if (!Array.isArray(nobetciKredileri) || nobetciKredileri.some(n => typeof n.id === 'undefined' || typeof n.kredi === 'undefined')) {
        return res.status(400).json({ error: 'Geçersiz veri formatı.' });
    }
    db.serialize(() => {
        const stmt = db.prepare("UPDATE Nobetciler SET kredi = ? WHERE id = ?");
        nobetciKredileri.forEach(nobetci => {
            stmt.run(nobetci.kredi, nobetci.id);
        });
        stmt.finalize();
        res.json({ message: `Krediler güncellendi.` });
    });
});
router.put('/pay-edilen-kredileri-guncelle', (req, res) => {
    const nobetciPayEdilenKredileri = req.body;
    if (!Array.isArray(nobetciPayEdilenKredileri) || nobetciPayEdilenKredileri.some(n => typeof n.id === 'undefined' || typeof n.pay_edilen_kredi === 'undefined')) {
        return res.status(400).json({ error: 'Geçersiz veri formatı.' });
    }
    db.serialize(() => {
        const stmt = db.prepare("UPDATE Nobetciler SET pay_edilen_kredi = ? WHERE id = ?");
        nobetciPayEdilenKredileri.forEach(nobetci => {
            stmt.run(nobetci.pay_edilen_kredi, nobetci.id);
        });
        stmt.finalize();
        res.json({ message: `Pay edilen krediler güncellendi.` });
    });
});

module.exports = router;
