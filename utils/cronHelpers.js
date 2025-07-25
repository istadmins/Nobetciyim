// Nobetciyim/utils/cronHelpers.js
const logger = require('./logger');

/**
 * Loglama için yardımcı fonksiyonlar
 */
function logCreditUpdate(message, ...optionalParams) {
    if (process.env.NODE_ENV !== 'production') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        logger.debug(`[KREDİ ${timestamp}] ${message}`, ...optionalParams);
    }
}

/**
 * Hafta sonu kredisi hesaplama
 */
function anlikHaftaSonuKredisi(tarih, tumKurallar) {
    const haftaSonuKurali = tumKurallar.find(k => k.kural_adi === 'Hafta Sonu');
    if (!haftaSonuKurali || typeof haftaSonuKurali.kredi === 'undefined') return 0;
    const gun = tarih.getDay();
    return (gun === 0 || gun === 6) ? haftaSonuKurali.kredi : 0;
}

/**
 * Özel gün kredisi hesaplama
 */
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

/**
 * Zaman aralığı kontrolü
 */
function isTimeInInterval(dateObj, startTimeStr, endTimeStr) {
    const currentTimeInMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const startTimeTotalMinutes = startHour * 60 + startMinute;
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    let endTimeTotalMinutes = endHour * 60 + endMinute;
    
    if (endTimeStr === "00:00" && startTimeStr !== "00:00") {
        endTimeTotalMinutes = 24 * 60;
    } else if (endTimeStr === "00:00" && startTimeStr === "00:00") {
        return true;
    }
    
    if (endTimeTotalMinutes <= startTimeTotalMinutes) {
        return currentTimeInMinutes >= startTimeTotalMinutes || currentTimeInMinutes < endTimeTotalMinutes;
    } else {
        return currentTimeInMinutes >= startTimeTotalMinutes && currentTimeInMinutes < endTimeTotalMinutes;
    }
}

/**
 * Görevli nöbetçi belirleme (override ve izin kontrolü ile)
 */
async function determineActiveGuard(db, getGorevliNobetci, now) {
    try {
        // İzinli kayıtları al
        const izinler = await db.getIzinliNobetciVeYedekleri(now);
        logger.debug(`[Cron Helper] İzinli kayıtları: ${izinler.length} adet`);
        
        // Gerçek görevli nöbetçiyi bul
        const { nobetci: gercekGorevli, vardiya } = await getGorevliNobetci(now);
        if (!gercekGorevli) {
            logger.warn('[Cron Helper] Gerçek görevli nöbetçi bulunamadı');
            return { gorevliNobetci: null, gorevliKaynak: null, overrideTemizlendi: false };
        }

        // Override kontrolü
        const override = await db.getAktifNobetciOverride();
        let gorevliNobetci = gercekGorevli;
        let gorevliKaynak = 'otomatik';
        let overrideTemizlendi = false;

        if (override && override.nobetci_id) {
            const overrideNobetci = await db.getNobetciById(override.nobetci_id);
            if (overrideNobetci) {
                // Override'daki kişi izinli mi kontrol et
                const izinKaydi = izinler.find(iz => iz.nobetci_id === overrideNobetci.id);
                if (!izinKaydi) {
                    // Override'daki kişi izinli değil, onu kullan
                    gorevliNobetci = overrideNobetci;
                    gorevliKaynak = 'override';
                } else {
                    // Override'daki kişi izinli, override'ı temizle
                    await db.clearAktifNobetciOverride();
                    overrideTemizlendi = true;
                    logger.info(`[Cron Helper] Override temizlendi: ${overrideNobetci.name} izinli olduğu için`);
                }
            } else {
                // Override'daki ID geçersiz, temizle
                await db.clearAktifNobetciOverride();
                overrideTemizlendi = true;
                logger.warn('[Cron Helper] Override temizlendi: Geçersiz nöbetçi ID');
            }
        }

        return { gorevliNobetci, gorevliKaynak, overrideTemizlendi };
    } catch (error) {
        logger.error('[Cron Helper] Görevli nöbetçi belirlenirken hata:', error);
        throw error;
    }
}

/**
 * Kredi hesaplama
 */
async function calculateCredit(now, tumKrediKurallari, shiftTimeRanges) {
    let eklenecekKredi = 0;
    let krediSebebi = "normal mesai";

    // Özel gün kontrolü
    const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
    if (ozelKredi !== null) {
        eklenecekKredi = ozelKredi;
        const ozelGun = tumKrediKurallari.find(k => 
            k.kural_adi !== 'Hafta Sonu' && 
            k.tarih && 
            k.tarih.endsWith(String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'))
        );
        krediSebebi = `özel gün (${ozelGun ? ozelGun.kural_adi : ''})`;
    } 
    // Hafta sonu kontrolü
    else if (anlikHaftaSonuKredisi(now, tumKrediKurallari) !== 0) {
        eklenecekKredi = anlikHaftaSonuKredisi(now, tumKrediKurallari);
        krediSebebi = "hafta sonu";
    } 
    // Vardiya kontrolü
    else {
        const currentShiftRule = shiftTimeRanges.find(shift => 
            isTimeInInterval(now, shift.baslangic_saat, shift.bitis_saat)
        );
        if (currentShiftRule) {
            eklenecekKredi = currentShiftRule.kredi_dakika;
            krediSebebi = `vardiya (${currentShiftRule.baslangic_saat}-${currentShiftRule.bitis_saat})`;
        } else {
            eklenecekKredi = 1;
        }
    }

    return { eklenecekKredi, krediSebebi };
}

/**
 * Aktif nöbetçi güncelleme
 */
async function updateActiveGuard(db, gorevliNobetci, gorevliKaynak, overrideTemizlendi, notifyAllOfDutyChange) {
    try {
        const currentActive = await db.getAktifNobetci();
        if (!currentActive || currentActive.id !== gorevliNobetci.id || overrideTemizlendi) {
            await db.setAktifNobetci(gorevliNobetci.id);
            logger.info(`[Cron Helper] Aktif nöbetçi değiştirildi: ${gorevliNobetci.name} (${gorevliKaynak})`);
            
            if (typeof notifyAllOfDutyChange === 'function') {
                let bildirimSebebi = 'Otomatik Değişim';
                if (gorevliKaynak === 'override') {
                    bildirimSebebi = 'Manuel Atama';
                } else if (overrideTemizlendi) {
                    bildirimSebebi = 'İzin Değişimi';
                }
                await notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
            }
            return true;
        }
        return false;
    } catch (error) {
        logger.error('[Cron Helper] Aktif nöbetçi güncellenirken hata:', error);
        throw error;
    }
}

module.exports = {
    logCreditUpdate,
    anlikHaftaSonuKredisi,
    anlikOzelGunKredisiAl,
    isTimeInInterval,
    determineActiveGuard,
    calculateCredit,
    updateActiveGuard
};