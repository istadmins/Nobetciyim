// telegram_bot_handler.js - Eksik komutlar eklendi
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
        return new Promise((resolve, reject) => {
            db.get("SELECT * FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // START/MENU komutu
    botInstance.onText(/^\/(start|menu)$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        let menuText = `Merhaba! Nöbetçi Uygulamasına Hoş Geldiniz.\n`;
        if (nobetci) {
            menuText += `Merhaba *${nobetci.name}*!\nKullanabileceğiniz komutlar:\n\n` +
                        `*/nobet_al* - Nöbeti devralmak/geri almak için.\n` +
                        `*/aktif_nobetci* - Şu anki aktif nöbetçiyi gösterir.\n` +
                        `*/nobet_kredi_durum* - Nöbetçilerin kredi durumlarını listeler.\n` +
                        `*/sifre_sifirla* - Şifrenizi sıfırlar (DM ile gönderilir).`;
        } else {
            menuText += `Bu botu kullanabilmek için Telegram ID'nizin sistemdeki bir nöbetçiyle eşleştirilmiş olması gerekmektedir.`;
        }
        botInstance.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
    });

    // AKTİF NÖBETÇİ komutu - EKSİK OLAN
    botInstance.onText(/^\/aktif_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            const aktifNobetci = await getCurrentlyActiveNobetciFromDB();
            if (aktifNobetci) {
                const mesaj = `🟢 **Aktif Nöbetçi:**\n*${aktifNobetci.name}*\nKredi: ${aktifNobetci.kredi || 0}`;
                botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
            } else {
                botInstance.sendMessage(chatId, "❌ Şu anda aktif nöbetçi bulunmuyor.");
            }
        } catch (error) {
            console.error("[/aktif_nobetci] Hata:", error.message);
            botInstance.sendMessage(chatId, "❌ Aktif nöbetçi bilgisi alınırken hata oluştu.");
        }
    });

    // KREDİ DURUM komutu - EKSİK OLAN
    botInstance.onText(/^\/nobet_kredi_durum$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            const tumNobetciler = await getAllNobetcilerFromDB();
            if (!tumNobetciler || tumNobetciler.length === 0) {
                return botInstance.sendMessage(chatId, "❌ Sistemde kayıtlı nöbetçi bulunamadı.");
            }

            let mesaj = "📊 **Nöbetçi Kredi Durumları:**\n\n";
            for (const n of tumNobetciler) {
                const aktifMi = n.is_aktif ? "🟢" : "⚪";
                mesaj += `${aktifMi} *${n.name}*: ${n.kredi || 0} kredi\n`;
            }

            botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("[/nobet_kredi_durum] Hata:", error.message);
            botInstance.sendMessage(chatId, "❌ Kredi durumları alınırken hata oluştu.");
        }
    });

    // ŞİFRE SIFIRLAMA komutu - EKSİK OLAN
    botInstance.onText(/^\/sifre_sifirla$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }

        try {
            // Yeni şifre oluştur (8 karakter)
            const yeniSifre = Math.random().toString(36).slice(-8);
            
            // Şifreyi veritabanında güncelle - hash'li olarak saklanıyor olabilir
            const crypto = require('crypto');
            const hashedPassword = crypto.createHash('sha256').update(yeniSifre).digest('hex');
            
            db.run("UPDATE Nobetciler SET password = ? WHERE id = ?", [hashedPassword, nobetci.id], function(err) {
                if (err) {
                    console.error("[/sifre_sifirla] DB Update Hatası:", err.message);
                    botInstance.sendMessage(chatId, "❌ Şifre sıfırlanırken hata oluştu.");
                } else {
                    const mesaj = `🔑 **Şifreniz Sıfırlandı**\n\n` +
                                 `Kullanıcı Adı: *${nobetci.name}*\n` +
                                 `Yeni Şifre: \`${yeniSifre}\`\n\n` +
                                 `⚠️ Bu mesajı kaydedin ve güvenli bir yerde saklayın!`;
                    
                    botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
                    console.log(`[/sifre_sifirla] ${nobetci.name} için şifre sıfırlandı.`);
                }
            });
        } catch (error) {
            console.error("[/sifre_sifirla] Hata:", error.message);
            botInstance.sendMessage(chatId, "❌ Şifre sıfırlama sırasında hata oluştu.");
        }
    });

    const pendingTransferRequests = {};

    // NÖBET AL komutu - MEVCUT
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

            if (T.id === C.id) {
                if (X && X.id === T.id) {
                    return botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' });
                }
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.sendMessage(T.telegram_id, `✅ *${T.name}*, nöbeti (geri) aldınız.`, { parse_mode: 'Markdown' });
                if (X && X.id !== T.id && X.telegram_id) {
                    botInstance.sendMessage(X.telegram_id, `ℹ️ Nöbet, asıl nöbetçi *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
                return;
            }

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

    // CALLBACK QUERY handler'ı - MEVCUT
    botInstance.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const querierTelegramId = String(callbackQuery.from.id);
        if (!msg) return;
        const parts = data.split('_');
        if (parts.length < 4 || parts[0] !== 'nobet' || parts[1] !== 'onay') {
            botInstance.answerCallbackQuery(callbackQuery.id);
            return;
        }
        const action = parts[2];
        const requestId = parts.slice(3).join('_');
        const requestDetails = pendingTransferRequests[requestId];
        if (!requestDetails) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Geçersiz veya zaman aşımına uğramış istek." });
            botInstance.editMessageText("Bu nöbet devir isteği artık geçerli değil.", {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: null
            }).catch(e => console.warn("Mesaj düzenleme hatası:", e.message));
            return;
        }
        if (querierTelegramId !== String(requestDetails.approverNobetciTelegramId)) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Bu işlemi yapmaya yetkiniz yok." });
            return;
        }
        delete pendingTransferRequests[requestId];
        const { requesterChatId, requesterNobetciId, requesterNobetciAdi, approverNobetciAdi } = requestDetails;
        if (action === 'evet') {
            try {
                await axios.post(`${localApiBaseUrl}/nobetci/${requesterNobetciId}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.editMessageText(`✅ *${approverNobetciAdi}* tarafından ONAYLANDI.\nNöbet *${requesterNobetciAdi}*'a verildi.`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: null
                });
                botInstance.sendMessage(requesterChatId, `✅ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından onaylandı.`, { parse_mode: 'Markdown' });
            } catch (apiError) {
                console.error("Onay sonrası API hatası:", apiError.response ? apiError.response.data : apiError.message);
                botInstance.editMessageText(`❌ API hatası oluştu.`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    reply_markup: null
                });
                botInstance.sendMessage(requesterChatId, `❌ Nöbet aktarılırken API hatası oluştu.`);
            }
        } else if (action === 'hayir') {
            botInstance.editMessageText(`❌ *${approverNobetciAdi}* tarafından REDDEDİLDİ. (*${requesterNobetciAdi}* için)`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: null
            });
            botInstance.sendMessage(requesterChatId, `❌ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
        }
        botInstance.answerCallbackQuery(callbackQuery.id);
    });

    // Bot komutlarını ayarla
    botInstance.setMyCommands([
        { command: '/menu', description: 'Komutları gösterir.' },
        { command: '/nobet_al', description: 'Nöbeti devralır/geri alır.' },
        { command: '/aktif_nobetci', description: 'Aktif nöbetçiyi gösterir.' },
        { command: '/nobet_kredi_durum', description: 'Kredi durumlarını listeler.' },
        { command: '/sifre_sifirla', description: 'Şifrenizi sıfırlar.' }
    ]).catch(err => console.error("Telegram komutları ayarlanırken hata:", err));

    return botInstance;
}

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