// Nobetciyim/cron-jobs.js
const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci } = require('./utils/calendarUtils');
const { sendTelegramMessageToGroup } = require('./telegram_bot_handler');

function logDebug(message, ...optionalParams) {
    if (process.env.CRON_DEBUG_LOGGING === 'true') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[DEBUG ${timestamp}] ${message}`, ...optionalParams);
    }
}

function logCreditUpdate(message, ...optionalParams) {
    if (process.env.NODE_ENV !== 'production') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[KREDİ ${timestamp}] ${message}`, ...optionalParams);
    }
}

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

// Dakikalık kredi güncelleme
cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
        const aktifNobetci = await db.getAktifNobetci();
        if (!aktifNobetci) return;
        const tumKrediKurallari = await db.getAllKrediKurallari();
        const shiftTimeRanges = await db.getShiftTimeRanges();
        let eklenecekKredi = 0;
        let krediSebebi = "normal mesai";
        const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
        if (ozelKredi !== null) {
            eklenecekKredi = ozelKredi;
            const ozelGun = tumKrediKurallari.find(k => k.kural_adi !== 'Hafta Sonu' && k.tarih && k.tarih.endsWith(String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')));
            krediSebebi = `özel gün (${ozelGun ? ozelGun.kural_adi : ''})`;
        } else if (anlikHaftaSonuKredisi(now, tumKrediKurallari) !== 0) {
            eklenecekKredi = anlikHaftaSonuKredisi(now, tumKrediKurallari);
            krediSebebi = "hafta sonu";
        } else {
            const currentShiftRule = shiftTimeRanges.find(shift => isTimeInInterval(now, shift.baslangic_saat, shift.bitis_saat));
            if (currentShiftRule) {
                eklenecekKredi = currentShiftRule.kredi_dakika;
                krediSebebi = `vardiya (${currentShiftRule.baslangic_saat}-${currentShiftRule.bitis_saat})`;
            } else {
                eklenecekKredi = 1;
            }
        }
        const yeniKredi = (aktifNobetci.kredi || 0) + eklenecekKredi;
        await db.updateNobetciKredi(aktifNobetci.id, yeniKredi);
        logCreditUpdate(`${aktifNobetci.name} kredisi: ${yeniKredi} (+${eklenecekKredi} ${krediSebebi})`);
    } catch (error) {
        console.error("[Kredi Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });

// Haftalık nöbetçi ataması (Pazartesi 09:00)
cron.schedule('0 9 * * 1', async () => {
    console.log(`[Pzt 09:00 Cron] Haftalık nöbetçi ataması çalışıyor...`);
    try {
        const hedefNobetci = await getAsilHaftalikNobetci(new Date());
        if (hedefNobetci && hedefNobetci.id) {
            await db.setAktifNobetci(hedefNobetci.id);
            console.log(`[Pzt 09:00 Cron] Haftanın nöbetçisi kesin olarak ayarlandı: ${hedefNobetci.name}.`);
            const message = `Yeni Hafta Nöbet Ataması:\nAktif Nöbetçi: *${hedefNobetci.name}*`;
            const usersToSend = await db.getAllNobetcilerWithTelegramId();
            for (const user of usersToSend) {
                await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
            }
        } else {
            console.warn("[Pzt 09:00 Cron] Bu hafta için asıl nöbetçi bulunamadı.");
        }
    } catch (error) {
        console.error("[Pzt 09:00 Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });

// Akşam vardiya değişimi
async function setupEveningShiftCronJob() {
    const shiftTimeRanges = await db.getShiftTimeRanges();
    if (shiftTimeRanges && shiftTimeRanges.length > 1) {
        const eveningShift = shiftTimeRanges[1];
        const [hour, minute] = eveningShift.baslangic_saat.split(':').map(Number);
        const cronTime = `${minute} ${hour} * * *`;
        
        cron.schedule(cronTime, async () => {
            console.log(`[Akşam Vardiya] Cron tetiklendi (${eveningShift.baslangic_saat}).`);
            try {
                const now = new Date();
                const tumKurallar = await db.getAllKrediKurallari();
                if ((now.getDay() === 0 || now.getDay() === 6) || anlikOzelGunKredisiAl(now, tumKurallar) !== null) {
                    console.log(`[Akşam Vardiya] Tatil günü, vardiya değişimi atlandı.`);
                    return;
                }
                const hedefNobetci = await getAsilHaftalikNobetci(new Date());
                if (hedefNobetci && hedefNobetci.id) {
                    const currentActive = await db.getAktifNobetci();
                    if (!currentActive || currentActive.id !== hedefNobetci.id) {
                        await db.setAktifNobetci(hedefNobetci.id);
                        const message = `Akşam Vardiya Değişimi:\nNöbet, asıl nöbetçi *${hedefNobetci.name}*'a devredildi.`;
                        console.log(`[Akşam Vardiya] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);
                        const usersToSend = await db.getAllNobetcilerWithTelegramId();
                        for (const user of usersToSend) {
                            await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
                        }
                    }
                }
            } catch (error) {
                console.error(`[Akşam Vardiya] Cron hatası:`, error.message, error.stack);
            }
        }, { timezone: "Europe/Istanbul" });
    }
}

setupEveningShiftCronJob();
console.log('Tüm cron job tanımlamaları tamamlandı.');