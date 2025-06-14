// routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Simple console logger fallback
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args)
};

// Simple validation function
const sanitizeInput = (data) => {
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return data;
};

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = sanitizeInput(req.body);

    // Get user from database
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      logger.warn(`Failed login attempt for username: ${username} from IP: ${req.ip}`);
      return res.status(401).json({ success: false, error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn(`Failed login attempt for username: ${username} from IP: ${req.ip}`);
      return res.status(401).json({ success: false, error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    // Update last login
    db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id], (err) => {
      if (err) logger.error('Failed to update last login:', err);
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.SESSION_TIMEOUT || '8h' }
    );

    logger.info(`Successful login for username: ${username} from IP: ${req.ip}`);
    res.json({ 
      success: true, 
      token, 
      username: user.username,
      role: user.role
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu' });
  }
});


// Şifre sıfırlama isteğini başlat (Amazon SES SMTP ile)
router.post('/initiate-password-reset', async (req, res) => {
    try {
        const { username } = sanitizeInput(req.body);

    // Get user from database
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT id, email FROM users WHERE username = ? COLLATE NOCASE", [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            logger.warn(`Password reset attempt for non-existent user: ${username} from IP: ${req.ip}`);
            return res.status(404).json({ success: false, message: `Kullanıcı "${username}" bulunamadı.` });
        }

        if (!user.email) {
            logger.warn(`Password reset attempt for user without email: ${username} from IP: ${req.ip}`);
            return res.status(400).json({ success: false, message: `"${username}" kullanıcısı için kayıtlı bir e-posta adresi bulunmamaktadır.` });
        }

        // Generate secure password
        const newPassword = crypto.randomBytes(6).toString('hex'); // 12 character password
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

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