// app.js
global.crypto = require('crypto');
const express = require('express');
const path = require('path');
require('dotenv').config();

// Route dosyalarını çağır
const authRoutes = require('./routes/auth');
const nobetciRoutes = require('./routes/nobetci');
const kurallarRoutes = require('./routes/kurallar');
const nobetKredileriRoutes = require('./routes/nobet-kredileri');
const takvimRemarksRoutes = require('./routes/takvim_remarks');
const settingsRoutes = require('./routes/settings');

const app = express();

// Cron job'ları başlat
require('./cron-jobs.js');

// Telegram Bot İşleyicisini Başlat
if (process.env.TELEGRAM_BOT_TOKEN) {
    const telegramBotHandler = require('./telegram_bot_handler.js');
    telegramBotHandler.init();
} else {
    console.warn("TELEGRAM_BOT_TOKEN ortam değişkeni ayarlanmamış. Telegram botu başlatılmayacak.");
}


// Middleware'ler
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Rotaları
app.use('/api/auth', authRoutes);
app.use('/api/nobetci', nobetciRoutes);
app.use('/api/kurallar', kurallarRoutes);
app.use('/api/nobet-kredileri', nobetKredileriRoutes);
app.use('/api/remarks', takvimRemarksRoutes);
app.use('/api/settings', settingsRoutes);

// Statik dosyalar (public klasörünü sunar)
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa yönlendirmeleri
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
