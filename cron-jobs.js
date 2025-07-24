// Nobetciyim/cron-jobs.js
const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci, getGorevliNobetci } = require('./utils/calendarUtils');
const { notifyAllOfDutyChange } = require('./telegram_bot_handler');

// Loglama için yardımcı fonksiyonlar
function logCreditUpdate(message, ...optionalParams) {
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

// Yardımcı kredi fonksiyonları
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

// DAKİKALIK KREDİ GÜNCELLEME
cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
        // LOG: Şu anki zaman ve izinli kayıtları
        const izinler = await db.getIzinliNobetciVeYedekleri(now);
        console.log(`[DEBUG][Kredi Cron] now: ${now.toISOString()}`);
        izinler.forEach(iz => {
            console.log(`[DEBUG][Kredi Cron] İzinli: ${iz.nobetci_adi} (${iz.baslangic_tarihi} - ${iz.bitis_tarihi}), Gündüz Yedek: ${iz.gunduz_yedek_adi}, Gece Yedek: ${iz.gece_yedek_adi}`);
        });

        // 1. Gerçek görevli nöbetçiyi bul (izin/yedek kontrolü ile)
        const { nobetci: gercekGorevli, vardiya } = await getGorevliNobetci(now);
        if (!gercekGorevli) {
            logger.warn('[Kredi Cron] Gerçek görevli nöbetçi bulunamadı');
            return;
        }

        // 2. Override kontrolü
        const override = await db.getAktifNobetciOverride();
        let gorevliNobetci = null;
        let gorevliKaynak = '';
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
                    // Override'daki kişi izinli, override'ı temizle ve gerçek görevliyi ata
                    await db.clearAktifNobetciOverride();
                    overrideTemizlendi = true;
                    logger.info(`[Kredi Cron] Override temizlendi: ${overrideNobetci.name} izinli olduğu için`);
                }
            } else {
                // Override'daki ID geçersiz, temizle
                await db.clearAktifNobetciOverride();
                overrideTemizlendi = true;
                logger.warn('[Kredi Cron] Override temizlendi: Geçersiz nöbetçi ID');
            }
        }

        // 3. Override yoksa veya temizlendiyse gerçek görevliyi kullan
        if (!gorevliNobetci) {
            gorevliNobetci = gercekGorevli;
            gorevliKaynak = 'otomatik';
        }

        // 4. Aktif nöbetçi değiştiyse güncelle
        const currentActive = await db.getAktifNobetci();
        if (!currentActive || currentActive.id !== gorevliNobetci.id || overrideTemizlendi) {
            await db.setAktifNobetci(gorevliNobetci.id);
            logger.info(`[Kredi Cron] Aktif nöbetçi değiştirildi: ${gorevliNobetci.name} (${gorevliKaynak})`);
            
            if (typeof notifyAllOfDutyChange === 'function') {
                let bildirimSebebi = 'Otomatik Değişim';
                if (gorevliKaynak === 'override') {
                    bildirimSebebi = 'Manuel Atama';
                } else if (overrideTemizlendi) {
                    bildirimSebebi = 'İzin Değişimi';
                }
                await notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
            }
        }

        // 5. Kredi işlemleri
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
        
        const yeniKredi = (gorevliNobetci.kredi || 0) + eklenecekKredi;
        await db.updateNobetciKredi(gorevliNobetci.id, yeniKredi);
        logCreditUpdate(`[GÖREVLİ] ${gorevliNobetci.name} kredisi: ${yeniKredi} (+${eklenecekKredi} ${krediSebebi})`);
        
    } catch (error) {
        logger.error("[Kredi Cron] Hata:", error);
    }
}, { timezone: "Europe/Istanbul" });

