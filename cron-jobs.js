// cron-jobs.js

const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci } = require('./utils/calendarUtils');
const { notifyAllOfDutyChange } = require('./telegram_bot_handler');

// Basit log fonksiyonları
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} | ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} | ${msg}`, err || ''),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} | ${msg}`)
};

// Özel gün ve hafta sonu kontrolü
function anlikOzelGunKredisiAl(tarih, tumKurallar) {
  // tarih: Date nesnesi
  // tumKurallar: kredi_kurallari tablosundan gelen tüm satırlar
  const ozelGunler = tumKurallar.filter(k => k.kural_adi !== 'Hafta Sonu' && k.tarih);
  for (const gun of ozelGunler) {
    const kuralTarih = new Date(gun.tarih);
    if (
      kuralTarih.getFullYear() === tarih.getFullYear() &&
      kuralTarih.getMonth() === tarih.getMonth() &&
      kuralTarih.getDate() === tarih.getDate()
    ) {
      return gun.kredi;
    }
  }
  return null;
}

// Hafta sonu kontrolü
function anlikHaftaSonuKredisi(tarih, tumKurallar) {
  const haftaSonuKurali = tumKurallar.find(k => k.kural_adi === 'Hafta Sonu');
  if (!haftaSonuKurali || typeof haftaSonuKurali.kredi === 'undefined') return 0;
  const gun = tarih.getDay();
  return (gun === 0 || gun === 6) ? haftaSonuKurali.kredi : 0;
}

// Saat aralığı kontrolü
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

// DAKİKALIK KREDİ GÜNCELLEME (her dakika çalışır)
cron.schedule('* * * * *', async () => {
  const now = new Date();
  try {
    const aktifNobetci = await db.getAktifNobetci();
    if (!aktifNobetci) return;

    const tumKrediKurallari = await db.getAllKrediKurallari();
    const shiftTimeRanges = await db.getShiftTimeRanges();

    let eklenecekKredi = 0;
    let krediSebebi = "normal mesai";

    // Öncelik: özel gün > hafta sonu > vardiya
    const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
    if (ozelKredi !== null) {
      eklenecekKredi = ozelKredi;
      krediSebebi = "özel gün";
    } else if (anlikHaftaSonuKredisi(now, tumKrediKurallari) !== 0) {
      eklenecekKredi = anlikHaftaSonuKredisi(now, tumKrediKurallari);
      krediSebebi = "hafta sonu";
    } else if (shiftTimeRanges && shiftTimeRanges.length > 0) {
      const currentShiftRule = shiftTimeRanges.find(shift => isTimeInInterval(now, shift.baslangic_saat, shift.bitis_saat));
      if (currentShiftRule) {
        eklenecekKredi = currentShiftRule.kredi_dakika;
        krediSebebi = `vardiya (${currentShiftRule.baslangic_saat}-${currentShiftRule.bitis_saat})`;
      } else {
        eklenecekKredi = 1;
      }
    } else {
      eklenecekKredi = 1;
    }

    const yeniKredi = (aktifNobetci.kredi || 0) + eklenecekKredi;
    await db.updateNobetciKredi(aktifNobetci.id, yeniKredi);
    logger.info(`[KREDİ] ${aktifNobetci.name} kredisi: ${yeniKredi} (+${eklenecekKredi} ${krediSebebi})`);

  } catch (error) {
    logger.error("[Kredi Cron] Hata:", error);
  }
}, { timezone: "Europe/Istanbul" });

// GÜNLÜK VARDİYA DEĞİŞİMİ (veritabanı ve tatil kontrolü ile)
async function setupDailyShiftCronJobs() {
  try {
    const shiftTimeRanges = await db.getShiftTimeRanges();
    if (!shiftTimeRanges || shiftTimeRanges.length < 2) {
      logger.warn("Vardiya saatleri veritabanında bulunamadı. Günlük vardiya sistemi kurulamadı.");
      return;
    }

    // Gündüz vardiyası (gelecek haftanın nöbetçisi)
    const morningShift = shiftTimeRanges[0];
    const [mHour, mMinute] = morningShift.baslangic_saat.split(':').map(Number);
    const morningCronTime = `${mMinute} ${mHour} * * *`;

    cron.schedule(morningCronTime, async () => {
      logger.info(`[Gündüz Vardiya] Değişim kontrolü (${morningShift.baslangic_saat})`);
      try {
        const now = new Date();
        const tumKurallar = await db.getAllKrediKurallari();

        // Tatil veya özel gün kontrolü: değişim yapılmaz!
        if ((now.getDay() === 0 || now.getDay() === 6) || anlikOzelGunKredisiAl(now, tumKurallar) !== null) {
          logger.info(`[Gündüz Vardiya] Tatil/özel gün, değişim atlandı.`);
          return;
        }

        // Gelecek haftanın nöbetçisi
        const gelecekHaftaTarihi = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
        const gelecekHaftaninNobetci = await getAsilHaftalikNobetci(gelecekHaftaTarihi);

        if (gelecekHaftaninNobetci && gelecekHaftaninNobetci.id) {
          await db.setAktifNobetci(gelecekHaftaninNobetci.id);
          logger.info(`[Gündüz Vardiya] Gelecek haftanın nöbetçisi "${gelecekHaftaninNobetci.name}" aktif edildi.`);
          await notifyAllOfDutyChange(gelecekHaftaninNobetci.name, 'Gündüz Vardiya');
        }
      } catch (error) {
        logger.error(`[Gündüz Vardiya] Değişim hatası:`, error);
      }
    }, { timezone: "Europe/Istanbul" });

    // Akşam vardiyası (mevcut haftanın nöbetçisi)
    const eveningShift = shiftTimeRanges[1];
    const [eHour, eMinute] = eveningShift.baslangic_saat.split(':').map(Number);
    const eveningCronTime = `${eMinute} ${eHour} * * *`;

    cron.schedule(eveningCronTime, async () => {
      logger.info(`[Akşam Vardiya] Değişim kontrolü (${eveningShift.baslangic_saat})`);
      try {
        const now = new Date();
        const tumKurallar = await db.getAllKrediKurallari();

        // Tatil veya özel gün kontrolü: değişim yapılmaz!
        if ((now.getDay() === 0 || now.getDay() === 6) || anlikOzelGunKredisiAl(now, tumKurallar) !== null) {
          logger.info(`[Akşam Vardiya] Tatil/özel gün, değişim atlandı.`);
          return;
        }

        // Mevcut haftanın nöbetçisi
        const mevcutHaftaninNobetci = await getAsilHaftalikNobetci(now);

        if (mevcutHaftaninNobetci && mevcutHaftaninNobetci.id) {
          await db.setAktifNobetci(mevcutHaftaninNobetci.id);
          logger.info(`[Akşam Vardiya] Mevcut haftanın nöbetçisi "${mevcutHaftaninNobetci.name}" aktif edildi.`);
          await notifyAllOfDutyChange(mevcutHaftaninNobetci.name, 'Akşam Vardiya');
        }
      } catch (error) {
        logger.error(`[Akşam Vardiya] Değişim hatası:`, error);
      }
    }, { timezone: "Europe/Istanbul" });

    logger.info(`Günlük vardiya sistemi kuruldu: Gündüz ${morningCronTime}, Akşam ${eveningCronTime}`);

  } catch (error) {
    logger.error("Günlük vardiya sistemi kurulurken hata:", error);
  }
}

// Başlangıçta günlük vardiya sistemini başlat
setupDailyShiftCronJobs();
logger.info('Veritabanı bazlı günlük vardiya sistemi başlatıldı.');
