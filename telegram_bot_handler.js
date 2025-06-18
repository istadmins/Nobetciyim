// Nobetciyim/telegram_bot_handler.js
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const db = require('./db'); // db.js dosyanızın doğru yolu olduğundan emin olun
const { getAsilHaftalikNobetci, getAllNobetcilerFromDB } = require('./utils/calendarUtils'); // calendarUtils.js dosyanızın doğru yolu
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

let botInstance = null;

function initBot() {
    if (!botToken) {
        console.error("HATA: TELEGRAM_BOT_TOKEN ortam değişkeni ayarlanmamış. Bot başlatılamıyor.");
        return;
    }

    if (botInstance) return botInstance;

    botInstance = new TelegramBot(botToken, { polling: true });
    console.log("Telegram botu başlatıldı ve mesajları dinliyor...");

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

    async function getCurrentlyActiveNobetciFromDB() {
        return new Promise((resolve, reject) => {
            db.get("SELECT * FROM Nobetciler WHERE is_aktif = 1", [], (err, row) => {
                if (err) {
                    console.error("DB Error (getCurrentlyActiveNobetciFromDB):", err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async function getNextWeekNobetci() {
        try {
            const today = new Date();
            const nextWeekDate = new Date(today);
            nextWeekDate.setDate(today.getDate() + 7);
            const nextWeekNobetci = await getAsilHaftalikNobetci(nextWeekDate);
            return nextWeekNobetci;
        } catch (error) {
            console.error("Gelecek hafta nöbetçi alınırken hata:", error);
            return null;
        }
    }

    async function getTakvimAciklamasi(yil, hafta) {
        return new Promise((resolve) => {
            // db.js içinde getTakvimAciklamasiByYilHafta gibi bir fonksiyonunuz olabilir
            // veya doğrudan sorgu:
            db.get("SELECT aciklama FROM takvim_aciklamalari WHERE yil = ? AND hafta = ?", [yil, hafta], (err, row) => {
                if (err) {
                    console.error("Takvim açıklaması alınırken hata:", err.message);
                    resolve(null);
                } else {
                    resolve(row ? row.aciklama : null);
                }
            });
        });
    }

    function getWeekInfo(date) {
        // Bu fonksiyon ISO hafta numarasını döndürmeli, calendarUtils.getWeekOfYear ile aynı olmalı
        const target = new Date(date.valueOf());
        const dayNr = (date.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        const tempDate = new Date(target.getFullYear(), 0, 1);
        if (tempDate.getDay() !== 4) {
            tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
        }
        const weekNumber = 1 + Math.ceil((firstThursday - tempDate) / (7 * 24 * 3600 * 1000));
        return { year: date.getFullYear(), week: weekNumber };
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
                `*/gelecek_hafta_nobetci* - Gelecek hafta nöbetçi olan kişiyi gösterir.\n` +
                `*/sifre_sifirla* - Şifrenizi sıfırlar (DM ile gönderilir).`;
        } else {
            menuText += `Bu botu kullanabilmek için Telegram ID'nizin sistemdeki bir nöbetçiyle eşleştirilmiş olması gerekmektedir.`;
        }
        botInstance.sendMessage(chatId, menuText, { parse_mode: 'Markdown' });
    });

    const pendingTransferRequests = {}; // { requestId: { ..., timeoutId: ..., approverMessageId: ..., approverChatId: ... } }

    botInstance.onText(/^\/nobet_al$/, async (msg) => {
        const commandRequesterChatId = msg.chat.id;
        const commandRequesterTelegramId = String(commandRequesterChatId);
        const T = await getAuthorizedNobetciByTelegramId(commandRequesterTelegramId); // Komutu isteyen kişi

        if (!T) {
            botInstance.sendMessage(commandRequesterChatId, "❌ Bu komutu kullanma yetkiniz yok.");
            return;
        }

        try {
            const C = await getAsilHaftalikNobetci(new Date()); // Mevcut haftanın ASIL nöbetçisi (override'ları dikkate alır)
            if (!C || !C.id) {
                botInstance.sendMessage(T.telegram_id, "❌ Bu hafta için asıl nöbetçi belirlenemedi.");
                return;
            }

            const X = await getCurrentlyActiveNobetciFromDB(); // Mevcut AKTİF nöbetçi

            // DURUM 1: Komutu kullanan kişi (T), bu haftanın ASIL nöbetçisi (C) ise
            if (T.id === C.id) {
                if (X && X.id === T.id) {
                    botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' });
                    return;
                }
                await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                botInstance.sendMessage(T.telegram_id, `✅ *${T.name}*, nöbeti (geri) aldınız. Onay gerekmedi.`, { parse_mode: 'Markdown' });
                if (X && X.id !== T.id && X.telegram_id) {
                    botInstance.sendMessage(X.telegram_id, `ℹ️ Nöbet, asıl nöbetçi *${T.name}* tarafından devralındı.`, { parse_mode: 'Markdown' });
                }
                return;
            }

            // DURUM 2: Komutu kullanan kişi (T), zaten AKTİF nöbetçi ise (ama asıl olmayabilir)
            if (X && X.id === T.id) {
                botInstance.sendMessage(T.telegram_id, `ℹ️ *${T.name}*, zaten aktif nöbetçisiniz.`, { parse_mode: 'Markdown' });
                return;
            }

            // DURUM 3: Komutu kullanan kişi (T), ne ASIL ne de AKTİF nöbetçi. Devir isteyecek.
            // Onaycı, öncelikle mevcut aktif nöbetçi (X), eğer yoksa bu haftanın asıl nöbetçisi (C) olur.
            let approver = X || C;
            if (!approver || !approver.id || !approver.telegram_id) {
                botInstance.sendMessage(T.telegram_id, `❌ Nöbet devri için onaycı (aktif veya asıl) bulunamadı veya Telegram ID'si eksik.`);
                return;
            }

            // Eğer bir şekilde onaycı ile isteyen aynı kişi olursa (bu durum yukarıdaki kontrollerle yakalanmalı ama güvenlik için)
            if (approver.id === T.id) {
                 await axios.post(`${localApiBaseUrl}/nobetci/${T.id}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                 botInstance.sendMessage(T.telegram_id, `✅ Nöbeti aldınız (onay gerekmedi, durum nadir).`, { parse_mode: 'Markdown' });
                 return;
            }

            const requestId = `ntr_${Date.now()}_${T.id}`;
            const onayMesaji = `Merhaba *${approver.name}*,\n*${T.name}* nöbeti devralmak istiyor. Onaylıyor musunuz? (2 dk süreniz var)`;
            
            const sentApprovalMessage = await botInstance.sendMessage(approver.telegram_id, onayMesaji, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Evet ✅", callback_data: `nobet_onay_evet_${requestId}` },
                        { text: "Hayır ❌", callback_data: `nobet_onay_hayir_${requestId}` }
                    ]]
                }
            });

            const TIMEOUT_MS = 2 * 60 * 1000; // 2 dakika
            const timeoutId = setTimeout(async () => {
                const requestDetails = pendingTransferRequests[requestId];
                if (requestDetails) { // İstek hala beklemedeyse (onay/red gelmediyse)
                    delete pendingTransferRequests[requestId]; // Zaman aşımına uğradı, listeden sil

                    try {
                        await botInstance.editMessageText(
                            `Bu nöbet devir isteği (*${requestDetails.requesterNobetciAdi}* için) zaman aşımına uğradı. Artık yanıt verilemez.`,
                            {
                                chat_id: requestDetails.approverChatId,
                                message_id: requestDetails.approverMessageId,
                                reply_markup: null // Butonları kaldır
                            }
                        );
                    } catch (editError) {
                        console.warn("Zaman aşımı sonrası onay mesajı düzenleme hatası:", editError.message);
                    }

                    botInstance.sendMessage(
                        requestDetails.requesterChatId,
                        `❌ Nöbet devir isteğiniz *${requestDetails.approverNobetciAdi}* tarafından zamanında yanıtlanmadı ve zaman aşımına uğradı.`,
                        { parse_mode: 'Markdown' }
                    );
                }
            }, TIMEOUT_MS);

            pendingTransferRequests[requestId] = {
                requesterChatId: T.telegram_id,
                requesterNobetciId: T.id,
                requesterNobetciAdi: T.name,
                approverNobetciId: approver.id,
                approverNobetciTelegramId: approver.telegram_id,
                approverNobetciAdi: approver.name,
                approverMessageId: sentApprovalMessage.message_id,
                approverChatId: sentApprovalMessage.chat.id, // veya approver.telegram_id
                originalActiveNobetciId: X ? X.id : null,
                timestamp: Date.now(),
                timeoutId: timeoutId
            };

            botInstance.sendMessage(T.telegram_id, `Nöbet devir isteğiniz *${approver.name}*'a iletildi... (2 dakika içinde yanıt bekleniyor)`, { parse_mode: 'Markdown' });

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
        if (parts.length < 4 || parts[0] !== 'nobet' || parts[1] !== 'onay') {
            botInstance.answerCallbackQuery(callbackQuery.id);
            return;
        }

        const action = parts[2]; // 'evet' veya 'hayir'
        const requestId = parts.slice(3).join('_');
        const requestDetails = pendingTransferRequests[requestId];

        if (!requestDetails) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Geçersiz veya zaman aşımına uğramış istek." });
            try {
                await botInstance.editMessageText("Bu nöbet devir isteği artık geçerli değil veya zaman aşımına uğradı.", {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    reply_markup: null
                });
            } catch (e) { console.warn("Callback sonrası mesaj düzenleme hatası (geçersiz istek):", e.message); }
            return;
        }

        if (querierTelegramId !== String(requestDetails.approverNobetciTelegramId)) {
            botInstance.answerCallbackQuery(callbackQuery.id, { text: "Bu işlemi yapmaya yetkiniz yok." });
            return;
        }

        // Onay/Red geldi, zaman aşımı zamanlayıcısını temizle ve isteği sil
        clearTimeout(requestDetails.timeoutId);
        delete pendingTransferRequests[requestId];

        const { requesterChatId, requesterNobetciId, requesterNobetciAdi, approverNobetciAdi } = requestDetails;

        if (action === 'evet') {
            try {
                await axios.post(`${localApiBaseUrl}/nobetci/${requesterNobetciId}/set-aktif`, {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
                await botInstance.editMessageText(`✅ *${approverNobetciAdi}* tarafından ONAYLANDI.\nNöbet *${requesterNobetciAdi}*'a verildi.`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: null
                });
                botInstance.sendMessage(requesterChatId, `✅ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından onaylandı.`, { parse_mode: 'Markdown' });
            } catch (apiError) {
                console.error("Onay sonrası API hatası:", apiError.response ? apiError.response.data : apiError.message);
                await botInstance.editMessageText(`❌ API hatası oluştu. Nöbet devri başarısız.`, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    reply_markup: null
                });
                botInstance.sendMessage(requesterChatId, `❌ Nöbet aktarılırken API hatası oluştu.`);
            }
        } else if (action === 'hayir') {
            await botInstance.editMessageText(`❌ *${approverNobetciAdi}* tarafından REDDEDİLDİ. (*${requesterNobetciAdi}* için nöbet devir isteği)`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: null
            });
            botInstance.sendMessage(requesterChatId, `❌ Nöbet devir isteğiniz *${approverNobetciAdi}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
        }
        botInstance.answerCallbackQuery(callbackQuery.id);
    });

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

    botInstance.onText(/^\/gelecek_hafta_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);
        if (!nobetciYetkili) {
            botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
            return;
        }
        try {
            const gelecekHaftaNobetci = await getNextWeekNobetci();
            if (!gelecekHaftaNobetci) {
                botInstance.sendMessage(chatId, "❌ Gelecek hafta için nöbetçi bilgisi bulunamadı.");
                return;
            }

            const today = new Date();
            const nextWeekDate = new Date(today);
            nextWeekDate.setDate(today.getDate() + 7);

            const haftaBasi = new Date(nextWeekDate);
            haftaBasi.setDate(nextWeekDate.getDate() - ((nextWeekDate.getDay() + 6) % 7)); // Pazartesi (ISO standardına göre)
            const haftaSonu = new Date(haftaBasi);
            haftaSonu.setDate(haftaBasi.getDate() + 6); // Pazar

            const formatTarih = (tarih) => {
                return tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
            };

            let mesaj = `📅 *Gelecek Hafta Nöbetçi Bilgisi*\n\n`;
            mesaj += `🗓️ Hafta Aralığı: ${formatTarih(haftaBasi)} - ${formatTarih(haftaSonu)}\n`;
            mesaj += `👤 Nöbetçi: *${gelecekHaftaNobetci.name}*\n`;

            const weekInfo = getWeekInfo(nextWeekDate); // ISO hafta no ve yıl
            const aciklama = await getTakvimAciklamasi(weekInfo.year, weekInfo.week);
            if (aciklama && aciklama.aciklama) {
                message += `\n\n📝 *Hafta Notu:* ${aciklama.aciklama}`;
            }

            botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/gelecek_hafta_nobetci işlenirken hata:", error.stack || error);
            botInstance.sendMessage(chatId, "❌ Gelecek hafta nöbetçi bilgisi alınırken bir hata oluştu.");
        }
    });

    botInstance.onText(/^\/nobet_kredi_durum$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);
        if (!nobetciYetkili) {
            botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
            return;
        }
        try {
            const nobetcilerFullData = await new Promise((resolve, reject) => {
                db.all("SELECT id, name, pay_edilen_kredi, kredi, is_aktif FROM Nobetciler ORDER BY kredi DESC", [], (err, rows) => {
                    if (err) {
                        console.error("Kredi durumu DB hatası:", err.message);
                        reject(err);
                    } else {
                        resolve(rows.map(row => ({
                            id: row.id,
                            name: row.name,
                            pay_edilen_kredi: row.pay_edilen_kredi || 0,
                            kredi: row.kredi || 0,
                            kalan_kredi: (row.pay_edilen_kredi || 0) - (row.kredi || 0),
                            is_aktif: row.is_aktif
                        })));
                    }
                });
            });

            if (!nobetcilerFullData || nobetcilerFullData.length === 0) {
                botInstance.sendMessage(chatId, "❌ Sistemde kayıtlı nöbetçi bulunamadı.");
                return;
            }

            nobetcilerFullData.sort((a, b) => b.kredi - a.kredi); // En çok kazanılandan en aza doğru

            let krediDurumMesaji = "📊 **Nöbetçi Kredi Durumları** 📊\n\n";
            const KREDI_PER_GUN = 2396; // Bu değeri kendi sisteminize göre ayarlayın

            for (const mevcutNobetci of nobetcilerFullData) {
                const aktifMi = mevcutNobetci.is_aktif ? "🟢 (Aktif)" : "⚪";
                krediDurumMesaji += `${aktifMi} *${mevcutNobetci.name}*:\n` +
                    `  💰 Pay Edilen: ${mevcutNobetci.pay_edilen_kredi}\n` +
                    `  🏆 Kazanılan: ${mevcutNobetci.kredi}\n` +
                    `  📉 Kalan: ${mevcutNobetci.kalan_kredi}\n`;

                let farkMesajlari = [];
                for (const digerNobetci of nobetcilerFullData) {
                    if (mevcutNobetci.id === digerNobetci.id) continue;
                    if (mevcutNobetci.kredi > digerNobetci.kredi) {
                        const krediFarki = mevcutNobetci.kredi - digerNobetci.kredi;
                        const gunFarkiDecimal = (krediFarki / KREDI_PER_GUN).toFixed(1);
                        if (parseFloat(gunFarkiDecimal) > 0) {
                            farkMesajlari.push(`*${digerNobetci.name}*'den ${gunFarkiDecimal} gün önde`);
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
        if (!nobetci) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok.");
        }
        try {
            const apiResponse = await axios.post(`${localApiBaseUrl}/nobetci/reset-password/${nobetci.id}`, {}, {
                headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` }
            });
            if (apiResponse.data && apiResponse.data.newPassword) {
                const mesaj = `🔑 **Şifreniz Sıfırlandı**\n\n` +
                    `Kullanıcı Adı: *${nobetci.name}*\n` +
                    `Yeni Şifre: \`${apiResponse.data.newPassword}\`\n\n` +
                    `⚠️ Bu mesajı kaydedin ve güvenli bir yerde saklayın!\n` +
                    `Lütfen web arayüzünden giriş yaparak şifrenizi hemen değiştirin ve bu mesajı silin.`;
                botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
            } else {
                throw new Error("API'den yeni şifre gelmedi.");
            }
        } catch (error) {
            console.error("Şifre sıfırlama API hatası:", error.response ? error.response.data : error.message);
            botInstance.sendMessage(chatId, `❌ Şifre sıfırlanırken hata: ${error.response && error.response.data && error.response.data.error ? error.response.data.error : error.message}`);
        }
    });

    botInstance.on('polling_error', (error) => console.error("Telegram polling hatası:", error.code, "-", error.message, error.stack));

    botInstance.setMyCommands([
        { command: '/menu', description: 'Komutları gösterir.' },
        { command: '/nobet_al', description: 'Nöbeti devralır/geri alır.' },
        { command: '/aktif_nobetci', description: 'Aktif nöbetçiyi gösterir.' },
        { command: '/nobet_kredi_durum', description: 'Kredi durumlarını listeler.' },
        { command: '/gelecek_hafta_nobetci', description: 'Gelecek hafta nöbetçiyi gösterir.' },
        { command: '/sifre_sifirla', description: 'Şifrenizi sıfırlar (DM ile gönderilir).' },
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
        console.log(`Telegram grubuna (${groupId}) mesaj gönderildi: ${message.substring(0, 70)}...`);
    } catch (error) {
        console.error(`Telegram grubuna (${groupId}) mesaj gönderilirken hata:`, error.response ? error.response.data : error.message, error.stack);
    }
}

// Bu fonksiyon, API üzerinden manuel bir değişiklik olduğunda çağrılır.
// Örneğin, /routes/nobetci.js veya /routes/takvim_remarks.js içinden.
async function notifyAllOfDutyChange(newActiveGuardName, triggeredBy = "API") {
    if (!botInstance) return;
    try {
        // Bu fonksiyon db.js içinde tanımlı olmalı: "SELECT DISTINCT telegram_id FROM Nobetciler WHERE telegram_id IS NOT NULL"
        const usersToSend = await db.getAllNobetcilerWithTelegramId(); // Bu fonksiyonun db.js'de olduğundan emin olun
        if (usersToSend && usersToSend.length > 0) {
            const message = `ℹ️ Nöbet Değişikliği (${triggeredBy}):\nYeni Aktif Nöbetçi: *${newActiveGuardName}*`;
            const sendPromises = usersToSend.map(user =>
                sendTelegramMessageToGroup(user.telegram_id, message)
                .catch(err => { /* Belirli bir kullanıcıya gönderim hatasını loglayabilir veya yok sayabilirsiniz */ })
            );
            await Promise.all(sendPromises);
            console.log(`[Bildirim] ${usersToSend.length} kullanıcıya nöbet değişikliği bildirildi.`);
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
