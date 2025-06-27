
global.crypto = require('crypto');
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Simple console logger fallback
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

// Import middleware (simplified)
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Simple rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, error: 'Çok fazla istek gönderildi' }
});

// Route dosyalarını çağır
const authRoutes = require('./routes/auth');
const nobetciRoutes = require('./routes/nobetci');
const kurallarRoutes = require('./routes/kurallar');
const nobetKredileriRoutes = require('./routes/nobet-kredileri');
const takvimRemarksRoutes = require('./routes/takvim_remarks');
const settingsRoutes = require('./routes/settings');

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(generalLimiter);

// API Rotaları
app.use('/api/auth', authRoutes);
app.use('/api/nobetci', nobetciRoutes);
app.use('/api/kurallar', kurallarRoutes);
app.use('/api/nobet-kredileri', nobetKredileriRoutes);
app.use('/api/remarks', takvimRemarksRoutes);
app.use('/api/settings', settingsRoutes);

// Statik dosyalar (public klasörünü sunar)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: true
}));

// Ana sayfa yönlendirmeleri
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint bulunamadı' 
  });
});

// Simple error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Sunucu hatası oluştu'
  });
});

// Start server
const PORT = process.env.PORT || 80;
const server = app.listen(PORT, () => {
  logger.info(`Sunucu ${PORT} portunda çalışıyor`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Initialize background services after server starts
server.on('listening', () => {
  // Cron job'ları başlat
  try {
    require('./cron-jobs.js');
    logger.info('Cron jobs initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize cron jobs:', error);
  }

  // Telegram Bot İşleyicisini Başlat
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const telegramBotHandler = require('./telegram_bot_handler.js');
      telegramBotHandler.init();
      logger.info('Telegram bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
    }
  } else {
    logger.warn("TELEGRAM_BOT_TOKEN ortam değişkeni ayarlanmamış. Telegram botu başlatılmayacak.");
  }
});

module.exports = app;