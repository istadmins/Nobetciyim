// routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Bu yolun db.js dosyanıza göre doğru olduğundan emin olun
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Mevcut /login route'unuzun burada olduğunu varsayıyorum
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


// YENİ ENDPOINT: Şifre sıfırlama isteğini başlat
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

                // Nodemailer transporter yapılandırması
                let transporterOptions = {
                    host: process.env.EMAIL_HOST,
                    port: parseInt(process.env.EMAIL_PORT || "587"),
                    secure: process.env.EMAIL_SECURE === 'true', // port 465 için true, diğerleri için genellikle false (STARTTLS)
                    // tls: { // Geliştirme ortamında self-signed sertifikalar için gerekebilir
                    //     rejectUnauthorized: false // CANLI ORTAMDA BUNU KULLANMAYIN!
                    // }
                };

                // Eğer .env dosyasında EMAIL_USER ve EMAIL_PASS tanımlıysa, auth bloğunu ekle
                if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    transporterOptions.auth = {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS,
                    };
                } else {
                    console.log("EMAIL_USER ve EMAIL_PASS .env dosyasında bulunamadı. Kimlik doğrulamasız e-posta gönderme deneniyor.");
                    // Bazı SMTP sunucuları, belirli IP'lerden gelen istekler için kimlik doğrulaması gerektirmeyebilir.
                    // Veya kimlik doğrulama gerektirmeyen bir relay sunucusu kullanılıyor olabilir.
                }
                 if (process.env.NODE_ENV !== 'production' && transporterOptions.host && transporterOptions.host.includes('localhost')) {
                    // Geliştirme ortamında ve localhost SMTP sunucusu kullanılıyorsa
                    // self-signed sertifikalara izin ver
                     transporterOptions.tls = {
                         rejectUnauthorized: false
                     };
                 }


                const transporter = nodemailer.createTransport(transporterOptions);

                const mailOptions = {
                    from: process.env.EMAIL_FROM || `"Uygulamanız" <default_sender@example.com>`, // .env'de EMAIL_FROM tanımlı değilse bir varsayılan kullan
                    to: user.email,
                    subject: 'Uygulama Şifre Sıfırlama',
                    text: `Merhaba ${username},\n\nİsteğiniz üzerine şifreniz sıfırlanmıştır.\nYeni şifreniz: ${newPassword}\n\nLütfen giriş yaptıktan sonra şifrenizi güvenli bir şifre ile güncelleyiniz.\n\nBu isteği siz yapmadıysanız, lütfen bu e-postayı dikkate almayın.`,
                    html: `<p>Merhaba ${username},</p><p>İsteğiniz üzerine şifreniz sıfırlanmıştır.</p><p>Yeni şifreniz: <strong>${newPassword}</strong></p><p>Lütfen giriş yaptıktan sonra şifrenizi güvenli bir şifre ile güncelleyiniz.</p><p>Bu isteği siz yapmadıysanız, lütfen bu e-postayı dikkate almayın.</p>`
                };

                try {
                    await transporter.sendMail(mailOptions);
                    console.log(`Şifre sıfırlama e-postası ${user.email} adresine gönderildi. Yeni şifre: ${newPassword}`);
                    return res.json({ success: true, message: 'Yeni şifreniz, kayıtlı e-posta adresinize başarıyla gönderildi.' });
                } catch (emailError) {
                    console.error("Şifre sıfırlama - E-posta gönderilirken hata:", emailError);
                    return res.status(500).json({ 
                        success: false,
                        message: `Şifreniz veritabanında güncellendi ancak e-posta gönderilirken bir sorun oluştu: ${emailError.message}. E-posta sunucu ayarlarınızı kontrol edin.`
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
