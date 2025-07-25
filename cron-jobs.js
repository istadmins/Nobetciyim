// Nobetciyim/cron-jobs.js
const logger = require('./utils/logger');
const db = require('./db');
const calendarUtils = require('./utils/calendarUtils');
const CronJobManager = require('./utils/cronJobs');

// Telegram bot handler'ı lazy load
let telegramBotHandler = null;
try {
    telegramBotHandler = require('./telegram_bot_handler');
} catch (error) {
    logger.warn('Telegram bot handler yüklenemedi:', error.message);
    // Fallback object
    telegramBotHandler = {
        notifyAllOfDutyChange: async () => {
            logger.warn('Telegram bot handler mevcut değil, bildirim gönderilemiyor');
        }
    };
}

// Cron job manager'ı oluştur
const cronManager = new CronJobManager(db, calendarUtils, telegramBotHandler);

// Graceful shutdown için cleanup
process.on('SIGTERM', () => {
    logger.info('SIGTERM alındı, cron job\'ları durduruluyor...');
    cronManager.stopAllJobs();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT alındı, cron job\'ları durduruluyor...');
    cronManager.stopAllJobs();
    process.exit(0);
});

// Cron job'ları başlat
cronManager.startAllJobs()
    .then(() => {
        logger.info('Cron job sistemi başarıyla başlatıldı');
    })
    .catch((error) => {
        logger.error('Cron job sistemi başlatılırken hata:', error);
        process.exit(1);
    });

// Export for external access if needed
module.exports = cronManager;