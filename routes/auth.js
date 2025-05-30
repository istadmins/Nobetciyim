// routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Bu yolun db.js dosyanıza göre doğru olduğundan emin olun
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Mevcut /login route'unuz
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Eksik bilgi' });

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ success: false, error: 'Sunucu hatası' });
    if (!user) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });

    bcrypt.compare(password, user.password, (bcryptErr, result) => {
      if (bcryptErr) return res.status(500).json({ success: false, error: 'Sunucu hatası' });
      if (!result) return res.status(401).json({ success: false, error: 'Geçersiz şifre' });

      const token = require('jsonwebtoken').sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET, // JWT_SECRET .env dosyanızda tanımlı olmalı
        { expiresIn: '8h' }
      );
      res.json({ success: true, token, username: user.username });
    });
  });
});


// Şifre sıfırlama isteğini başlat (Amazon SES SMTP ile)
router.post('/initiate-password-reset', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Kullanıcı adı gereklidir.' });
    }

    try {
        db.get("SELECT id, email FROM users WHERE username = ?", [username], async (err, user) => {
            if (err) {
                console.error("Şifre sıfırlama - Kullanıcı bulunurken DB hatası:", err.message);
                return res.status(500).json({ success: false, message: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.' });
            }
            if (!user) {
                return res.status(404).json({ success: false, message: `Kullanıcı "${username}" bulunamadı.` });
            }
            if (!user.email) {
                return res.status(400).json({ success: false, message: `"${username}" kullanıcısı için kayıtlı bir e-posta adresi bulunmamaktadır.` });
            }

            const newPassword = crypto.randomBytes(4).toString('hex');
            const hashedNewPassword = bcrypt.hashSync(newPassword, 10);

            db.run("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, user.id], async function(updateErr) {
                if (updateErr) {
                    console.error("Şifre sıfırlama - Şifre güncellenirken DB hatası:", updateErr.message);
                    return res.status(500).json({ success: false, message: 'Veritabanında şifre güncellenirken bir hata oluştu.' });
                }

                // Konsolda .env değişkenlerini kontrol et (Sorun giderme için)
                // console.log("ENV - SES_SMTP_HOST:", process.env.SES_SMTP_HOST);
                // console.log("ENV - SES_SMTP_PORT:", process.env.SES_SMTP_PORT);
                // console.log("ENV - SES_SMTP_USER:", process.env.SES_SMTP_USER);
                // console.log("ENV - SES_SMTP_PASSWORD:", process.env.SES_SMTP_PASSWORD ? "Mevcut" : "Bulunamadı");
                // console.log("ENV - EMAIL_FROM_SES_SMTP:", process.env.EMAIL_FROM_SES_SMTP);


                // Nodemailer transporter yapılandırması (Amazon SES SMTP ile)
                const transporter = nodemailer.createTransport({
                    host: process.env.SES_SMTP_HOST,
                    port: parseInt(process.env.SES_SMTP_PORT || "587"),
                    secure: (process.env.SES_SMTP_PORT === '465'), // true for 465, false for other ports (TLS/STARTTLS)
                    auth: {
                        user: process.env.SES_SMTP_USER, // .env'deki SES_SMTP_USER
                        pass: process.env.SES_SMTP_PASSWORD, // .env'deki SES_SMTP_PASSWORD
                    },
                    // Geliştirme ortamında self-signed sertifikalara izin vermek için tls ayarı gerekebilir
                    // Ancak Amazon SES genellikle geçerli sertifikalar kullandığı için buna ihtiyaç olmamalıdır.
                    // Eğer SSL/TLS bağlantı hataları alırsanız ve SES endpoint'i ile ilgili değilse,
                    // ağınızdaki bir proxy/firewall buna neden oluyor olabilir.
                    // tls: {
                    //     rejectUnauthorized: process.env.NODE_ENV === 'production' // Canlıda true, geliştirme için false olabilir
                    // }
                });

                const mailOptions = {
                    from: process.env.EMAIL_FROM_SES_SMTP, // .env'den gelen SES gönderici adresi
                    to: user.email,
                    subject: 'Nobetciyim Uygulaması - Şifre Sıfırlama',
                    text: `Merhaba ${username},\n\nİsteğiniz üzerine şifreniz sıfırlanmıştır.\nYeni şifreniz: ${newPassword}\n\nBu isteği siz yapmadıysanız, lütfen bu e-postayı dikkate almayın.`,
                    html: `<p>Merhaba ${username},</p><p>İsteğiniz üzerine şifreniz sıfırlanmıştır.</p><p>Yeni şifreniz: <strong>${newPassword}</strong></p><p>Bu isteği siz yapmadıysanız, lütfen bu e-postayı dikkate almayın.</p>`
                };

                try {
                    console.log("E-posta gönderilmeye çalışılıyor (SES SMTP)... Alıcı:", user.email, "Gönderici:", process.env.EMAIL_FROM_SES_SMTP);
                    await transporter.sendMail(mailOptions);
                    console.log(`Şifre sıfırlama e-postası ${user.email} adresine başarıyla gönderildi (SES SMTP). Yeni şifre: ${newPassword}`);
                    return res.json({ success: true, message: 'Yeni şifreniz, kayıtlı e-posta adresinize başarıyla gönderildi.' });
                } catch (emailError) {
                    console.error("Şifre sıfırlama - E-posta gönderilirken hata (SES SMTP):", emailError);
                    return res.status(500).json({
                        success: false,
                        message: `Şifreniz veritabanında güncellendi ancak e-posta gönderilirken bir sorun oluştu: ${emailError.message}. Lütfen Amazon SES SMTP ayarlarınızı ve .env dosyanızı kontrol edin.`
                    });
                }
            });
        });
    } catch (error) {
        console.error("Şifre sıfırlama isteği işlenirken genel hata:", error);
        return res.status(500).json({ success: false, message: 'Sunucuda beklenmedik bir hata oluştu. Lütfen daha sonra tekrar deneyin.' });
    }
});

module.exports = router;