// Nobetciyim/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./db');
const { getAsilHaftalikNobetci, getAllNobetcilerFromDB } = require('./utils/calendarUtils');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

let botInstance = null;

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

    async function getAuthorizedNobetciByTelegramId(telegramId) {
        return new Promise((resolve) => {
            db.get("SELECT id, name, is_aktif, telegram_id FROM Nobetciler WHERE telegram_id = ?", [String(telegramId)], (err, row) => {
                if (err) { console.error("Yetkilendirme kontrolü sırasında DB hatası:", err.message); resolve(null); }
                resolve(row);
            });
        });
    }

    async function getCurrentlyActiveNobetciFromDB() {
        return new Promise((resolve, reject) => {
            db.get("SELECT id, name, telegram_id, is_aktif, kredi, pay_edilen_kredi FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
                if (err) { console.error("DB Error (getCurrentlyActiveNobetciFromDB):", err.message); reject(err); }
                else { resolve(row); }
            });
        });
    }

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

    const pendingTransferRequests = {};

    botInstance.onText(/^\/nobet_al$/, async (msg) => {
        const commandRequesterChatId = msg.chat.id;
        const commandRequesterTelegramId = String(commandRequesterChatId);
        const T = await getAuthorizedNobetciByTelegramId(commandRequesterTelegramId);

        if (!T) {
            botInstance.sendMessage(commandRequesterChatId, "❌ Bu komutu kullanma yetkiniz yok.");
            return;
        }
        try {
            const C = await getAsilHaftalikNobetci(new Date());
            if (!C || !C.id) {
                botInstance.sendMessage(T.telegram_id, "❌ Bu hafta için asıl nöbetçi belirlenemedi."); return;
            }
            const X = await getCurrentlyActiveNobetciFromDB();
            if (T.id === C.id) {
                if (X && X.id === T.id) {
                    botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' }); return;
                }
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.sendMessage(T.telegram_id, `✅ *${T.name}*, nöbeti (geri) aldınız.`, { parse_mode: 'Markdown' });
                if (X && X.id !== T.id && X.telegram_id) {
                    botInstance.sendMessage(X.telegram_id, `ℹ️ Nöbet, asıl nöbetçi *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
                return;
            }
            if (X && X.id === T.id) {
                 botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' }); return;
            }
            let approver = X || C;
            if (!approver || !approver.id || !approver.telegram_id) {
                botInstance.sendMessage(T.telegram_id, `❌ Nöbet devri için onaycı (aktif/asıl) bulunamadı veya Telegram ID'si eksik.`); return;
            }
            if (approver.id === T.id) {
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.sendMessage(T.telegram_id, `✅ Nöbeti aldınız (onay gerekmedi).`, { parse_mode: 'Markdown' });
                return;
            }
            const requestId = `ntr_${Date.now()}_${T.id}`;
            pendingTransferRequests[requestId] = {
                requesterChatId: T.telegram_id, requesterNobetciId: T.id, requesterNobetciAdi: T.name,
                approverNobetciId: approver.id, approverNobetciTelegramId: approver.telegram_id, approverNobetciAdi: approver.name,
                originalActiveNobetciId: X ? X.id : null, timestamp: Date.now()
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
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const querierTelegramId = String(callbackQuery.from.id);
        if (!msg) return;
        const parts = data.split('_');
        if (parts.length < 4 || parts[0] !== 'nobet' || parts[1] !== 'onay') { botInstance.answerCallbackQuery(callbackQuery.id); return; }
        const action = parts[2];
        const requestId = parts.slice(3).join('_');
        const requestDetails = pendingTransferRequests[requestId];
        if (!requestDetails) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Geçersiz veya zaman aşımına uğramış istek." });
            botInstance.editMessageText("Bu nöbet devir isteği artık geçerli değil.", { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: null }).catch(e => console.warn("Mesaj düzenleme hatası:", e.message));
            return;
        }
        if (querierTelegramId !== String(requestDetails.approverNobetciTelegramId)) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Bu işlemi yapmaya yetkiniz yok." }); return;
        }
        delete pendingTransferRequests[requestId];
        const { requesterChatId, requesterNobetciId, requesterNobetciAdi, approverNobetciAdi } = requestDetails;
        if (action === 'evet') {
            try {
                await axios.post(`${localApiBaseUrl}/nobetci/${requesterNobetciId}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.editMessageText(`✅ *${approverNobetciAdi}* tarafından ONAYLANDI.\nNöbet *${requesterNobetciAdi}*'a verildi.`, { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: null });
                botInstance.sendMessage(requesterChatId, `✅ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından onaylandı.`, { parse_mode: 'Markdown' });
            } catch (apiError) {
                console.error("Onay sonrası API hatası:", apiError.response ? apiError.response.data : apiError.message);
                botInstance.editMessageText(`❌ API hatası oluştu.`, { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: null });
                botInstance.sendMessage(requesterChatId, `❌ Nöbet aktarılırken API hatası oluştu.`);
            }
        } else if (action === 'hayir') {
            botInstance.editMessageText(`❌ *${approverNobetciAdi}* tarafından REDDEDİLDİ. (*${requesterNobetciAdi}* için)`, { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown', reply_markup: null });
            botInstance.sendMessage(requesterChatId, `❌ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
        }
        botInstance.answerCallbackQuery(callbackQuery.id);
    });

    botInstance.onText(/^\/aktif_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const aktifNobetci = await getCurrentlyActiveNobetciFromDB();
            botInstance.sendMessage(chatId, aktifNobetci ? `Aktif nöbetçi: *${aktifNobetci.name}*` : "Aktif nöbetçi yok.", { parse_mode: 'Markdown' });
        } catch (error) { botInstance.sendMessage(chatId, "❌ Aktif nöbetçi alınırken hata."); }
    });

    // GÜNCELLENMİŞ /nobet_kredi_durum İŞLEYİCİSİ
    botInstance.onText(/^\/nobet_kredi_durum$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);

        if (!nobetciYetkili) {
            botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
            return;
        }

        try {
            const nobetcilerRaw = await getAllNobetcilerFromDB();
            if (!nobetcilerRaw || nobetcilerRaw.length === 0) {
                botInstance.sendMessage(chatId, "Sistemde kayıtlı nöbetçi bulunmamaktadır.");
                return;
            }

            let nobetcilerFullData = [];
            for (const n of nobetcilerRaw) {
                const detay = await db.getNobetciById(n.id);
                if (detay) {
                    nobetcilerFullData.push({
                        id: detay.id,
                        name: detay.name,
                        pay_edilen_kredi: detay.pay_edilen_kredi || 0,
                        kredi: detay.kredi || 0, // Kazanılan kredi
                        kalan_kredi: (detay.pay_edilen_kredi || 0) - (detay.kredi || 0)
                    });
                }
            }

            // Nöbetçileri Kazanılan Krediye göre BÜYÜKTEN KÜÇÜĞE sırala
            nobetcilerFullData.sort((a, b) => b.kredi - a.kredi);

            let krediDurumMesaji = "📊 *Nöbetçi Kredi Durumları* 📊\n\n";
            const KREDI_PER_GUN = 2396; 

            for (const mevcutNobetci of nobetcilerFullData) {
                krediDurumMesaji += `*${mevcutNobetci.name}*:\n` +
                                  `  Pay Edilen: ${mevcutNobetci.pay_edilen_kredi}\n` +
                                  `  Kazanılan: ${mevcutNobetci.kredi}\n` +
                                  `  (Kalan: ${mevcutNobetci.kalan_kredi})\n`;

                let farkMesajlari = [];
                // Mevcut nöbetçiyi, kendisinden DAHA AZ kazanılmış kredisi olanlarla karşılaştır
                for (const digerNobetci of nobetcilerFullData) {
                    if (mevcutNobetci.id === digerNobetci.id) continue; 

                    if (mevcutNobetci.kredi > digerNobetci.kredi) { 
                        const krediFarki = mevcutNobetci.kredi - digerNobetci.kredi;
                        // Ondalıklı gün farkı hesapla (bir basamak)
                        const gunFarkiDecimal = (krediFarki / KREDI_PER_GUN).toFixed(1);
                        
                        // Eğer fark 0.0 ise gösterme, ama 0.1 gibi değerleri göster
                        if (parseFloat(gunFarkiDecimal) > 0) { 
                            farkMesajlari.push(`*${digerNobetci.name}*'den ${gunFarkiDecimal} gün ileridesiniz`);
                        }
                    }
                }

                if (farkMesajlari.length > 0) {
                    krediDurumMesaji += `  🦉 ${farkMesajlari.join(', ')}\n`;
                }
                krediDurumMesaji += `\n`; 
            }

            botInstance.sendMessage(chatId, krediDurumMesaji, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error("/nobet_kredi_durum işlenirken hata:", error.stack || error);
            botInstance.sendMessage(chatId, "❌ Kredi durumları alınırken bir hata oluştu.");
        }
    });
    
    botInstance.onText(/^\/sifre_sifirla$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
        if (!nobetci) { botInstance.sendMessage(chatId, "❌ Yetkiniz yok."); return; }
        try {
            const apiResponse = await axios.post(`${localApiBaseUrl}/nobetci/reset-password/${nobetci.id}`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` }});
            if (apiResponse.data && apiResponse.data.newPassword) {
                botInstance.sendMessage(chatId, `🔑 Yeni şifreniz: \`${apiResponse.data.newPassword}\`\nLütfen hemen değiştirin ve bu mesajı silin.`, { parse_mode: 'Markdown' });
            } else { throw new Error("API'den yeni şifre gelmedi."); }
        } catch (error) {
            console.error("Şifre sıfırlama API hatası:", error.response ? error.response.data : error.message);
            botInstance.sendMessage(chatId, `❌ Şifre sıfırlanırken hata: ${error.response ? error.response.data.error : error.message}`);
        }
    });

    botInstance.on('polling_error', (error) => console.error("Telegram polling hatası:", error.code, "-", error.message));
    botInstance.setMyCommands([
        { command: '/menu', description: 'Komutları gösterir.' },
        { command: '/nobet_al', description: 'Nöbeti devralır/geri alır.' },
        { command: '/aktif_nobetci', description: 'Aktif nöbetçiyi gösterir.' },
        { command: '/nobet_kredi_durum', description: 'Kredi durumlarını listeler.' },
        { command: '/sifre_sifirla', description: 'Şifrenizi sıfırlar.' },
    ]).catch(err => console.error("Telegram komutları ayarlanırken hata:", err));

    return botInstance;
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
        console.log(`Telegram grubuna (${groupId}) mesaj gönderildi: ${message.substring(0,70)}...`);
    } catch (error) {
        console.error(`Telegram grubuna (${groupId}) mesaj gönderilirken hata:`, error.response ? error.response.data : error.message, error.stack);
    }
}

module.exports = {
    init: initBot,
    sendTelegramMessageToGroup
};
