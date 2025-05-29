// node2/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // API istekleri için
const db = require('./db'); // Doğrudan DB erişimi
const { getAsilHaftalikNobetci, getAllNobetcilerFromDB } = require('./utils/calendarUtils'); // YENİ

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 3000}/api`;

if (!botToken) {
    console.error("HATA: TELEGRAM_BOT_TOKEN ortam değişkeni ayarlanmamış. Bot başlatılamıyor.");
    module.exports = {
        init: () => {
            console.warn("Telegram botu başlatılamadı: TELEGRAM_BOT_TOKEN eksik.");
        }
    };
    // return; // Eğer botToken yoksa burada scriptin devam etmesini engellemek iyi olabilir.
    // Ancak init fonksiyonu çağrılmadığı için zaten bot çalışmayacaktır.
}

const bot = new TelegramBot(botToken, { polling: true });
console.log("Telegram botu (onaylı devir v1) başlatıldı ve mesajları dinliyor...");

let pendingTransferRequests = {}; // Global (modül seviyesinde) transfer talepleri için

/**
 * Veritabanından o anki aktif nöbetçiyi (is_aktif=1) getirir.
 * @returns {Promise<Object|null>} Aktif nöbetçinin {id, name, telegram_id, is_aktif} objesini veya bulunamazsa null döner.
 */
async function getCurrentlyActiveNobetci() {
    return new Promise((resolve, reject) => {
        db.get("SELECT id, name, telegram_id, is_aktif FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
            if (err) {
                console.error("DB Error (getCurrentlyActiveNobetci):", err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Yetkilendirme fonksiyonu: Verilen Telegram ID'sinin sistemde kayıtlı bir nöbetçiye ait olup olmadığını kontrol eder.
// getAllNobetcilerFromDB zaten bu işi yapacak, bu fonksiyon yerine onu kullanabiliriz veya bu kalabilir.
async function getAuthorizedNobetciByTelegramId(telegramId) {
    return new Promise((resolve) => {
        db.get("SELECT id, name, is_aktif, telegram_id FROM Nobetciler WHERE telegram_id = ?", [String(telegramId)], (err, row) => {
            if (err) {
                console.error("Yetkilendirme kontrolü sırasında DB hatası:", err.message);
                resolve(null);
            }
            resolve(row);
        });
    });
}


// "/start" veya "/menu" komutu işleyicisi
bot.onText(/^\/(start|menu)$/, async (msg) => {
    const chatId = msg.chat.id;
    const nobetci = await getAuthorizedNobetciByTelegramId(chatId);

    let menuText = `Merhaba! Nöbetçi Uygulamasına Hoş Geldiniz.\n`;

    if (nobetci) {
        menuText += `Merhaba *${nobetci.name}*!\n`;
        menuText += `Kullanabileceğiniz komutlar:\n\n` +
                    `*/nobet_al* - Nöbeti devralmak/geri almak için kullanılır (gerekirse onay istenir).\n\n` +
                    `*/aktif_nobetci* - Şu anki aktif nöbetçiyi gösterir.\n\n` +
                    `*/nobet_kredi_durum* - Tüm nöbetçilerin kredi durumlarını listeler.\n\n` +
                    `*/sifre_sifirla* - Kendi şifrenizi sıfırlar ve yeni şifrenizi özel mesaj olarak alırsınız.`;
    } else {
        menuText += `Bu botu kullanabilmek için Telegram ID'nizin sistemdeki bir nöbetçiyle eşleştirilmiş olması gerekmektedir. Lütfen yöneticinizle iletişime geçin.`;
    }

    bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
});

