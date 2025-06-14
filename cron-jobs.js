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

console.log(`[CRON-JOBS INIT] CRON_DEBUG_LOGGING değeri: "${process.env.CRON_DEBUG_LOGGING}"`);

// --- KREDİ HESAPLAMA YARDIMCI FONKSİYONLARI (ORİJİNAL HALİNE GETİRİLDİ) ---
function anlikHaftaSonuKredisi(tarih, tumKurallar) {
    const haftaSonuKurali = tumKurallar.find(k => k.kural_adi === 'Hafta Sonu');
    if (!haftaSonuKurali || typeof haftaSonuKurali.kredi === 'undefined') return 0;
    const gun = tarih.getDay();
    return (gun === 0 || gun === 6) ? haftaSonuKurali.kredi : 0;
}

function anlikOzelGunKredisiAl(tarih, tumKurallar) {
    const ozelGunler = tumKurallar.filter(k => k.kural_adi !== 'Hafta Sonu' && k.tarih);
    for (const gun of ozelGunler) {
        const kuralTarihParts = gun.tarih.split('-');
        const kuralYil = parseInt(kuralTarihParts[0]);
        const kuralAy = parseInt(kuralTarihParts[1]) - 1;
        const kuralGun = parseInt(kuralTarihParts[2]);
        if (kuralYil === tarih.getFullYear() && kuralAy === tarih.getMonth() && kuralGun === tarih.getDate()) {
            return gun.kredi;
        }
    }
    return null;
}

function isTimeInInterval(dateObj, startTimeStr, endTimeStr) {
    const currentTimeInMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const startTimeTotalMinutes = startHour * 60 + startMinute;
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    let endTimeTotalMinutes = endHour * 60 + endMinute;

    if (endTimeStr === "00:00" && startTimeStr !== "00:00") endTimeTotalMinutes = 24 * 60;
    else if (endTimeStr === "00:00" && startTimeStr === "00:00") return true;

    if (endTimeTotalMinutes <= startTimeTotalMinutes) {
        return currentTimeInMinutes >= startTimeTotalMinutes || currentTimeInMinutes < endTimeTotalMinutes;
    } else {
        return currentTimeInMinutes >= startTimeTotalMinutes && currentTimeInMinutes < endTimeTotalMinutes;
    }
}

