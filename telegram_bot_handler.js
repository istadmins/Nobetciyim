// Nobetciyim/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./db');
const { getAsilHaftalikNobetci, getAllNobetcilerFromDB } = require('./utils/calendarUtils');

let botInstance = null;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;


function initBot() {
    if (!botToken) {
        console.error("HATA: TELEGRAM_BOT_TOKEN ortam değişkeni ayarlanmamış. Bot başlatılamıyor.");
        return;
    }
    if (botInstance) {
        return botInstance;
    }

    botInstance = new TelegramBot(botToken, { polling: true });
    console.log("Telegram botu başlatıldı ve mesajları dinliyor...");

    // ... Dosyanızdaki tüm bot.onText ve bot.on('callback_query') olayları burada yer almalıdır.
    // Başlangıç ​​dosyanızdaki bu bölümü olduğu gibi bırakın.
    // Örnek:
    botInstance.onText(/^\/start$/, (msg) => {
        botInstance.sendMessage(msg.chat.id, "Merhaba!");
    });
    // ... diğer tüm bot olaylarınız ...
}

async function sendTelegramMessageToGroup(groupId, message) {
    if (!botInstance) {
        console.warn("Bot başlatılmamış, Telegram mesajı gönderilemiyor.");
        return;
    }
    if (!groupId) {
        console.warn("Telegram grup ID'si tanımlanmamış, mesaj gönderilemiyor:", message);
        return;
    }
    try {
        await botInstance.sendMessage(groupId, message, { parse_mode: 'Markdown' });
        console.log(`Telegram mesajı (${groupId}) gönderildi.`);
    } catch (error) {
        console.error(`Telegram mesajı gönderilirken hata (${groupId}):`, error.message);
        throw error;
    }
}

/**
 * Veritabanında Telegram ID'si kayıtlı tüm kullanıcılara nöbetçi değişikliği bildirimi gönderir.
 * @param {string} newActiveGuardName Yeni aktif nöbetçinin adı.
 */
async function notifyAllOfDutyChange(newActiveGuardName) {
    if (!botInstance) {
        console.warn("Bot başlatılmamış, nöbetçi değişikliği bildirimi gönderilemiyor.");
        return;
    }

    try {
        const usersToSend = await db.getAllNobetcilerWithTelegramId();

        if (usersToSend && usersToSend.length > 0) {
            const message = `Manuel Nöbet Değişikliği:\nYeni Aktif Nöbetçi: *${newActiveGuardName}*`;
            
            console.log(`[Bildirim] Nöbet değişikliği bildirimi hazırlanıyor: ${message.replace(/\*/g, '')}`);
            
            const sendPromises = usersToSend.map(user => {
                if (user.telegram_id) {
                    return sendTelegramMessageToGroup(user.telegram_id, message)
                        .catch(err => console.error(`[HATA] ${user.name} (${user.telegram_id}) kullanıcısına mesaj gönderilemedi:`, err.message));
                }
                return Promise.resolve();
            });

            await Promise.all(sendPromises);
            console.log(`[Bildirim] ${usersToSend.length} kullanıcıya nöbet değişikliği bildirimi gönderildi.`);
        }
    } catch (error) {
        console.error("Tüm kullanıcılara nöbet değişikliği bildirimi gönderilirken hata:", error.message);
    }
}

module.exports = {
    init: initBot,
    sendTelegramMessageToGroup,
    notifyAllOfDutyChange
};