// "/nobet_al" komutu işleyicisi
bot.onText(/^\/nobet_al$/, async (msg) => {
    const commandRequesterChatId = msg.chat.id;
    const commandRequesterTelegramId = String(commandRequesterChatId);

    let commandRequesterNobetci; // Komutu kullanan nöbetçinin DB bilgileri
    try {
        // Direkt yetkili kullanıcıyı telegram ID'sinden çekelim.
        commandRequesterNobetci = await getAuthorizedNobetciByTelegramId(commandRequesterTelegramId);

        if (!commandRequesterNobetci) {
            bot.sendMessage(commandRequesterChatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır. Telegram ID'niz sistemde bir nöbetçi ile eşleşmiyor.");
            return;
        }
    } catch (error) {
        console.error("Nobet al (yetki kontrolu) sirasinda hata:", error);
        bot.sendMessage(commandRequesterChatId, "❌ Yetki kontrolü sırasında bir hata oluştu. Lütfen tekrar deneyin.");
        return;
    }

    const T = commandRequesterNobetci; // Talep Eden Kişi

    try {
        const C = await getAsilHaftalikNobetci(new Date()); // Haftanın Asıl Nöbetçisi
        if (!C || !C.id) { // C null veya id'si yoksa
            bot.sendMessage(T.telegram_id, "❌ Bu hafta için asıl nöbetçi belirlenemedi. Lütfen yönetici ile iletişime geçin.");
            return;
        }

        const X = await getCurrentlyActiveNobetci(); // Anlık Aktif Nöbetçi

        console.log(`[NobetAl] Talep Eden (T): ${T.name} (ID: ${T.id}, TG: ${T.telegram_id})`);
        console.log(`[NobetAl] Haftanın Asıl (C): ${C.name} (ID: ${C.id}, TG: ${C.telegram_id})`);
        if (X) {
            console.log(`[NobetAl] Anlık Aktif (X): ${X.name} (ID: ${X.id}, TG: ${X.telegram_id})`);
        } else {
            console.log("[NobetAl] Anlık Aktif (X): Bulunmuyor");
        }

        // Durum 1: Talep eden (T), Haftanın Asıl Nöbetçisi (C) ise
        if (T.id === C.id) {
            console.log(`[NobetAl] Durum 1: Asıl nöbetçi (${C.name}) nöbeti geri alıyor.`);
            if (X && X.id === T.id) {
                bot.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz. Herhangi bir değişiklik yapılmadı.`, { parse_mode: 'Markdown' });
                return;
            }
            try {
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, {
                    headers: { 'Authorization': 'Bearer ' + process.env.INTERNAL_API_TOKEN }
                });
                bot.sendMessage(T.telegram_id, `✅ *${T.name}*, nöbeti başarıyla (geri) aldınız. Artık aktif nöbetçisiniz!`, { parse_mode: 'Markdown' });
                if (X && X.id !== T.id && X.telegram_id) {
                    bot.sendMessage(X.telegram_id, `ℹ️ Bilgilendirme: Nöbet, haftanın asıl nöbetçisi olan *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
            } catch (apiError) {
                console.error("[NobetAl] Durum 1 API Hatası:", apiError.response ? (apiError.response.data.error || JSON.stringify(apiError.response.data)) : apiError.message);
                bot.sendMessage(T.telegram_id, "❌ Nöbet alınırken bir API hatası oluştu.");
            }
            return;
        }

        // Durum 2: Talep eden (T), Haftanın Asıl Nöbetçisi (C) değilse
        console.log(`[NobetAl] Durum 2: ${T.name}, nöbeti devralmak istiyor. Onay istenecek.`);

        if (X && X.id === T.id) { // Eğer T zaten aktifse (ve C değilse, bu durum yukarıda yakalanırdı)
             bot.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz. Herhangi bir değişiklik yapılmadı.`, { parse_mode: 'Markdown' });
             return;
        }

        // Onay verecek kişiyi belirle: Her zaman Anlık Aktif Nöbetçi (X).
        // Eğer X yoksa, onay Haftanın Asıl Nöbetçisi'nden (C) istenir.
        let approver = X;
        if (!X) { // Eğer o an aktif bir nöbetçi yoksa
            console.log("[NobetAl] Anlık aktif nöbetçi (X) yok. Onay için Haftanın Asıl Nöbetçisi (C) kullanılacak.");
            approver = C;
        }
        
        // Eğer onaycı belirlenememişse veya Telegram ID'si yoksa
        if (!approver || !approver.id || !approver.telegram_id) {
            bot.sendMessage(T.telegram_id, `❌ Nöbet devri için onay alınabilecek bir kullanıcı (aktif veya asıl nöbetçi) bulunamadı veya Telegram ID'si eksik.`);
            console.error(`[NobetAl] Onaycı (aktif veya asıl) bulunamadı veya TG ID'si eksik. X: ${X ? X.name : 'Yok'}, C: ${C.name}`);
            return;
        }
        
        // Talep eden kişi, onay verecek kişiyle aynı olamaz (bu durum C'nin C'den onay istemesi gibi bir anlama gelmemeli)
        if (approver.id === T.id) {
             console.log(`[NobetAl] Talep eden kişi (${T.name}) aynı zamanda onaycı (${approver.name}) olarak belirlendi. Bu genellikle asıl nöbetçinin zaten aktif olduğu anlamına gelir. Direkt devir denenecek.`);
              try {
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, {
                    headers: { 'Authorization': 'Bearer ' + process.env.INTERNAL_API_TOKEN }
                });
                bot.sendMessage(T.telegram_id, `✅ Nöbeti aldınız (onay gerekmedi). Artık aktif nöbetçisiniz!`, { parse_mode: 'Markdown' });
                // Eğer X vardı ve T'den farklıysa (bu blokta X, T ile aynı olmalıydı, ama yine de kontrol edelim)
                if(X && X.id !== T.id && X.telegram_id) {
                     bot.sendMessage(X.telegram_id, `ℹ️ Bilgilendirme: Nöbet, *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
            } catch (apiError) {
                console.error("[NobetAl] Kendine onay gibi görünen durum API Hatası:", apiError.response ? (apiError.response.data.error || JSON.stringify(apiError.response.data)) : apiError.message);
                bot.sendMessage(T.telegram_id, "❌ Nöbet alınırken bir API hatası oluştu.");
            }
            return;
        }

        const requestId = `ntr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        pendingTransferRequests[requestId] = {
            requesterChatId: T.telegram_id,
            requesterNobetciId: T.id,
            requesterNobetciAdi: T.name,
            approverNobetciId: approver.id,
            approverNobetciTelegramId: approver.telegram_id,
            approverNobetciAdi: approver.name,
            originalActiveNobetciId: X ? X.id : null,
            timestamp: Date.now()
        };

        const onayMesaji = `Merhaba *${approver.name}*,\n*${T.name}* adlı kullanıcı, nöbeti sizden devralmak istiyor. Onaylıyor musunuz?`;
        try {
            await bot.sendMessage(approver.telegram_id, onayMesaji, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Evet, Onayla ✅", callback_data: `nobet_onay_evet_${requestId}` },
                            { text: "Hayır, Reddet ❌", callback_data: `nobet_onay_hayir_${requestId}` }
                        ]
                    ]
                }
            });
            bot.sendMessage(T.telegram_id, `Nöbet devir isteğiniz *${approver.name}* adlı kullanıcıya iletilmiştir. Onay bekleniyor...`, { parse_mode: 'Markdown' });
        } catch (sendError) {
             console.error(`[NobetAl] Onay mesajı gönderilemedi (${approver.name} - ${approver.telegram_id}):`, sendError.response ? sendError.response.status : sendError.message);
             bot.sendMessage(T.telegram_id, `❌ Nöbet devir isteği *${approver.name}* adlı kullanıcıya iletilemedi. (Hata: ${sendError.message}). Lütfen Telegram ID'sinin doğru olduğundan emin olun veya yönetici ile iletişime geçin.`);
             delete pendingTransferRequests[requestId];
        }

    } catch (error) {
        console.error("[NobetAl] Genel Hata:", error.stack || error);
        bot.sendMessage(commandRequesterChatId, "❌ Nöbet alma işlemi sırasında beklenmedik bir hata oluştu. Lütfen tekrar deneyin.");
    }
});


