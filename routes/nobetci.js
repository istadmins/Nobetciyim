const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const nodemailer = require('nodemailer');

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
        console.log("Aktif nöbetçi değişimi için Telegram bildirimi gönderildi.");
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Aktif nöbetçi değişimi için Telegram bildirimi gönderilirken hata:", errorMessage);
    }
}

// Rastgele Şifre Üretme Fonksiyonu
function generateRandomPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*()+=;:,.?';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Şifre Sıfırlama - YÖNLENDİRMENİZLE TAMAMEN DÜZELTİLMİŞ NİHAİ HALİ
router.post('/reset-admin-password', (req, res) => {
    const adminUsername = 'admin';

    // 1. Adım: Admin kullanıcısının e-posta adresini de veritabanından al.
    db.get('SELECT id, username, email FROM Users WHERE username = ?', [adminUsername], (err, user) => {
        if (err) {
            console.error(`[HATA] Admin kullanıcısı aranırken DB hatası:`, err.message);
            return res.status(500).json({ error: "Veritabanı hatası oluştu." });
        }
        if (!user) {
            return res.status(404).json({ error: `'${adminUsername}' kullanıcısı veritabanında bulunamadı.` });
        }
        if (!user.email) {
            return res.status(400).json({ error: `'${adminUsername}' kullanıcısının veritabanında kayıtlı bir e-posta adresi yok.` });
        }

        const newPassword = generateRandomPassword(8);
        const hashedPassword = bcrypt.hashSync(newPassword, 10);

        // 2. Adım: Şifreyi güncelle.
        db.run('UPDATE Users SET password = ? WHERE username = ?', [hashedPassword, adminUsername], async function(err) {
            if (err) {
                console.error(`[HATA] Admin şifresi güncellenirken DB hatası:`, err.message);
                return res.status(500).json({ error: "Şifre güncellenirken bir sunucu hatası oluştu." });
            }

            // 3. Adım: E-postayı, veritabanından alınan DOĞRU adrese gönder.
            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.SES_SMTP_HOST,
                    port: parseInt(process.env.SES_SMTP_PORT || "587"),
                    auth: { user: process.env.SES_SMTP_USER, pass: process.env.SES_SMTP_PASSWORD },
                });

                const mailOptions = {
                    from: `"Nöbetçi Sistemi" <${process.env.EMAIL_FROM_SES_SMTP}>`,
                    to: user.email, // DÜZELTİLDİ: E-posta artık veritabanından gelen adrese gidecek.
                    subject: 'Admin Şifre Sıfırlama Bilgilendirmesi',
                    html: `Merhaba,<br><br><b>${user.username}</b> adlı kullanıcının şifresi başarıyla sıfırlanmıştır.<br><br>Yeni şifresi: <b>${newPassword}</b>`
                };

                console.log(`[LOG] E-posta gönderiliyor... Kime: ${mailOptions.to}, Kimden: ${mailOptions.from}`);
                const info = await transporter.sendMail(mailOptions);
                console.log(`[BAŞARILI] E-posta gönderildi. Sunucu yanıtı: ${info.response}`);
                res.json({ message: `Şifre sıfırlandı ve ${user.email} adresine e-posta gönderildi.` });

            } catch (emailError) {
                console.error("[HATA] E-posta gönderilirken kritik bir hata oluştu:", emailError);
                res.status(500).json({ message: 'Şifre sıfırlandı ancak bildirim e-postası gönderilemedi.' });
            }
        });
    });
});

