// Nobetciyim/cron-jobs.js
const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci } = require('./utils/calendarUtils');
// DÜZELTME: Hatalı fonksiyon import'u kaldırıldı, doğrusu eklendi.
const { notifyAllOfDutyChange } = require('./telegram_bot_handler');

// Loglama için yardımcı fonksiyonlar
function logCreditUpdate(message, ...optionalParams) {
    // Bu loglama, üretim ortamı dışında kredi güncellemelerini gösterir.
    if (process.env.NODE_ENV !== 'production') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[KREDİ ${timestamp}] ${message}`, ...optionalParams);
    }
}

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} | ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} | ${msg}`, err || ''),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} | ${msg}`)
};


// Orijinal dosyanızdaki yardımcı kredi fonksiyonları
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

// DAKİKALIK KREDİ GÜNCELLEME (Orijinal haliyle geri eklendi)
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
        logger.error("[Kredi Cron] Hata:", error);
    }
}, { timezone: "Europe/Istanbul" });

// HAFTALIK NÖBETÇİ ATAMASI (Pazartesi 09:00) - DÜZELTİLMİŞ HALİ
cron.schedule('0 9 * * 1', async () => {
    logger.info('[Pzt 09:00 Cron] Haftalık nöbetçi atama görevi başlatıldı.');
    try {
        // DÜZELTME: Mevcut tarih yerine, bir sonraki haftanın tarihini hesapla.
        const nextWeekDate = new Date();
        nextWeekDate.setDate(nextWeekDate.getDate() + 7);
        
        logger.info(`[Pzt 09:00 Cron] Gelecek hafta için nöbetçi aranıyor (Hedef Tarih: ${nextWeekDate.toISOString()})`);
        
        const gelecekHaftaNobetci = await getAsilHaftalikNobetci(nextWeekDate);

        if (gelecekHaftaNobetci && gelecekHaftaNobetci.id) {
            await db.setAktifNobetci(gelecekHaftaNobetci.id);
            logger.info(`[Pzt 09:00 Cron] Haftanın nöbetçisi başarıyla "${gelecekHaftaNobetci.name}" olarak ayarlandı.`);
            
            // DÜZELTME: Doğru bildirim fonksiyonu çağrılıyor.
            await notifyAllOfDutyChange(gelecekHaftaNobetci.name, 'Haftalık Otomatik Değişim');

        } else {
            logger.warn("[Pzt 09:00 Cron] Gelecek hafta için asıl nöbetçi bulunamadı. Atama yapılamadı.");
        }
    } catch (error) {
        logger.error("[Pzt 09:00 Cron] Görev sırasında kritik bir hata oluştu:", error);
    }
}, { timezone: "Europe/Istanbul" });

// AKŞAM VARDİYA DEĞİŞİMİ (Düzeltilmiş bildirim ile)
async function setupEveningShiftCronJob() {
    try {
        const shiftTimeRanges = await db.getShiftTimeRanges();
        if (shiftTimeRanges && shiftTimeRanges.length > 1) {
            const eveningShift = shiftTimeRanges[1];
            const [hour, minute] = eveningShift.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            cron.schedule(cronTime, async () => {
                logger.info(`[Akşam Vardiya] Cron tetiklendi (${eveningShift.baslangic_saat}).`);
                try {
                    const now = new Date();
                    const tumKurallar = await db.getAllKrediKurallari();
                    if ((now.getDay() === 0 || now.getDay() === 6) || anlikOzelGunKredisiAl(now, tumKurallar) !== null) {
                        logger.info(`[Akşam Vardiya] Tatil günü, vardiya değişimi atlandı.`);
                        return;
                    }
                    const hedefNobetci = await getAsilHaftalikNobetci(new Date());
                    if (hedefNobetci && hedefNobetci.id) {
                        const currentActive = await db.getAktifNobetci();
                        if (!currentActive || currentActive.id !== hedefNobetci.id) {
                            await db.setAktifNobetci(hedefNobetci.id);
                            logger.info(`[Akşam Vardiya] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);
                            
                            // DÜZELTME: Doğru bildirim fonksiyonu çağrılıyor.
                            await notifyAllOfDutyChange(hedefNobetci.name, 'Akşam Vardiya Değişimi');
                        }
                    }
                } catch (error) {
                    logger.error(`[Akşam Vardiya] Cron hatası:`, error);
                }
            }, { timezone: "Europe/Istanbul" });
        }
    } catch (dbError) {
        logger.error("[setupEveningShiftCronJob] Veritabanından vardiya saatleri alınırken hata oluştu:", dbError);
    }
}

// Başlangıçta zamanlanmış görevleri kur
setupEveningShiftCronJob();
logger.info('Tüm cron job tanımlamaları tamamlandı.');