// "/aktif_nobetci" komutu işleyicisi
bot.onText(/^\/aktif_nobetci$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const aktifNobetci = await getCurrentlyActiveNobetci(); // Bu fonksiyonu kullanıyoruz
        if (aktifNobetci) {
            bot.sendMessage(chatId, `Şu anki aktif nöbetçi: *${aktifNobetci.name}*`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, "Şu anda aktif nöbetçi bulunmamaktadır.");
        }
    } catch (error) {
        console.error("/aktif_nobetci işlenirken hata:", error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, "❌ Aktif nöbetçi bilgisi alınırken bir hata oluştu.");
    }
});

// "/nobet_kredi_durum" komutu
bot.onText(/^\/nobet_kredi_durum$/, async (msg) => {
    const chatId = msg.chat.id;
    const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);

    if (!nobetciYetkili) {
        bot.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
        return;
    }

    try {
        // Nöbetçi kredilerini API üzerinden çekmek yerine direkt DB'den alabiliriz (tüm bilgilerle).
        // Ancak API endpoint'i zaten varsa, onu kullanmak da tutarlılık sağlar.
        // Şimdilik API üzerinden gidelim, ama getAllNobetcilerFromDB() de kullanılabilirdi.
        const response = await axios.get(`${localApiBaseUrl}/nobetci`, {
            headers: { 'Authorization': 'Bearer ' + process.env.INTERNAL_API_TOKEN }
        });
        const nobetcilerList = response.data;
        if (nobetcilerList && nobetcilerList.length > 0) {
            let krediDurumMesaji = "📊 *Nöbetçi Kredi Durumları* 📊\n\n";
            nobetcilerList.forEach(n => {
                const kazanilanKredi = n.kredi || 0;
                const payEdilenKredi = n.pay_edilen_kredi || 0;
                const kalanKredi = payEdilenKredi - kazanilanKredi;
                krediDurumMesaji += `*${n.name}*:\n` +
                                  `  Kazanılan: ${kazanilanKredi}\n` +
                                  `  Pay Edilen: ${payEdilenKredi}\n` +
                                  `  Kalan: ${kalanKredi}\n\n`;
            });
            bot.sendMessage(chatId, krediDurumMesaji, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, "Sistemde kayıtlı nöbetçi bulunmamaktadır.");
        }
    } catch (error) {
        console.error("/nobet_kredi_durum işlenirken hata:", error.response ? (error.response.data.error || JSON.stringify(error.response.data)) : error.message);
        bot.sendMessage(chatId, "❌ Kredi durumları alınırken bir hata oluştu.");
    }
});

