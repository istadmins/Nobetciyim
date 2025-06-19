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

    // START komutu
    botInstance.onText(/^\/start$/, async (msg) => {
        const chatId = msg.chat.id;
        const welcomeMessage = `
🏥 *Nöbetçi Sistemi*

Merhaba! Bu bot nöbetçi sistemini yönetmenize yardımcı olur.

Kullanılabilir komutlar:
/menu - Ana menü
/aktif_nobetci - Aktif nöbetçiyi görüntüle
/nobet_al - Nöbet al
/nobet_kredi_durum - Kredi durumunu görüntüle
/gelecek_hafta_nobetci - Gelecek haftanın nöbetçisi
/sifre_sifirla - Şifre sıfırlama

Başlamak için /menu yazabilirsiniz.
        `;
        botInstance.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // MENU komutu
    botInstance.onText(/^\/menu$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok. Lütfen önce sisteme kayıt olunuz.");
        }

        const menuMessage = `
🏥 *Nöbetçi Sistemi - Ana Menü*

Merhaba *${nobetci.name}*,

📋 *Kullanılabilir Komutlar:*
• /aktif_nobetci - Şu anki aktif nöbetçiyi görüntüle
• /nobet_al - Nöbet devralma talebi gönder
• /nobet_kredi_durum - Kredi durumunuzu kontrol edin
• /gelecek_hafta_nobetci - Gelecek haftanın nöbetçisini görüntüle
• /sifre_sifirla - Web paneli şifrenizi sıfırlayın

ℹ️ *Bilgi:* Mevcut krediniz: *${nobetci.kredi || 0}*
        `;
        
        botInstance.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown' });
    });

    // AKTİF NÖBETÇİ komutu
    botInstance.onText(/^\/aktif_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            const aktifNobetci = await db.getAktifNobetci();
            if (!aktifNobetci) {
                return botInstance.sendMessage(chatId, "ℹ️ Şu anda aktif nöbetçi bulunmuyor.");
            }
            
            const message = `👨‍⚕️ *Aktif Nöbetçi:* ${aktifNobetci.name}\n💳 *Kredi:* ${aktifNobetci.kredi || 0}`;
            botInstance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/aktif_nobetci hatası:", error);
            botInstance.sendMessage(chatId, "❌ Aktif nöbetçi bilgisi alınırken hata oluştu.");
        }
    });

    // NÖBET KREDİ DURUM komutu
    botInstance.onText(/^\/nobet_kredi_durum$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            // Güncel kredi bilgisini veritabanından al
            const guncelNobetci = await db.getNobetciById(nobetci.id);
            if (!guncelNobetci) {
                return botInstance.sendMessage(chatId, "❌ Nöbetçi bilgisi bulunamadı.");
            }

            const krediDurumuMessage = `
💳 *Kredi Durumunuz*

👤 *Nöbetçi:* ${guncelNobetci.name}
💰 *Mevcut Kredi:* ${guncelNobetci.kredi || 0}
📊 *Ödenen Kredi:* ${guncelNobetci.pay_edilen_kredi || 0}

ℹ️ *Bilgi:* 
• Pozitif kredi = Fazla nöbet tutmuşsunuz
• Negatif kredi = Nöbet borcunuz var
            `;
            
            botInstance.sendMessage(chatId, krediDurumuMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/nobet_kredi_durum hatası:", error);
            botInstance.sendMessage(chatId, "❌ Kredi durumu alınırken hata oluştu.");
        }
    });

    // ŞİFRE SIFIRLAMA komutu
    botInstance.onText(/^\/sifre_sifirla$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            // API'ye şifre sıfırlama isteği gönder
            const response = await axios.post(`${localApiBaseUrl}/reset-password`, {
                nobetciId: nobetci.id
            }, {
                headers: {
                    'Authorization': `Bearer ${INTERNAL_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.success) {
                const message = `
🔐 *Şifre Sıfırlandı*

✅ Web paneli şifreniz başarıyla sıfırlandı.
🆕 *Yeni şifreniz:* \`${response.data.newPassword}\`

🌐 Web paneline giriş için: ${process.env.WEB_URL || 'Web adresi'}
👤 Kullanıcı adınız: ${nobetci.name}

⚠️ *Güvenlik:* Bu şifreyi not alın ve güvenli bir yerde saklayın. İlk girişte değiştirmeniz önerilir.
                `;
                botInstance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } else {
                botInstance.sendMessage(chatId, "❌ Şifre sıfırlama işlemi başarısız oldu. Lütfen tekrar deneyin.");
            }
        } catch (error) {
            console.error("/sifre_sifirla hatası:", error);
            botInstance.sendMessage(chatId, "❌ Şifre sıfırlama sırasında hata oluştu. Lütfen sistem yöneticisiyle iletişime geçin.");
        }
    });

    // NÖBET AL komutu (mevcut kod)
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

    // GELECEK HAFTA NÖBETÇİ komutu (mevcut kod)
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

    // Callback query handler (mevcut kod)
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

    return botInstance;
}

async function notifyAllOfDutyChange(newActiveGuardName, triggeredBy = "API") {
    try {
        const allNobetcilerWithTelegram = await db.getAllNobetcilerWithTelegramId();
        const message = `🔄 *Nöbet Değişikliği*\n\n👨‍⚕️ Yeni aktif nöbetçi: *${newActiveGuardName}*\n📍 Tetikleyen: ${triggeredBy}`;
        
        for (const nobetci of allNobetcilerWithTelegram) {
            if (nobetci.telegram_id && botInstance) {
                try {
                    await botInstance.sendMessage(nobetci.telegram_id, message, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`Telegram bildirim hatası (${nobetci.name}):`, err.message);
                }
            }
        }
    } catch (error) {
        console.error("notifyAllOfDutyChange hatası:", error);
    }
}

module.exports = { init: initBot, notifyAllOfDutyChange };