// --- DAKİKALIK KREDİ GÜNCELLEME (ORİJİNAL HALİNE GETİRİLDİ) ---
cron.schedule('* * * * *', async () => {
    const now = new Date();
    logDebug(`[Kredi Cron] Tetiklendi.`);
    try {
        const aktifNobetci = await db.getAktifNobetci();
        if (!aktifNobetci) {
            logDebug("[Kredi Cron] Aktif nöbetçi yok.");
            return;
        }

        const tumKrediKurallari = await db.getAllKrediKurallari();
        const shiftTimeRanges = await db.getShiftTimeRanges();

        let eklenecekKredi = 0;
        const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
        if (ozelKredi !== null) {
            eklenecekKredi = ozelKredi;
        } else {
            const haftaSonuKredisiDegeri = anlikHaftaSonuKredisi(now, tumKrediKurallari);
            if (haftaSonuKredisiDegeri !== 0) {
                eklenecekKredi = haftaSonuKredisiDegeri;
            } else {
                let currentShiftRule = null;
                if (shiftTimeRanges && shiftTimeRanges.length > 0) {
                    for (const shift of shiftTimeRanges) {
                        if (isTimeInInterval(now, shift.baslangic_saat, shift.bitis_saat)) {
                            currentShiftRule = shift;
                            break;
                        }
                    }
                }
                eklenecekKredi = currentShiftRule ? currentShiftRule.kredi_dakika : 1;
            }
        }
        
        const yeniKredi = (aktifNobetci.kredi || 0) + eklenecekKredi;
        await db.updateNobetciKredi(aktifNobetci.id, yeniKredi);
        logDebug(`[Kredi Cron] ${aktifNobetci.name} kredisi güncellendi. Yeni Kredi: ${yeniKredi}`);
        
    } catch (error) {
        console.error("[Kredi Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });


// --- BİLDİRİM GÖNDERME MANTIĞI GÜNCELLENMİŞ VARDİYA DEĞİŞİMİ ---
let activeShiftChangeJobs = [];
async function setupShiftChangeCronJobs() {
    activeShiftChangeJobs.forEach(job => job.stop());
    activeShiftChangeJobs = [];
    logDebug("[Cron Setup] Vardiya değişim job'ları ayarlanıyor.");

    const shiftTimeRanges = await db.getShiftTimeRanges();
    const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN; 

    if (shiftTimeRanges && shiftTimeRanges.length === 2) {
        const scheduleShiftChangeJob = async (shiftDetails, isFirstShift) => {
            const [hour, minute] = shiftDetails.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            const job = cron.schedule(cronTime, async () => {
                const now = new Date();
                const vardiyaLogAdi = isFirstShift ? "Gündüz" : "Gece";
                console.log(`[Vardiya Değişimi] ${vardiyaLogAdi} cron tetiklendi.`);
                
                try {
                    // Tatil günlerinde vardiya değişimi atlama mantığı
                    const tumKurallar = await db.getAllKrediKurallari();
                    const isWeekend = (now.getDay() === 0 || now.getDay() === 6);
                    const isSpecialHoliday = (anlikOzelGunKredisiAl(now, tumKurallar) !== null);
                    if (isWeekend || isSpecialHoliday) {
                        console.log(`[Vardiya Değişimi] ${vardiyaLogAdi}: Tatil günü, vardiya değişimi atlandı.`);
                        return;
                    }

                    // Hedef nöbetçi belirleme mantığı...
                    let targetNobetci = null; // Bu kısım sizin mantığınıza göre doldurulmalı
                    // ... (sizin getAsilHaftalikNobetci ve override mantığınız)

                    if (targetNobetci && targetNobetci.id) {
                        const currentActive = await db.getAktifNobetci();
                        if (!currentActive || currentActive.id !== targetNobetci.id) {
                            await db.setAktifNobetci(targetNobetci.id);
                            const message = `Otomatik Vardiya Değişimi (${vardiyaLogAdi})\nYeni Aktif Nöbetçi: *${targetNobetci.name}*`;
                            console.log(`[Vardiya Değişimi] Nöbetçi ayarlandı: ${targetNobetci.name}.`);
                            
                            if (envIsTelegramActive) {
                                const usersToSend = await db.getAllNobetcilerWithTelegramId();
                                for (const user of usersToSend) {
                                    await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
                                }
                                console.log(`[Vardiya Değişimi] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[Vardiya Değişimi] ${vardiyaLogAdi} cron hatası:`, error.message, error.stack);
                }
            }, { timezone: "Europe/Istanbul" });
            activeShiftChangeJobs.push(job);
        };
        await scheduleShiftChangeJob(shiftTimeRanges[0], true);
        await scheduleShiftChangeJob(shiftTimeRanges[1], false);
    }
}
cron.schedule('3 * * * *', setupShiftChangeCronJobs, { timezone: "Europe/Istanbul" });
setupShiftChangeCronJobs();


// --- BİLDİRİM GÖNDERME MANTIĞI GÜNCELLENMİŞ HAFTALIK ATAMA ---
cron.schedule('0 7 * * 1', async () => {
    console.log(`[Pzt 07:00 Cron] Haftalık nöbetçi belirleme çalışıyor...`);
    try {
        // ... (sizin haftalık hedef nöbetçi belirleme mantığınız)
        let hedefNobetci = await getAsilHaftalikNobetci(new Date()); // Örnek
        let atamaTuru = "Haftalık Atama";

        if (hedefNobetci && hedefNobetci.id) {
            const aktifSuAn = await db.getAktifNobetci();
            if (!aktifSuAn || aktifSuAn.id !== hedefNobetci.id) {
                await db.setAktifNobetci(hedefNobetci.id);
                const message = `${atamaTuru} Değişimi:\nAktif Nöbetçi: *${hedefNobetci.name}*`;
                console.log(`[Pzt 07:00 Cron] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);

                const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN;
                if (envIsTelegramActive) {
                    const usersToSend = await db.getAllNobetcilerWithTelegramId();
                    for (const user of usersToSend) {
                        await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
                    }
                    console.log(`[Pzt 07:00 Cron] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
                }
            }
        }
    } catch (error) {
        console.error("[Pzt 07:00 Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });

console.log('Tüm cron job tanımlamaları tamamlandı.');