// "/sifre_sifirla" komutu
bot.onText(/^\/sifre_sifirla$/, async (msg) => {
    const chatId = msg.chat.id;
    const nobetci = await getAuthorizedNobetciByTelegramId(chatId);

    if (!nobetci) {
        bot.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
        return;
    }

    try {
        console.log(`Bot: ${nobetci.name} (ID: ${nobetci.id}) için şifre sıfırlama talebi...`);
        const resetResponse = await axios.post(`${localApiBaseUrl}/nobetci/reset-password/${nobetci.id}`, {}, {
            headers: { 'Authorization': 'Bearer ' + process.env.INTERNAL_API_TOKEN }
        });

        if (resetResponse.status === 200 && resetResponse.data && resetResponse.data.newPassword) {
            const successMessage = `🔑 Şifreniz başarıyla sıfırlandı!\nYeni şifreniz: \`${resetResponse.data.newPassword}\`\n\nLütfen bu şifreyi güvenli bir yere not edin ve ilk fırsatta web arayüzünden değiştirin. Bu mesajı sildiğinizden emin olun.`;
            bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
            console.log(`Bot: ${nobetci.name} için şifre sıfırlandı. Yeni şifre kullanıcıya gönderildi.`);
        } else {
            console.error("/sifre_sifirla - reset-password API yanıtı beklenmedik:", resetResponse.status, resetResponse.data);
            throw new Error(`Şifre sıfırlama API hatası: ${resetResponse.status}`);
        }
    } catch (error) {
        const errorMessage = error.response ? (error.response.data.error || JSON.stringify(error.response.data)) : error.message;
        console.error("/sifre_sifirla işlenirken hata:", errorMessage);
        bot.sendMessage(chatId, `❌ Şifre sıfırlanırken bir hata oluştu: ${errorMessage}.`);
    }
});

