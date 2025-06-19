// Nobetciyim/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./db');
const { getAsilHaftalikNobetci, getWeekOfYear } = require('./utils/calendarUtils');
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

let botInstance = null;
const pendingTransferRequests = {}; // Onay bekleyen devir istekleri için

function initBot() {
    if (!botToken) {
        console.error("HATA: TELEGRAM_BOT_TOKEN ayarlanmamış.");
        return;
    }
    if (botInstance) return botInstance;

    botInstance = new TelegramBot(botToken, { polling: true });
    console.log("Telegram botu başlatıldı...");

    const getAuthorizedNobetciByTelegramId = (telegramId) => new Promise((resolve) => {
        db.get("SELECT * FROM Nobetciler WHERE telegram_id = ?", [String(telegramId)], (err, row) => resolve(row || null));
    });

    botInstance.onText(/^\/nobet_al$/, async (msg) => {
        const requesterTelegramId = String(msg.chat.id);
        const requester = await getAuthorizedNobetciByTelegramId(requesterTelegramId);

        if (!requester) {
            return botInstance.sendMessage(requesterTelegramId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            const primaryGuard = await getAsilHaftalikNobetci(new Date());
            if (!primaryGuard || !primaryGuard.id) {
                return botInstance.sendMessage(requesterTelegramId, "❌ Bu hafta için asıl nöbetçi belirlenemedi.");
            }

            const currentActiveGuard = await db.getAktifNobetci();

            // DURUM 1: Komutu kullanan kişi haftanın ASIL NÖBETÇİSİ ise
            if (requester.id === primaryGuard.id) {
                if (currentActiveGuard && currentActiveGuard.id === requester.id) {
                    return botInstance.sendMessage(requesterTelegramId, `ℹ️ Zaten aktif nöbetçisiniz.`);
                }
                await db.setAktifNobetci(requester.id);
                botInstance.sendMessage(requesterTelegramId, `✅ Nöbeti (geri) aldınız. Onay gerekmedi.`);
                notifyAllOfDutyChange(requester.name, "Asıl Nöbetçi Geri Aldı");
                return;
            }

            // DURUM 2: Komutu kullanan kişi ASIL NÖBETÇİ DEĞİL ve devir isteyecek
            const approver = currentActiveGuard || primaryGuard;
            if (!approver || !approver.telegram_id) {
                return botInstance.sendMessage(requesterTelegramId, `❌ Nöbet devri için onaycı (aktif veya asıl) bulunamadı veya Telegram ID'si eksik.`);
            }

            if (approver.id === requester.id) {
                return botInstance.sendMessage(requesterTelegramId, "ℹ️ Zaten aktif nöbetçisiniz.");
            }

            const requestId = `ntr_${Date.now()}`;
            const approvalMessage = `Merhaba *${approver.name}*,\n*${requester.name}* nöbeti devralmak istiyor. Onaylıyor musunuz? (2 dk süreniz var)`;
            
            const sentMessage = await botInstance.sendMessage(approver.telegram_id, approvalMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Evet ✅", callback_data: `approve_${requestId}` },
                        { text: "Hayır ❌", callback_data: `reject_${requestId}` }
                    ]]
                }
            });

            const timeoutId = setTimeout(() => {
                if (pendingTransferRequests[requestId]) {
                    delete pendingTransferRequests[requestId];
                    botInstance.editMessageText(`Bu istek zaman aşımına uğradı.`, { chat_id: sentMessage.chat.id, message_id: sentMessage.message_id, reply_markup: null });
                    botInstance.sendMessage(requester.telegram_id, `❌ Nöbet devir isteğiniz *${approver.name}* tarafından zamanında yanıtlanmadı.`, { parse_mode: 'Markdown' });
                }
            }, 2 * 60 * 1000); // 2 dakika

            pendingTransferRequests[requestId] = {
                requester,
                approver,
                timeoutId,
                messageId: sentMessage.message_id
            };

            botInstance.sendMessage(requester.telegram_id, `Nöbet devir isteğiniz *${approver.name}*'a iletildi...`, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("[/nobet_al] Hata:", error);
            botInstance.sendMessage(requesterTelegramId, "❌ Nöbet alma işlemi sırasında bir hata oluştu.");
        }
    });

    botInstance.on('callback_query', async (callbackQuery) => {
        const [action, requestId] = callbackQuery.data.split('_');
        const request = pendingTransferRequests[requestId];

        if (!request) {
            return botInstance.answerCallbackQuery(callbackQuery.id, { text: "Bu istek artık geçerli değil." });
        }

        if (String(callbackQuery.from.id) !== String(request.approver.telegram_id)) {
            return botInstance.answerCallbackQuery(callbackQuery.id, { text: "Bu işlemi yapmaya yetkiniz yok." });
        }

        clearTimeout(request.timeoutId);
        delete pendingTransferRequests[requestId];
        
        await botInstance.editMessageReplyMarkup({inline_keyboard: []}, { chat_id: callbackQuery.message.chat.id, message_id: request.messageId });

        if (action === 'approve') {
            try {
                await db.setAktifNobetci(request.requester.id);
                botInstance.sendMessage(request.requester.telegram_id, `✅ Nöbet devir isteğiniz *${request.approver.name}* tarafından onaylandı.`, { parse_mode: 'Markdown' });
                botInstance.editMessageText(`✅ İstek onaylandı. Nöbet *${request.requester.name}*'a devredildi.`, { chat_id: callbackQuery.message.chat.id, message_id: request.messageId, parse_mode: 'Markdown' });
                notifyAllOfDutyChange(request.requester.name, "Onaylı Devir");
            } catch (error) {
                botInstance.sendMessage(request.requester.telegram_id, `❌ Nöbet aktarılırken API hatası oluştu.`);
                botInstance.editMessageText(`❌ API hatası! Nöbet devredilemedi.`, { chat_id: callbackQuery.message.chat.id, message_id: request.messageId });
            }
        } else { // reject
            botInstance.sendMessage(request.requester.telegram_id, `❌ Nöbet devir isteğiniz *${request.approver.name}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
            botInstance.editMessageText(`❌ İstek reddedildi.`, { chat_id: callbackQuery.message.chat.id, message_id: request.messageId });
        }
        botInstance.answerCallbackQuery(callbackQuery.id);
    });
    
    // ... (diğer komutlarınız: /aktif_nobetci, /sifre_sifirla, vs.)
    botInstance.onText(/^\/gelecek_hafta_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);
        if (!nobetciYetkili) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
        }
        try {
            const today = new Date();
            const nextWeekDate = new Date(today.setDate(today.getDate() + 7));
            const gelecekHaftaNobetci = await getAsilHaftalikNobetci(nextWeekDate);

            if (!gelecekHaftaNobetci) {
                return botInstance.sendMessage(chatId, "❌ Gelecek hafta için nöbetçi bilgisi bulunamadı.");
            }
            
            botInstance.sendMessage(chatId, `📅 Gelecek Haftanın Nöbetçisi: *${gelecekHaftaNobetci.name}*`, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/gelecek_hafta_nobetci hatası:", error);
            botInstance.sendMessage(chatId, "❌ Bilgi alınırken bir hata oluştu.");
        }
    });

}

async function notifyAllOfDutyChange(newActiveGuardName, triggeredBy = "API") {
    // ... (bu fonksiyonun içeriği aynı kalabilir)
}

module.exports = { init: initBot, notifyAllOfDutyChange };
