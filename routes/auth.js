
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');



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

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gereklidir' });
    }

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

// Şifre sıfırlama isteğini başlat
router.post('/initiate-password-reset', async (req, res) => {
  try {
    const { username } = sanitizeInput(req.body);

    if (!username) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı gereklidir.' });
    }

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

    // Update password in database
    await new Promise((resolve, reject) => {
      db.run("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, user.id], function(updateErr) {
        if (updateErr) {
          logger.error("Şifre sıfırlama - Şifre güncellenirken DB hatası:", updateErr);
          reject(updateErr);
        } else {
          resolve();
        }
      });
    });

    // For now, just return the new password (in production, send via email)
    logger.info(`Password reset successful for user: ${username}. New password: ${newPassword}`);
    res.json({ 
      success: true, 
      message: 'Şifreniz başarıyla sıfırlandı. Yeni şifre: ' + newPassword 
    });

  } catch (error) {
    logger.error("Şifre sıfırlama isteği işlenirken genel hata:", error);
    return res.status(500).json({ success: false, message: 'Sunucuda beklenmedik bir hata oluştu. Lütfen daha sonra tekrar deneyin.' });
  }
});

module.exports = router;

// routes/auth.js DOSYASININ EN ALTINA EKLEYİN



// Admin şifresini sıfırlayıp e-posta gönderen endpoint
router.post('/forgot-password', async (req, res) => {
    const { username } = req.body;

    if (username !== 'admin') {
        return res.status(400).json({ success: false, message: 'Sadece admin şifresi sıfırlanabilir.' });
    }

    try {
        // 1. Yeni, rastgele bir şifre oluştur
        const newPassword = crypto.randomBytes(8).toString('hex'); // 16 karakterlik güvenli bir şifre
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // 2. Veritabanında admin şifresini güncelle
        await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedNewPassword, 'admin']);
        
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
            subject: 'Admin Şifre Sıfırlama Talebi',
            html: `
                <p>Merhaba,</p>
                <p>Admin hesabınız için yeni bir şifre oluşturulmuştur.</p>
                <p><b>Yeni Şifreniz:</b> ${newPassword}</p>
                <p>Lütfen giriş yaptıktan sonra bu şifreyi değiştiriniz.</p>
            `,
        });

        console.log(`Admin password reset. New password sent to ${process.env.ADMIN_EMAIL}`);
        res.json({ success: true, message: 'Şifre sıfırlama e-postası gönderildi.' });

    } catch (error) {
        console.error('Error in /forgot-password route:', error);
        res.status(500).json({ success: false, message: 'Sunucuda bir hata oluştu.' });
    }
});