// Şifre Sıfırlama (Her nöbetçi için)
router.post('/reset-password/:id', async (req, res) => {
    const nobetciId = parseInt(req.params.id);
    if (isNaN(nobetciId)) {
        return res.status(400).json({ error: 'Geçersiz nöbetçi ID.' });
    }
    try {
        const nobetci = await db.getNobetciById(nobetciId);
        if (!nobetci) {
            return res.status(404).json({ error: 'Nöbetçi bulunamadı.' });
        }
        // Yeni şifre üret
        const newPassword = generateRandomPassword(8);
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        // Şifreyi güncelle
        await new Promise((resolve, reject) => {
            db.run('UPDATE Nobetciler SET password = ? WHERE id = ?', [hashedPassword, nobetciId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
        // Telegram'a gönder
        if (nobetci.telegram_id) {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const message = `🔐 *Şifre Sıfırlandı*\n\n✅ Web paneli şifreniz başarıyla sıfırlandı.\n🆕 *Yeni şifreniz:* \`${newPassword}\`\n\n🌐 Web paneline giriş için sistem yöneticinizden adres alın\n👤 *Kullanıcı adınız:* ${nobetci.name}\n\n⚠️ *Güvenlik:* Bu şifreyi not alın ve güvenli bir yerde saklayın. İlk girişte değiştirmeniz önerilir.`;
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            try {
                await axios.post(url, {
                    chat_id: nobetci.telegram_id,
                    text: message,
                    parse_mode: 'Markdown'
                });
            } catch (err) {
                console.error('Telegram mesajı gönderilemedi:', err.message);
            }
        }
        // API yanıtı
        res.json({ message: 'Şifre başarıyla sıfırlandı.', newPassword });
    } catch (error) {
        console.error('Şifre sıfırlama hatası:', error);
        res.status(500).json({ error: 'Şifre sıfırlanırken bir hata oluştu.' });
    }
});

// --- DİĞER TÜM NÖBETÇİ İŞLEMLERİ (DEĞİŞTİRİLMEDEN KORUNDU) ---

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

// Bir nöbetçinin Telegram ID'sini güncelle
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

// Bir nöbetçinin Telefon Numarasını güncelle
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

// Kredi güncelleme endpoint'leri
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

// Nöbetçi izinleri API

// Tüm izinleri listele
router.get('/izinler', (req, res) => {
  db.all(`SELECT i.*, n1.name as nobetci_adi, n2.name as gunduz_yedek_adi, n3.name as gece_yedek_adi
          FROM nobetci_izinleri i
          LEFT JOIN Nobetciler n1 ON i.nobetci_id = n1.id
          LEFT JOIN Nobetciler n2 ON i.gunduz_yedek_id = n2.id
          LEFT JOIN Nobetciler n3 ON i.gece_yedek_id = n3.id
          ORDER BY i.baslangic_tarihi DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Yeni izin ekle
router.post('/izinler', (req, res) => {
  const { nobetci_id, baslangic_tarihi, bitis_tarihi, gunduz_yedek_id, gece_yedek_id } = req.body;
  if (!gunduz_yedek_id || !gece_yedek_id) {
    return res.status(400).json({ error: 'Gündüz ve gece yedek nöbetçi seçmek zorunludur!' });
  }
  if (nobetci_id === gunduz_yedek_id || nobetci_id === gece_yedek_id) {
    return res.status(400).json({ error: 'İzinli nöbetçi kendisi yedek olarak seçilemez!' });
  }
  db.run(`INSERT INTO nobetci_izinleri (nobetci_id, baslangic_tarihi, bitis_tarihi, gunduz_yedek_id, gece_yedek_id)
          VALUES (?, ?, ?, ?, ?)`,
    [nobetci_id, baslangic_tarihi, bitis_tarihi, gunduz_yedek_id, gece_yedek_id],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// İzin sil
router.delete('/izinler/:id', (req, res) => {
  db.run('DELETE FROM nobetci_izinleri WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'İzin silindi' });
  });
});

// İzin güncelle
router.put('/izinler/:id', (req, res) => {
  const { nobetci_id, baslangic_tarihi, bitis_tarihi, gunduz_yedek_id, gece_yedek_id } = req.body;
  if (!gunduz_yedek_id || !gece_yedek_id) {
    return res.status(400).json({ error: 'Gündüz ve gece yedek nöbetçi seçmek zorunludur!' });
  }
  if (nobetci_id === gunduz_yedek_id || nobetci_id === gece_yedek_id) {
    return res.status(400).json({ error: 'İzinli nöbetçi kendisi yedek olarak seçilemez!' });
  }
  db.run(`UPDATE nobetci_izinleri SET nobetci_id = ?, baslangic_tarihi = ?, bitis_tarihi = ?, gunduz_yedek_id = ?, gece_yedek_id = ? WHERE id = ?`,
    [nobetci_id, baslangic_tarihi, bitis_tarihi, gunduz_yedek_id, gece_yedek_id, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'İzin güncellendi' });
    });
});

// Nöbetçi listesini döndür (id, name)
router.get('/list', (req, res) => {
  db.all('SELECT id, name FROM Nobetciler ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;