// HAFTALIK NÖBETÇİ ATAMASI (Pazartesi 09:00)
cron.schedule('0 9 * * 1', async () => {
    logger.info('[Pzt 09:00 Cron] Haftalık nöbetçi atama görevi başlatıldı.');
    try {
        const anlikTarih = new Date();
        logger.info(`[Pzt 09:00 Cron] Yeni hafta için nöbetçi aranıyor (Hedef Tarih: ${anlikTarih.toISOString()})`);
        
        // Override'ı temizle (yeni hafta başladığı için)
        await db.clearAktifNobetciOverride();
        logger.info('[Pzt 09:00 Cron] Manuel atama (override) temizlendi - yeni hafta başlangıcı');
        
        // Gerçek görevli nöbetçiyi bul
        const { nobetci: gercekGorevli } = await getGorevliNobetci(anlikTarih);
        
        if (gercekGorevli && gercekGorevli.id) {
            await db.setAktifNobetci(gercekGorevli.id);
            logger.info(`[Pzt 09:00 Cron] Haftanın nöbetçisi başarıyla "${gercekGorevli.name}" olarak ayarlandı.`);
            
            if (typeof notifyAllOfDutyChange === 'function') {
                await notifyAllOfDutyChange(gercekGorevli.name, 'Haftalık Otomatik Değişim');
            }
        } else {
            logger.warn("[Pzt 09:00 Cron] Bu hafta için görevli nöbetçi bulunamadı. Atama yapılamadı.");
        }
    } catch (error) {
        logger.error("[Pzt 09:00 Cron] Görev sırasında kritik bir hata oluştu:", error);
    }
}, { timezone: "Europe/Istanbul" });

// AKŞAM VARDİYA DEĞİŞİMİ
async function setupEveningShiftCronJob() {
    try {
        const shiftTimeRanges = await db.getShiftTimeRanges();
        if (shiftTimeRanges && shiftTimeRanges.length > 1) {
            const eveningShift = shiftTimeRanges.find(shift => 
                shift.baslangic_saat >= '17:00' || 
                (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('akşam')) ||
                (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('gece'))
            ) || shiftTimeRanges[1];
            
            const [hour, minute] = eveningShift.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            cron.schedule(cronTime, async () => {
                logger.info(`[Akşam Vardiya] Cron tetiklendi (${eveningShift.baslangic_saat}).`);
                try {
                    const now = new Date();
                    
                    // Gerçek görevli nöbetçiyi bul (izin/yedek kontrolü ile)
                    const { nobetci: gercekGorevli, vardiya } = await getGorevliNobetci(now);
                    if (!gercekGorevli) {
                        logger.warn('[Akşam Vardiya] Gerçek görevli nöbetçi bulunamadı');
                        return;
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
                            const izinler = await db.getIzinliNobetciVeYedekleri(now);
                            const izinKaydi = izinler.find(iz => iz.nobetci_id === overrideNobetci.id);
                            
                            if (!izinKaydi) {
                                // Override'daki kişi izinli değil, onu kullan
                                gorevliNobetci = overrideNobetci;
                                gorevliKaynak = 'override';
                            } else {
                                // Override'daki kişi izinli, override'ı temizle
                                await db.clearAktifNobetciOverride();
                                overrideTemizlendi = true;
                                logger.info(`[Akşam Vardiya] Override temizlendi: ${overrideNobetci.name} izinli olduğu için`);
                            }
                        }
                    }

                    // Aktif nöbetçi değiştiyse güncelle
                    const currentActive = await db.getAktifNobetci();
                    if (!currentActive || currentActive.id !== gorevliNobetci.id || overrideTemizlendi) {
                        await db.setAktifNobetci(gorevliNobetci.id);
                        logger.info(`[Akşam Vardiya] Nöbetçi ayarlandı: ${gorevliNobetci.name} (${gorevliKaynak}).`);
                        
                        if (typeof notifyAllOfDutyChange === 'function') {
                            let bildirimSebebi = 'Akşam Vardiya Değişimi';
                            if (overrideTemizlendi) {
                                bildirimSebebi = 'Akşam Vardiya Değişimi (İzin Nedeniyle)';
                            } else if (gorevliKaynak === 'override') {
                                bildirimSebebi = 'Akşam Vardiya (Manuel Atama Devam)';
                            }
                            await notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
                        }
                    }
                } catch (error) {
                    logger.error(`[Akşam Vardiya] Cron hatası:`, error);
                }
            }, { timezone: "Europe/Istanbul" });
            
            logger.info(`Akşam vardiya cron job kuruldu: ${cronTime} (${eveningShift.baslangic_saat})`);
        }
    } catch (dbError) {
        logger.error("[setupEveningShiftCronJob] Veritabanından vardiya saatleri alınırken hata oluştu:", dbError);
    }
}

