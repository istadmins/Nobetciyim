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
        const welcomeMessage = `🏥 *Nöbetçi Sistemi*

Merhaba! Bu bot nöbetçi sistemini yönetmenize yardımcı olur.

*Kullanılabilir komutlar:*
• /menu - Ana menü
• /aktif_nobetci - Aktif nöbetçiyi görüntüle
• /nobet_al - Nöbet al
• /nobet_kredi_durum - Kredi durumunu görüntüle
• /gelecek_hafta_nobetci - Gelecek haftanın nöbetçisi
• /sifre_sifirla - Şifre sıfırlama

Başlamak için /menu yazabilirsiniz.`;
        
        botInstance.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    // MENU komutu
    botInstance.onText(/^\/menu$/, async (msg) => {
        const chatId = msg.chat.id;
        
        try {
            const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
            
            if (!nobetci) {
                return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok. Lütfen önce sisteme kayıt olunuz.");
            }
            
            // Güncel bilgileri al
            const guncelNobetci = await db.getNobetciById(nobetci.id);
            const aktifNobetci = await db.getAktifNobetci();
            
            // Bu haftanın nöbetçisini await ile al
            const buHaftaNobetci = await getAsilHaftalikNobetci(new Date());
            
            const menuMessage = `🏥 *Nöbetçi Sistemi - Ana Menü*

Merhaba *${guncelNobetci.name}*,

👨‍⚕️ *Aktif Nöbetçi:* ${aktifNobetci ? aktifNobetci.name : 'Yok'}
📅 *Bu Haftanın Asıl Nöbetçisi:* ${buHaftaNobetci ? buHaftaNobetci.name : 'Belirlenemedi'}

💰 *Kredi Durumunuz:*
• *Mevcut Kredi:* ${guncelNobetci.kredi || 0}
• *Ödenen Kredi:* ${guncelNobetci.pay_edilen_kredi || 0}

📋 *Kullanılabilir Komutlar:*
• /aktif_nobetci - Aktif nöbetçi bilgisi
• /nobet_al - Nöbet devralma talebi
• /nobet_kredi_durum - Detaylı kredi durumu
• /gelecek_hafta_nobetci - Gelecek hafta bilgisi
• /sifre_sifirla - Şifre sıfırlama`;
            
            botInstance.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/menu hatası:", error);
            botInstance.sendMessage(chatId, "❌ Menü bilgileri alınırken hata oluştu. Lütfen tekrar deneyin.");
        }
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
            // Güncel kredi bilgisini ve diğer detayları al
            const guncelNobetci = await db.getNobetciById(nobetci.id);
            if (!guncelNobetci) {
                return botInstance.sendMessage(chatId, "❌ Nöbetçi bilgisi bulunamadı.");
            }

            // Kredi kurallarını al
            const krediKurallari = await db.getAllKrediKurallari();
            const nobetKredileri = await db.getShiftTimeRanges();

            // Tüm nöbetçilerin kredi durumunu al
            const tumNobetciler = await new Promise((resolve, reject) => {
                db.all("SELECT name, kredi, pay_edilen_kredi FROM Nobetciler ORDER BY kredi DESC", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            let krediDurumuMessage = `💳 *Detaylı Kredi Durumu*

👤 *Nöbetçi:* ${guncelNobetci.name}
💰 *Mevcut Kredi:* ${guncelNobetci.kredi || 0}
📊 *Ödenen Kredi:* ${guncelNobetci.pay_edilen_kredi || 0}
📞 *Telefon:* ${guncelNobetci.telefon_no || 'Kayıtlı değil'}

📋 *Kredi Kuralları:*
`;

            // Kredi kurallarını listele
            if (krediKurallari.length > 0) {
                krediKurallari.forEach(kural => {
                    krediDurumuMessage += `• ${kural.kural_adi}: ${kural.kredi} kredi\n`;
                });
            } else {
                krediDurumuMessage += `• Henüz kural tanımlanmamış\n`;
            }

            krediDurumuMessage += `\n⏰ *Nöbet Saatleri ve Kredileri:*\n`;

            // Nöbet kredilerini listele
            if (nobetKredileri.length > 0) {
                nobetKredileri.forEach(zaman => {
                    krediDurumuMessage += `• ${zaman.baslangic_saat} - ${zaman.bitis_saat}: ${zaman.kredi_dakika} kredi/dk\n`;
                });
            } else {
                krediDurumuMessage += `• Henüz zaman dilimi tanımlanmamış\n`;
            }

            krediDurumuMessage += `\n📊 *Genel Kredi Sıralaması:*\n`;

            // Güncel kullanıcının kredi durumunu bul
            const benimKredim = guncelNobetci.kredi || 0;
            const gunlukKredi = 2396; // Bir günlük kredi miktarı

            // İlk 5 nöbetçiyi göster ve durumu hesapla
            tumNobetciler.slice(0, 5).forEach((n, index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔸';
                krediDurumuMessage += `${emoji} ${n.name}: ${n.kredi || 0}`;

                if (n.name === guncelNobetci.name) {
                    krediDurumuMessage += ` ← *SİZ*`;
                }
                krediDurumuMessage += '\n';
            });

            // Kullanıcının diğer nöbetçilerle karşılaştırmasını ekle
            krediDurumuMessage += `\n📈 *Durumunuz:*\n`;

            // Kendinden önde ve geride olanları bul
            const ondekilet = tumNobetciler.filter(n => (n.kredi || 0) > benimKredim);
            const geridekilet = tumNobetciler.filter(n => (n.kredi || 0) < benimKredim);

            if (ondekilet.length > 0) {
                const enOnde = ondekilet[ondekilet.length - 1]; // En yakın önde olan
                const fark = (enOnde.kredi || 0) - benimKredim;
                const gunFarki = (fark / gunlukKredi).toFixed(1);
                krediDurumuMessage += `🔺 ${enOnde.name}'den ${gunFarki} gün geride\n`;
            }

            if (geridekilet.length > 0) {
                const enGerde = geridekilet[0]; // En yakın geride olan
                const fark = benimKredim - (enGerde.kredi || 0);
                const gunFarki = (fark / gunlukKredi).toFixed(1);
                krediDurumuMessage += `🔻 ${enGerde.name}'den ${gunFarki} gün önde\n`;
            }

            if (ondekilet.length === 0 && geridekilet.length === 0) {
                krediDurumuMessage += `🎯 Herkes aynı seviyede\n`;
            }

            krediDurumuMessage += `\nℹ️ *Açıklama:*\n• Pozitif kredi = Fazla nöbet tutmuşsunuz\n• Negatif kredi = Nöbet borcunuz var\n• Kredi hesabı dakika bazlıdır\n• 1 gün = ${gunlukKredi} kredi`;

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
            // Rastgele şifre oluştur
            const newRandomPassword = Math.random().toString(36).slice(-8);

            // Veritabanında şifreyi güncelle (hash'lemek gerekiyorsa burada yapın)
            await new Promise((resolve, reject) => {
                db.run("UPDATE Nobetciler SET password = ? WHERE id = ?", [newRandomPassword, nobetci.id], function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error("Nöbetçi bulunamadı"));
                    else resolve();
                });
            });

            const message = `🔐 *Şifre Sıfırlandı*

✅ Web paneli şifreniz başarıyla sıfırlandı.
🆕 *Yeni şifreniz:* \`${newRandomPassword}\`

🌐 Web paneline giriş için sistem yöneticinizden adres alın
👤 *Kullanıcı adınız:* ${nobetci.name}

⚠️ *Güvenlik:* Bu şifreyi not alın ve güvenli bir yerde saklayın. İlk girişte değiştirmeniz önerilir.`;

            botInstance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/sifre_sifirla hatası:", error);
            botInstance.sendMessage(chatId, "❌ Şifre sıfırlama sırasında hata oluştu. Lütfen sistem yöneticisiyle iletişime geçin.");
        }
    });

    // NÖBET AL komutu
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
                    botInstance.editMessageText(`Bu istek zaman aşımına uğradı.`, {
                        chat_id: sentMessage.chat.id,
                        message_id: sentMessage.message_id,
                        reply_markup: null
                    });
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

    // GELECEK HAFTA NÖBETÇİ komutu
    botInstance.onText(/^\/gelecek_hafta_nobetci$/, async (msg) => {
        const chatId = msg.chat.id;
        const nobetciYetkili = await getAuthorizedNobetciByTelegramId(chatId);
        
        if (!nobetciYetkili) {
            return botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz bulunmamaktadır.");
        }
        
        try {
            const today = new Date();
            const nextWeekDate = new Date(today.getTime());
            nextWeekDate.setDate(today.getDate() + 7);

            const gelecekHaftaNobetci = await getAsilHaftalikNobetci(nextWeekDate);
            const buHaftaNobetci = await getAsilHaftalikNobetci(today);

            // Bu haftanın bilgilerini al
            const buHaftaYil = today.getFullYear();
            const buHaftaNo = getWeekOfYear(today);
            const buHaftaAciklama = await db.getDutyOverride(buHaftaYil, buHaftaNo);

            // Gelecek haftanın bilgilerini al
            const gelecekHaftaYil = nextWeekDate.getFullYear();
            const gelecekHaftaNo = getWeekOfYear(nextWeekDate);
            const gelecekHaftaAciklama = await db.getDutyOverride(gelecekHaftaYil, gelecekHaftaNo);

            let message = `📅 *Haftalık Nöbetçi Bilgileri*

            if (buHaftaAciklama && buHaftaAciklama.nobetci_id_override) {
                message += `\n🔄 *Override:* ${buHaftaAciklama.nobetci_adi_override || 'Bilinmiyor'}`;
            }

            message += `\n\n📍 *Gelecek Hafta (${gelecekHaftaNo}. hafta):*
👨‍⚕️ *Nöbetçi:* ${gelecekHaftaNobetci ? gelecekHaftaNobetci.name : 'Belirlenemedi'}`;

            if (gelecekHaftaAciklama && gelecekHaftaAciklama.nobetci_id_override) {
                message += `\n🔄 *Override:* ${gelecekHaftaAciklama.nobetci_adi_override || 'Bilinmiyor'}`;
            }

            // Açıklamaları ekle
            if (buHaftaAciklama && buHaftaAciklama.aciklama) {
                message += `\n\n📝 *Bu Hafta Açıklaması:*\n${buHaftaAciklama.aciklama}`;
            }

            if (gelecekHaftaAciklama && gelecekHaftaAciklama.aciklama) {
                message += `\n\n📝 *Gelecek Hafta Açıklaması:*\n${gelecekHaftaAciklama.aciklama}`;
            }

            botInstance.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("/gelecek_hafta_nobetci hatası:", error);
            botInstance.sendMessage(chatId, "❌ Bilgi alınırken bir hata oluştu.");
        }
    });

    // Callback query handler
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

        await botInstance.editMessageReplyMarkup({inline_keyboard: []}, {
            chat_id: callbackQuery.message.chat.id,
            message_id: request.messageId
        });

        if (action === 'approve') {
            try {
                await db.setAktifNobetci(request.requester.id);
                botInstance.sendMessage(request.requester.telegram_id, `✅ Nöbet devir isteğiniz *${request.approver.name}* tarafından onaylandı.`, { parse_mode: 'Markdown' });
                botInstance.editMessageText(`✅ İstek onaylandı. Nöbet *${request.requester.name}*'a devredildi.`, {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: request.messageId,
                    parse_mode: 'Markdown'
                });
                notifyAllOfDutyChange(request.requester.name, "Onaylı Devir");
            } catch (error) {
                botInstance.sendMessage(request.requester.telegram_id, `❌ Nöbet aktarılırken API hatası oluştu.`);
                botInstance.editMessageText(`❌ API hatası! Nöbet devredilemedi.`, {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: request.messageId
                });
            }
        } else { // reject
            botInstance.sendMessage(request.requester.telegram_id, `❌ Nöbet devir isteğiniz *${request.approver.name}* tarafından reddedildi.`, { parse_mode: 'Markdown' });
            botInstance.editMessageText(`❌ İstek reddedildi.`, {
                chat_id: callbackQuery.message.chat.id,
                message_id: request.messageId
            });
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