// Callback query (onay/red butonları) işleyicisi
bot.on('callback_query', async (callbackQuery) => {
    const originalMessage = callbackQuery.message;
    const callbackData = callbackQuery.data;
    const querierTelegramId = String(callbackQuery.from.id);

    console.log(`[CallbackQuery] Data: ${callbackData}, From: ${callbackQuery.from.first_name} (ID: ${querierTelegramId})`);

    if (!originalMessage) {
        console.warn("[CallbackQuery] Orijinal mesaj bilgisi yok, işlem yapılamıyor.");
        bot.answerCallbackQuery(callbackQuery.id, { text: "Bir hata oluştu (mesaj bilgisi eksik)."});
        return;
    }

    const parts = callbackData.split('_');
    if (parts.length < 4 || parts[0] !== 'nobet' || parts[1] !== 'onay') {
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    const action = parts[2]; // 'evet' veya 'hayir'
    const requestId = parts.slice(3).join('_');

    const requestDetails = pendingTransferRequests[requestId];

    if (!requestDetails) {
        bot.answerCallbackQuery(callbackQuery.id, { text: "Bu istek zaman aşımına uğramış veya geçersiz." });
        try {
            await bot.editMessageText("Bu nöbet devir isteği artık geçerli değil veya daha önce işleme alınmış.", {
                chat_id: originalMessage.chat.id,
                message_id: originalMessage.message_id,
                reply_markup: null
            });
        } catch (editError) {
            console.warn("[CallbackQuery] Mesaj düzenlenirken hata (geçersiz istek):", editError.response ? editError.response.status : editError.message);
        }
        return;
    }

    if (querierTelegramId !== String(requestDetails.approverNobetciTelegramId)) {
        bot.answerCallbackQuery(callbackQuery.id, { text: "Bu işlemi yapmaya yetkiniz yok." });
        console.warn(`[CallbackQuery] Yetkisiz erişim denemesi. Beklenen: ${requestDetails.approverNobetciTelegramId}, Gelen: ${querierTelegramId}`);
        return;
    }

    delete pendingTransferRequests[requestId]; // İsteği işle, tekrar kullanılmasın.

    const onayiVerenKullaniciAdi = requestDetails.approverNobetciAdi;
    const nobetiAlanKullaniciAdi = requestDetails.requesterNobetciAdi;

    if (action === 'evet') {
        try {
            await axios.post(`${localApiBaseUrl}/nobetci/${requestDetails.requesterNobetciId}/set-aktif`, {}, {
                headers: { 'Authorization': 'Bearer ' + process.env.INTERNAL_API_TOKEN }
            });

            await bot.editMessageText(
                `✅ Nöbet devri tarafınızdan (*${onayiVerenKullaniciAdi}*) ONAYLANDI.\nNöbet *${nobetiAlanKullaniciAdi}* adlı kullanıcıya verildi.`,
                {
                    chat_id: originalMessage.chat.id,
                    message_id: originalMessage.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: null
                }
            );
            bot.sendMessage(requestDetails.requesterChatId, `✅ Nöbet devir isteğiniz *${onayiVerenKullaniciAdi}* tarafından onaylandı. Artık aktif nöbetçisiniz!`, { parse_mode: 'Markdown' });
            console.log(`[CallbackQuery] ${onayiVerenKullaniciAdi}, ${nobetiAlanKullaniciAdi}'nın nöbet talebini onayladı.`);

        } catch (apiError) {
            const errorMsg = apiError.response ? (apiError.response.data.error || JSON.stringify(apiError.response.data)) : apiError.message;
            console.error("[CallbackQuery] Onay sonrası API Hatası:", errorMsg);
            try {
                await bot.editMessageText(`❌ Nöbet devri sırasında bir API hatası oluştu (${errorMsg}). Lütfen daha sonra tekrar deneyin.`, {
                    chat_id: originalMessage.chat.id,
                    message_id: originalMessage.message_id,
                    reply_markup: null
                });
            } catch (editErrorInner) { console.warn("[CallbackQuery] Hata mesajı düzenlenirken hata:", editErrorInner.message); }
            bot.sendMessage(requestDetails.requesterChatId, `❌ Nöbet devir isteğiniz onaylandı ancak nöbet aktarılırken bir API hatası oluştu.`);
        }
    } else if (action === 'hayir') {
        try {
            await bot.editMessageText(
                `❌ Nöbet devri tarafınızdan (*${onayiVerenKullaniciAdi}*) REDDEDİLDİ. (*${nobetiAlanKullaniciAdi}* için)`,
                {
                    chat_id: originalMessage.chat.id,
                    message_id: originalMessage.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: null
                }
            );
        } catch (editError) { console.warn("[CallbackQuery] Red mesajı düzenlenirken hata:", editError.message); }
        bot.sendMessage(requestDetails.requesterChatId, `❌ Nöbet devir isteğiniz *${onayiVerenKullaniciAdi}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
        console.log(`[CallbackQuery] ${onayiVerenKullaniciAdi}, ${nobetiAlanKullaniciAdi}'nın nöbet talebini reddetti.`);
    }
    bot.answerCallbackQuery(callbackQuery.id);
});


// Botun başlatılması ve hata yönetimi
function initBot() {
    if (!botToken) return; // Token yoksa başlatma.

    console.log("Telegram botu (onaylı devir v1) başlatılıyor...");
    bot.on('polling_error', (error) => {
        console.error("Telegram polling hatası:", error.code, "-", error.message);
    });
    bot.on('webhook_error', (error) => {
        console.error("Telegram webhook hatası:", error.code, "-", error.message);
    });

    bot.setMyCommands([
        { command: '/menu', description: 'Kullanılabilir komutları gösterir.' },
        { command: '/nobet_al', description: 'Nöbeti devralır/geri alır (onaylı/onaysız).' },
        { command: '/aktif_nobetci', description: 'Mevcut aktif nöbetçiyi gösterir.' },
        { command: '/nobet_kredi_durum', description: 'Nöbetçilerin kredi durumlarını listeler.' },
        { command: '/sifre_sifirla', description: 'Şifrenizi sıfırlar ve yenisini gönderir.' },
    ]).then(() => {
        console.log("Telegram bot komutları ayarlandı.");
    }).catch(err => {
        console.error("Telegram bot komutları ayarlanırken hata:", err);
    });
}

module.exports = {
    init: initBot
};