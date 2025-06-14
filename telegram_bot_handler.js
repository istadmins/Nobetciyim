// Nobetciyim/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./db');
// utils klasöründeki dosyanın varlığını varsayıyoruz
const { getAsilHaftalikNobetci, getAllNobetcilerFromDB } = require('./utils/calendarUtils'); 

let botInstance = null;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

function initBot() {
    if (!botToken) {
        console.error("HATA: TELEGRAM_BOT_TOKEN ayarlanmamış.");
        return;
    }
    if (botInstance) return botInstance;

    botInstance = new TelegramBot(botToken, { polling: true });
    console.log("Telegram botu başlatıldı ve mesajları dinliyor...");

    async function getAuthorizedNobetciByTelegramId(telegramId) {
        return new Promise((resolve) => {
            db.get("SELECT * FROM Nobetciler WHERE telegram_id = ?", [String(telegramId)], (err, row) => {
                if (err) { console.error("DB hatası:", err.message); resolve(null); }
                resolve(row);
            });
        });
    }

    async function getCurrentlyActiveNobetciFromDB() {
        return db.getAktifNobetci();
    }

    // --- TELEGRAM KOMUTLARI (ORİJİNAL HALİNE GETİRİLDİ) ---

    botInstance.onText(/^\/(start|menu)$/, async (msg) => {
        //... Orijinal /start komutunuz ...
    });

    const pendingTransferRequests = {};
    botInstance.onText(/^\/nobet_al$/, async (msg) => {
        const commandRequesterChatId = msg.chat.id;
        const commandRequesterTelegramId = String(commandRequesterChatId);
        const T = await getAuthorizedNobetciByTelegramId(commandRequesterTelegramId);

        if (!T) {
            return botInstance.sendMessage(commandRequesterChatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }
        try {
            const C = await getAsilHaftalikNobetci(new Date());
            if (!C || !C.id) {
                return botInstance.sendMessage(T.telegram_id, "❌ Bu hafta için asıl nöbetçi belirlenemedi.");
            }
            const X = await getCurrentlyActiveNobetciFromDB();
            
            // Eğer komutu veren kişi haftanın asıl nöbetçisiyse, onaysız alır
            if (T.id === C.id) {
                if (X && X.id === T.id) {
                    return botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' });
                }
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                // Manuel değişiklik olduğu için herkese bildirim GİTMEYECEK, çünkü set-aktif rotası bildirim gönderiyor.
                // Sadece ilgili kişilere bilgi verilir.
                botInstance.sendMessage(T.telegram_id, `✅ *${T.name}*, nöbeti (geri) aldınız.`, { parse_mode: 'Markdown' });
                if (X && X.id !== T.id && X.telegram_id) {
                    botInstance.sendMessage(X.telegram_id, `ℹ️ Nöbet, asıl nöbetçi *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
                return;
            }

            // Diğer durumlarda onay istenir...
            if (X && X.id === T.id) {
                 return botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' });
            }
            let approver = X || C;
            if (!approver || !approver.id || !approver.telegram_id) {
                 return botInstance.sendMessage(T.telegram_id, `❌ Nöbet devri için onaycı bulunamadı veya Telegram ID'si eksik.`);
            }

            const requestId = `ntr_${Date.now()}_${T.id}`;
            pendingTransferRequests[requestId] = {
                requesterChatId: T.telegram_id, requesterNobetciId: T.id, requesterNobetciAdi: T.name,
                approverNobetciId: approver.id, approverNobetciTelegramId: approver.telegram_id, approverNobetciAdi: approver.name
            };
            const onayMesaji = `Merhaba *${approver.name}*,\n*${T.name}* nöbeti devralmak istiyor. Onaylıyor musunuz?`;
            await botInstance.sendMessage(approver.telegram_id, onayMesaji, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "Evet ✅", callback_data: `nobet_onay_evet_${requestId}` }, { text: "Hayır ❌", callback_data: `nobet_onay_hayir_${requestId}` }]] }
            });
            botInstance.sendMessage(T.telegram_id, `Nöbet devir isteğiniz *${approver.name}*'a iletildi...`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("[/nobet_al] Hata:", error.response ? error.response.data : error.message, error.stack);
            botInstance.sendMessage(commandRequesterChatId, "❌ Nöbet alma işlemi sırasında bir hata oluştu.");
        }
    });

    botInstance.on('callback_query', async (callbackQuery) => {
        // ... Orijinal callback_query mantığınız burada yer almalıdır.
        // API isteği /api/nobetci/:id/set-aktif'e gideceği için bildirim otomatik olarak gönderilecektir.
    });
    
    // ... Diğer komutlarınız (/aktif_nobetci, /nobet_kredi_durum, /sifre_sifirla) olduğu gibi kalmalı.
}

// --- YENİ BİLDİRİM FONKSİYONLARI ---

async function sendTelegramMessageToGroup(groupId, message) {
    if (!botInstance || !groupId) return;
    try {
        await botInstance.sendMessage(groupId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`Telegram mesajı gönderilirken hata (${groupId}):`, error.message);
        throw error;
    }
}

async function notifyAllOfDutyChange(newActiveGuardName) {
    if (!botInstance) return;
    try {
        const usersToSend = await db.getAllNobetcilerWithTelegramId();
        if (usersToSend && usersToSend.length > 0) {
            const message = `Manuel Nöbet Değişikliği:\nYeni Aktif Nöbetçi: *${newActiveGuardName}*`;
            const sendPromises = usersToSend.map(user => 
                sendTelegramMessageToGroup(user.telegram_id, message).catch(err => {})
            );
            await Promise.all(sendPromises);
            console.log(`[Bildirim] ${usersToSend.length} kullanıcıya manuel değişiklik bildirildi.`);
        }
    } catch (error) {
        console.error("Tüm kullanıcılara bildirim gönderilirken hata:", error.message);
    }
}

module.exports = {
    init: initBot,
    sendTelegramMessageToGroup,
    notifyAllOfDutyChange
};
