// Nobetciyim/cron-jobs.js
const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci, getWeekOfYear } = require('./utils/calendarUtils');
const { sendTelegramMessageToGroup } = require('./telegram_bot_handler');

function logDebug(message, ...optionalParams) {
    if (process.env.CRON_DEBUG_LOGGING === 'true') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[DEBUG ${timestamp}] ${message}`, ...optionalParams);
    }
}
// ... Dosyanızdaki diğer yardımcı fonksiyonlar (anlikHaftaSonuKredisi, vs.) burada yer almalıdır ...


let activeShiftChangeJobs = [];

async function setupShiftChangeCronJobs() {
    activeShiftChangeJobs.forEach(job => job.stop());
    activeShiftChangeJobs = [];

    const shiftTimeRanges = await db.getShiftTimeRanges();
    const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN;

    if (shiftTimeRanges && shiftTimeRanges.length === 2) {
        const scheduleShiftChangeJob = async (shiftDetails, isFirstShift) => {
            const [hour, minute] = shiftDetails.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            const job = cron.schedule(cronTime, async () => {
                // ... (job'un içindeki hedef nöbetçi belirleme mantığı aynı kalacak) ...
                
                // Nöbetçi belirlendikten sonra
                if (targetNobetci && targetNobetci.id) {
                    const currentActive = await db.getAktifNobetci();
                    if (!currentActive || currentActive.id !== targetNobetci.id) {
                        await db.setAktifNobetci(targetNobetci.id);
                        const message = `Otomatik Vardiya Değişimi\nYeni Aktif Nöbetçi: *${targetNobetci.name}*`;
                        console.log(`[Vardiya Değişimi] Nöbetçi ayarlandı: ${targetNobetci.name}.`);

                        // BİLDİRİM BÖLÜMÜ GÜNCELLENDİ
                        if (envIsTelegramActive) {
                            try {
                                const usersToSend = await db.getAllNobetcilerWithTelegramId();
                                if (usersToSend && usersToSend.length > 0) {
                                    const sendPromises = usersToSend.map(user => 
                                        sendTelegramMessageToGroup(user.telegram_id, message)
                                            .catch(err => console.error(`[HATA] ${user.name} kullanıcısına mesaj gönderilemedi:`, err.message))
                                    );
                                    await Promise.all(sendPromises);
                                    console.log(`[Vardiya Değişimi] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
                                }
                            } catch (dbError) {
                                console.error("[Vardiya Değişimi] Kullanıcıları DB'den alırken hata:", dbError);
                            }
                        }
                    }
                }
            }, { timezone: "Europe/Istanbul" });
            activeShiftChangeJobs.push(job);
        };
        // ... (scheduleShiftChangeJob çağrıları)
    }
}


// Pazartesi 07:00 Cron Job'u
cron.schedule('0 7 * * 1', async () => {
    // ... (hedef nöbetçi belirleme mantığı aynı kalacak) ...
    
    if (hedefNobetci && hedefNobetci.id) {
        const aktifSuAn = await db.getAktifNobetci();
        if (!aktifSuAn || aktifSuAn.id !== hedefNobetci.id) {
            await db.setAktifNobetci(hedefNobetci.id);
            const message = `Haftalık Atama Değişimi:\nAktif Nöbetçi: *${hedefNobetci.name}*`;
            console.log(`[Pzt 07:00 Cron] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);

            // BİLDİRİM BÖLÜMÜ GÜNCELLENDİ
            const envIsTelegramActivePzt = !!process.env.TELEGRAM_BOT_TOKEN;
            if (envIsTelegramActivePzt) {
                try {
                    const usersToSend = await db.getAllNobetcilerWithTelegramId();
                    if (usersToSend && usersToSend.length > 0) {
                        const sendPromises = usersToSend.map(user => 
                            sendTelegramMessageToGroup(user.telegram_id, message)
                                .catch(err => console.error(`[Pzt 07:00 Cron HATA] ${user.name} kullanıcısına mesaj gönderilemedi:`, err.message))
                        );
                        await Promise.all(sendPromises);
                        console.log(`[Pzt 07:00 Cron] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
                    }
                } catch (dbError) {
                    console.error("[Pzt 07:00 Cron] Kullanıcıları DB'den alırken hata:", dbError);
                }
            }
        }
    }
}, { timezone: "Europe/Istanbul" });
