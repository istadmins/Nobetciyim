// routes/nobetci.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyAllOfDutyChange } = require('../telegram_bot_handler');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); // E-posta için gerekli
const bcrypt = require('bcrypt'); // Şifreleme için gerekli

const logger = {
    info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args)
};

// DÜZELTME: KULLANICI ADIYLA ŞİFRE SIFIRLAMA VE E-POSTA GÖNDERME
// login.js'in "Şifre Sıfırla" butonu için kullanacağı DÜZELTİLMİŞ adres.
router.post('/request-password-reset', async (req, res) => {
    const { username } = req.body;
    if (!username || username !== 'admin') {
        return res.status(400).json({ success: false, error: "Sadece 'admin' kullanıcısı için şifre sıfırlanabilir." });
    }

    try {
        const user = await db.getNobetciByName(username);
        if (!user) {
            return res.status(404).json({ success: false, message: "Admin kullanıcısı bulunamadı." });
        }

        // 1. Yeni, rastgele bir şifre oluştur
        const newPassword = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 karakterlik yeni şifre
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // 2. Veritabanında admin şifresini güncelle
        await db.updatePassword(user.id, hashedNewPassword);
        logger.info(`Admin (ID: ${user.id}) şifresi veritabanında güncellendi.`);

        // 3. E-posta gönderme ayarlarını yap
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == 465, // port 465 ise true, değilse false
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        // 4. E-postayı gönder
        await transporter.sendMail({
            from: `"Nöbetçiyim Sistemi" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL, // .env dosyanızdaki admin e-postası
            subject: 'Admin Şifresi Sıfırlandı',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>Admin Hesabı Şifre Sıfırlama</h2>
                    <p>Merhaba,</p>
                    <p>Admin hesabınız için yeni bir şifre oluşturulmuştur.</p>
                    <p><b>Yeni Şifreniz:</b> <strong style="font-size: 1.2em; color: #d9534f;">${newPassword}</strong></p>
                    <p>Güvenliğiniz için, lütfen giriş yaptıktan sonra bu şifreyi panel ayarlarından değiştiriniz.</p>
                    <hr>
                    <p style="font-size: 0.8em; color: #777;">Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.</p>
                </div>
            `,
        });
        
        logger.info(`Admin şifre sıfırlama e-postası başarıyla ${process.env.ADMIN_EMAIL} adresine gönderildi.`);
        res.json({ success: true, message: 'Şifre sıfırlama e-postası başarıyla gönderildi.' });

    } catch (error) {
        logger.error('Şifre sıfırlama ve e-posta gönderme hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucuda bir hata oluştu. Lütfen logları kontrol edin.' });
    }
});


// --- DİĞER ROTALARINIZ OLDUĞU GİBİ KALIYOR ---

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

router.post('/reset-password/:id', async (req, res) => {
    const nobetciId = parseInt(req.params.id, 10);
    if (isNaN(nobetciId)) {
        return res.status(400).json({ success: false, error: "Geçersiz nöbetçi ID" });
    }
    try {
        const newPassword = crypto.randomBytes(4).toString('hex');
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await db.updatePassword(nobetciId, hashedNewPassword);
        logger.info(`Kullanıcı ${nobetciId} şifresi panelden sıfırlandı.`);
        res.json({ success: true, newPassword: newPassword });
    } catch (error) {
        logger.error(`Şifre sıfırlama genel hata (ID: ${nobetciId}):`, error.message);
        res.status(500).json({ success: false, error: "Sunucu hatası oluştu." });
    }
});

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
