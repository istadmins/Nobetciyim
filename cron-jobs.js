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

function logCreditUpdate(message, ...optionalParams) {
    // Development modunda console'a yaz, production'da sadece dosyaya yaz
    if (process.env.NODE_ENV !== 'production') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[KREDİ ${timestamp}] ${message}`, ...optionalParams);
    }
}

console.log(`[CRON-JOBS INIT] CRON_DEBUG_LOGGING değeri: "${process.env.CRON_DEBUG_LOGGING}"`);

// --- KREDİ HESAPLAMA YARDIMCI FONKSİYONLARI ---
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

// --- DAKİKALIK KREDİ GÜNCELLEME ---
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
        let krediSebebi = "";

        const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
        if (ozelKredi !== null) {
            eklenecekKredi = ozelKredi;
            const ozelGun = tumKrediKurallari.find(k => k.kural_adi !== 'Hafta Sonu' && k.tarih &&
                k.tarih === now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
            krediSebebi = `özel gün (${ozelGun ? ozelGun.kural_adi : 'Bilinmeyen özel gün'})`;
        } else {
            const haftaSonuKredisiDegeri = anlikHaftaSonuKredisi(now, tumKrediKurallari);
            if (haftaSonuKredisiDegeri !== 0) {
                eklenecekKredi = haftaSonuKredisiDegeri;
                krediSebebi = "hafta sonu";
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
                if (currentShiftRule) {
                    eklenecekKredi = currentShiftRule.kredi_dakika;
                    krediSebebi = `vardiya saati (${currentShiftRule.baslangic_saat}-${currentShiftRule.bitis_saat})`;
                } else {
                    eklenecekKredi = 1;
                    krediSebebi = "normal mesai saati";
                }
            }
        }

        const eskiKredi = aktifNobetci.kredi || 0;
        const yeniKredi = eskiKredi + eklenecekKredi;
        await db.updateNobetciKredi(aktifNobetci.id, yeniKredi);

        logCreditUpdate(`${aktifNobetci.name}'in kredisi güncellendi: ${eklenecekKredi} kredi eklendi (${krediSebebi}). Eski kredi: ${eskiKredi}, Yeni kredi: ${yeniKredi}`);
        logDebug(`[Kredi Cron] ${aktifNobetci.name} kredisi güncellendi. Yeni Kredi: ${yeniKredi}`);
    } catch (error) {
        console.error("[Kredi Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });

// --- YENİ GÜNDÜZ NÖBETÇİ ATAMASI (Pazartesi 09:00) ---
// BU JOB, HAFTANIN NÖBETİNİ BAŞLATIR VE KESİN OLARAK ATAMA YAPAR.
cron.schedule('0 9 * * 1', async () => {
    console.log(`[Pzt 09:00 Cron] Haftalık nöbetçi ataması çalışıyor...`);
    
    try {
        const hedefNobetci = await getAsilHaftalikNobetci(new Date());
        
        if (hedefNobetci && hedefNobetci.id) {
            // Haftanın nöbetçisini her durumda ayarla. Bu, sistemin her zaman doğru durumda başlamasını sağlar.
            await db.setAktifNobetci(hedefNobetci.id);
            console.log(`[Pzt 09:00 Cron] Haftanın nöbetçisi kesin olarak ayarlandı: ${hedefNobetci.name}.`);
            
            const message = `Yeni Hafta Nöbet Ataması:\nAktif Nöbetçi: *${hedefNobetci.name}*`;
            
            const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN;
            if (envIsTelegramActive) {
                const usersToSend = await db.getAllNobetcilerWithTelegramId();
                for (const user of usersToSend) {
                    // Kendisine zaten atama yapıldığı için tekrar mesaj göndermeye gerek yok gibi düşünebiliriz,
                    // ama grubun bilmesi için herkese gönderilmesi daha doğru.
                    await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
                }
                console.log(`[Pzt 09:00 Cron] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
            }
        } else {
            console.warn("[Pzt 09:00 Cron] Bu hafta için asıl nöbetçi bulunamadı. Atama yapılamadı.");
        }
    } catch (error) {
        console.error("[Pzt 09:00 Cron] Hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });


// --- AKŞAM VARDİYA DEĞİŞİMİ ---
async function setupEveningShiftCronJob() {
    const shiftTimeRanges = await db.getShiftTimeRanges();
    
    // Akşam vardiyası tanımı: Genellikle ikinci vardiya olur.
    // Eğer sadece 1 vardiya varsa (00:00-23:59), akşam değişimi olmaz.
    if (shiftTimeRanges && shiftTimeRanges.length > 1) {
        const eveningShift = shiftTimeRanges[1]; // İkinci aralığı akşam vardiyası olarak kabul ediyoruz.
        const [hour, minute] = eveningShift.baslangic_saat.split(':').map(Number);
        const cronTime = `${minute} ${hour} * * *`;
        
        cron.schedule(cronTime, async () => {
            console.log(`[Akşam Vardiya] Cron tetiklendi (${eveningShift.baslangic_saat}).`);
            
            try {
                const now = new Date();
                
                // Tatil günlerinde vardiya değişimi yapılmaz, gündüz nöbetçisi devam eder.
                const tumKurallar = await db.getAllKrediKurallari();
                const isWeekend = (now.getDay() === 0 || now.getDay() === 6);
                const isSpecialHoliday = (anlikOzelGunKredisiAl(now, tumKurallar) !== null);
                
                if (isWeekend || isSpecialHoliday) {
                    console.log(`[Akşam Vardiya] Tatil günü, vardiya değişimi atlandı. Gündüz nöbetçisi devam ediyor.`);
                    return;
                }
                
                // Hafta içi akşamları, nöbeti o haftanın asıl nöbetçisine geri devreder.
                const hedefNobetci = await getAsilHaftalikNobetci(new Date());
                
                if (hedefNobetci && hedefNobetci.id) {
                    const currentActive = await db.getAktifNobetci();
                    
                    // Sadece mevcut aktif nöbetçi, asıl nöbetçi değilse değişiklik yap.
                    if (!currentActive || currentActive.id !== hedefNobetci.id) {
                        await db.setAktifNobetci(hedefNobetci.id);
                        
                        const message = `Akşam Vardiya Değişimi:\nNöbet, asıl nöbetçi olan *${hedefNobetci.name}* adlı kişiye devredildi.`;
                        console.log(`[Akşam Vardiya] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);
                        
                        const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN;
                        if (envIsTelegramActive) {
                            const usersToSend = await db.getAllNobetcilerWithTelegramId();
                            for (const user of usersToSend) {
                                await sendTelegramMessageToGroup(user.telegram_id, message).catch(e => console.error(e.message));
                            }
                            console.log(`[Akşam Vardiya] ${usersToSend.length} kullanıcıya bildirim gönderildi.`);
                        }
                    } else {
                        console.log(`[Akşam Vardiya] Asıl nöbetçi (${hedefNobetci.name}) zaten aktif. Değişiklik yapılmadı.`);
                    }
                }
            } catch (error) {
                console.error(`[Akşam Vardiya] Cron hatası:`, error.message, error.stack);
            }
        }, { timezone: "Europe/Istanbul" });
    } else {
        console.log("[Akşam Vardiya] Tek vardiya tanımlı, akşam vardiya değişimi cron job'ı kurulmadı.");
    }
}

// Akşam vardiya cron job'ını başlat
setupEveningShiftCronJob();

console.log('Tüm cron job tanımlamaları tamamlandı.');