// GÜNDÜZ VARDİYA DEĞİŞİMİ (isteğe bağlı - gündüz vardiyası için ayrı cron)
async function setupMorningShiftCronJob() {
    try {
        const shiftTimeRanges = await db.getShiftTimeRanges();
        if (shiftTimeRanges && shiftTimeRanges.length > 0) {
            const morningShift = shiftTimeRanges.find(shift => 
                (shift.baslangic_saat >= '06:00' && shift.baslangic_saat <= '10:00') || 
                (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('gündüz')) ||
                (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('sabah'))
            ) || shiftTimeRanges[0];
            
            const [hour, minute] = morningShift.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            cron.schedule(cronTime, async () => {
                logger.info(`[Gündüz Vardiya] Cron tetiklendi (${morningShift.baslangic_saat}).`);
                try {
                    const now = new Date();
                    
                    // Gerçek görevli nöbetçiyi bul (izin/yedek kontrolü ile)
                    const { nobetci: gercekGorevli, vardiya } = await getGorevliNobetci(now);
                    if (!gercekGorevli) {
                        logger.warn('[Gündüz Vardiya] Gerçek görevli nöbetçi bulunamadı');
                        return;
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
                            const izinler = await db.getIzinliNobetciVeYedekleri(now);
                            const izinKaydi = izinler.find(iz => iz.nobetci_id === overrideNobetci.id);
                            
                            if (!izinKaydi) {
                                // Override'daki kişi izinli değil, onu kullan  
                                gorevliNobetci = overrideNobetci;
                                gorevliKaynak = 'override';
                            } else {
                                // Override'daki kişi izinli, override'ı temizle
                                await db.clearAktifNobetciOverride();
                                overrideTemizlendi = true;
                                logger.info(`[Gündüz Vardiya] Override temizlendi: ${overrideNobetci.name} izinli olduğu için`);
                            }
                        }
                    }

                    // Aktif nöbetçi değiştiyse güncelle
                    const currentActive = await db.getAktifNobetci();
                    if (!currentActive || currentActive.id !== gorevliNobetci.id || overrideTemizlendi) {
                        await db.setAktifNobetci(gorevliNobetci.id);
                        logger.info(`[Gündüz Vardiya] Nöbetçi ayarlandı: ${gorevliNobetci.name} (${gorevliKaynak}).`);
                        
                        if (typeof notifyAllOfDutyChange === 'function') {
                            let bildirimSebebi = 'Gündüz Vardiya Değişimi';
                            if (overrideTemizlendi) {
                                bildirimSebebi = 'Gündüz Vardiya Değişimi (İzin Nedeniyle)';
                            } else if (gorevliKaynak === 'override') {
                                bildirimSebebi = 'Gündüz Vardiya (Manuel Atama Devam)';
                            }
                            await notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
                        }
                    }
                } catch (error) {
                    logger.error(`[Gündüz Vardiya] Cron hatası:`, error);
                }
            }, { timezone: "Europe/Istanbul" });
            
            logger.info(`Gündüz vardiya cron job kuruldu: ${cronTime} (${morningShift.baslangic_saat})`);
        }
    } catch (dbError) {
        logger.error("[setupMorningShiftCronJob] Veritabanından vardiya saatleri alınırken hata oluştu:", dbError);
    }
}

// Başlangıçta zamanlanmış görevleri kur
setupEveningShiftCronJob();
setupMorningShiftCronJob();
logger.info('Tüm cron job tanımlamaları tamamlandı.');