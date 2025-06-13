// Nobetciyim/cron-jobs.js
const cron = require('node-cron');
const db = require('./db');
const { getAsilHaftalikNobetci, getWeekOfYear } = require('./utils/calendarUtils');
const { sendTelegramMessageToGroup } = require('./telegram_bot_handler'); // Bu fonksiyon parametre olarak chatID almalı

// Loglama fonksiyonu, .env dosyasındaki CRON_DEBUG_LOGGING değişkenine göre çalışır.
function logDebug(message, ...optionalParams) {
    if (process.env.CRON_DEBUG_LOGGING === 'true') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`[DEBUG ${timestamp}] ${message}`, ...optionalParams);
    }
}

console.log(`[CRON-JOBS INIT] CRON_DEBUG_LOGGING değeri: "${process.env.CRON_DEBUG_LOGGING}" (Beklenen: 'true' veya 'false')`);
if (process.env.CRON_DEBUG_LOGGING === 'true') {
    console.log("[CRON-JOBS INIT] Detaylı loglama aktif.");
} else {
    console.log("[CRON-JOBS INIT] Detaylı loglama kapalı.");
}

// --- Kredi Hesaplama Yardımcı Fonksiyonları ---
function anlikHaftaSonuKredisi(tarih, tumKurallar) {
    const haftaSonuKurali = tumKurallar.find(k => k.kural_adi === 'Hafta Sonu');
    if (!haftaSonuKurali || typeof haftaSonuKurali.kredi === 'undefined') {
        logDebug("[Kredi Hesaplama] Hafta Sonu kuralı veya kredi miktarı bulunamadı, 0 olarak varsayılıyor.");
        return 0;
    }
    const gun = tarih.getDay();
    const kredi = (gun === 0 || gun === 6) ? haftaSonuKurali.kredi : 0;
    if (kredi > 0) logDebug(`[Kredi Hesaplama Detay] Hafta sonu günü (${tarih.toLocaleDateString('tr-TR')}), Kredi: ${kredi}`);
    return kredi;
}

function anlikOzelGunKredisiAl(tarih, tumKurallar) {
    const ozelGunler = tumKurallar.filter(k => k.kural_adi !== 'Hafta Sonu' && k.tarih);
    for (const gun of ozelGunler) {
        const kuralTarihParts = gun.tarih.split('-');
        const kuralYil = parseInt(kuralTarihParts[0]);
        const kuralAy = parseInt(kuralTarihParts[1]) - 1;
        const kuralGun = parseInt(kuralTarihParts[2]);
        if (kuralYil === tarih.getFullYear() && kuralAy === tarih.getMonth() && kuralGun === tarih.getDate()) {
            logDebug(`[Kredi Hesaplama Detay] Özel gün (${gun.kural_adi} - ${tarih.toLocaleDateString('tr-TR')}), Kredi: ${gun.kredi}`);
            return gun.kredi;
        }
    }
    return null;
}

function anlikGetSaatAraligiKredisi(tarih, zamanAraliklari) {
    if (!zamanAraliklari || zamanAraliklari.length === 0) {
        logDebug("[Kredi Hesaplama Detay] Saat aralığı kuralı bulunamadı, varsayılan 1 kredi uygulanıyor.");
        return 1;
    }
    const saat = tarih.getHours();
    const dakika = tarih.getMinutes();
    const suankiToplamDakika = saat * 60 + dakika;

    for (const aralik of zamanAraliklari) {
      const [baslangicSaat, baslangicDakika] = aralik.baslangic_saat.split(':').map(Number);
      const [bitisSaat, bitisDakika] = aralik.bitis_saat.split(':').map(Number);
      let aralikBaslangicToplamDakika = baslangicSaat * 60 + baslangicDakika;
      let aralikBitisToplamDakika = bitisSaat * 60 + bitisDakika;
      
      if (aralik.bitis_saat === "00:00" && aralik.baslangic_saat !== "00:00") {
          aralikBitisToplamDakika = 24 * 60;
      } else if (aralik.bitis_saat === "00:00" && aralik.baslangic_saat === "00:00") {
          logDebug(`[Kredi Hesaplama Detay] Saat aralığı (Tam gün ${aralik.baslangic_saat}-${aralik.bitis_saat}), Kredi: ${aralik.kredi_dakika}`);
          return aralik.kredi_dakika;
      }

      if (aralikBitisToplamDakika <= aralikBaslangicToplamDakika) { 
        if (suankiToplamDakika >= aralikBaslangicToplamDakika || suankiToplamDakika < aralikBitisToplamDakika) {
          logDebug(`[Kredi Hesaplama Detay] Saat aralığı (Geceyi aşan ${aralik.baslangic_saat}-${aralik.bitis_saat}), Kredi: ${aralik.kredi_dakika}`);
          return aralik.kredi_dakika;
        }
      } else { 
        if (suankiToplamDakika >= aralikBaslangicToplamDakika && suankiToplamDakika < aralikBitisToplamDakika) {
          logDebug(`[Kredi Hesaplama Detay] Saat aralığı (${aralik.baslangic_saat}-${aralik.bitis_saat}), Kredi: ${aralik.kredi_dakika}`);
          return aralik.kredi_dakika;
        }
      }
    }
    logDebug("[Kredi Hesaplama Detay] Saat aralığı için eşleşme bulunamadı, varsayılan 1 kredi uygulanıyor.");
    return 1;
}

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


let activeShiftChangeJobs = [];

async function setupShiftChangeCronJobs() {
    activeShiftChangeJobs.forEach(job => job.stop());
    activeShiftChangeJobs = [];
    logDebug("[Cron Setup] Mevcut vardiya değişim cron job'ları temizlendi.");

    const shiftTimeRanges = await db.getShiftTimeRanges();
    
    const envTelegramChatId = process.env.TELEGRAM_CHAT_ID; 
    const envIsTelegramActive = !!process.env.TELEGRAM_BOT_TOKEN; 

    logDebug("[Cron Setup] .env Telegram Ayarları:", { envTelegramChatId, envIsTelegramActive });

    if (shiftTimeRanges && shiftTimeRanges.length === 2) {
        logDebug("[Cron Setup] İki vardiya modu için cron job'lar ayarlanıyor...");
        const shift1 = shiftTimeRanges[0]; 
        const shift2 = shiftTimeRanges[1]; 

        const scheduleShiftChangeJob = async (shiftDetails, isFirstShift) => {
            const [hour, minute] = shiftDetails.baslangic_saat.split(':').map(Number);
            const cronTime = `${minute} ${hour} * * *`;
            
            const job = cron.schedule(cronTime, async () => {
                const now = new Date();
                const currentVardiyaTipi = isFirstShift ? "(Gündüz)" : "(Gece)"; 
                const vardiyaLogAdi = isFirstShift ? "Vardiya 1 (Gündüz)" : "Vardiya 2 (Gece)"; 
                
                console.log(`[Vardiya Değişimi] [${now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}] ${vardiyaLogAdi} cron tetiklendi (${shiftDetails.baslangic_saat}).`);
                
                try {
                    logDebug(`[Vardiya Değişimi] ${vardiyaLogAdi} - Kullanılacak .env Telegram Ayarları:`, { telegramChatId: envTelegramChatId, isTelegramActive: envIsTelegramActive });

                    const tumKurallar = await db.getAllKrediKurallari();
                    const gunNo = now.getDay();
                    const isWeekend = (gunNo === 0 || gunNo === 6);
                    const ozelGunKredisi = anlikOzelGunKredisiAl(now, tumKurallar);
                    const isSpecialHoliday = (ozelGunKredisi !== null);

                    if (isWeekend || isSpecialHoliday) {
                        let bypassReason = isWeekend ? "Hafta Sonu" : `Özel Tatil (${ozelGunKredisi} kredi)`;
                        console.log(`[Vardiya Değişimi] ${vardiyaLogAdi}: ${bypassReason} nedeniyle vardiya değişimi atlandı.`);
                        return;
                    }

                    const currentWeek = getWeekOfYear(now);
                    const currentYear = now.getFullYear();
                    const weeklyOverride = await db.getDutyOverride(currentYear, currentWeek);

                    let targetNobetci = null;
                    
                    if (isFirstShift) { 
                        logDebug(`[Vardiya Değişimi] ${vardiyaLogAdi}: Gelecek haftanın nöbetçisi atanacak.`);
                        const nextWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                        targetNobetci = await getAsilHaftalikNobetci(nextWeekDate);
                    } else { 
                        if (weeklyOverride && weeklyOverride.nobetci_id_override !== null) {
                            logDebug(`[Vardiya Değişimi] ${vardiyaLogAdi}: Hafta ${currentWeek}/${currentYear} için manuel atama (${weeklyOverride.nobetci_adi_override || 'ID: '+weeklyOverride.nobetci_id_override}) uygulanacak.`);
                            const manuelNobetciDetay = await db.getNobetciById(weeklyOverride.nobetci_id_override);
                            if(manuelNobetciDetay) {
                                targetNobetci = { id: manuelNobetciDetay.id, name: manuelNobetciDetay.name, telegram_id: manuelNobetciDetay.telegram_id };
                            }
                        } else {
                            logDebug(`[Vardiya Değişimi] ${vardiyaLogAdi}: Bu haftanın asıl nöbetçisi atanacak (manuel override yok).`);
                            targetNobetci = await getAsilHaftalikNobetci(now);
                        }
                    }

                    if (targetNobetci && targetNobetci.id) {
                        const currentActive = await db.getAktifNobetci();
                        if (!currentActive || currentActive.id !== targetNobetci.id) {
                            await db.setAktifNobetci(targetNobetci.id);
                            // Sadeleştirilmiş mesaj formatı
                            const message = `Otomatik Vardiya Değişimi ${currentVardiyaTipi}\nAktif Nöbetçi: *${targetNobetci.name}*`;
                            console.log(`[Vardiya Değişimi] Nöbetçi ayarlandı: ${targetNobetci.name}. Telegram'a gönderilecek mesaj: ${message.replace(/\*/g, '')}`);
                            
                            if (envIsTelegramActive && envTelegramChatId) {
                                await sendTelegramMessageToGroup(envTelegramChatId, message); 
                                console.log(`[Vardiya Değişimi] Telegram mesajı ${envTelegramChatId} ID'sine gönderildi.`);
                            } else {
                                logDebug(`[Vardiya Değişimi] Telegram bot token (${envIsTelegramActive ? 'VAR':'YOK'}) veya chat ID (${envTelegramChatId || 'YOK'}) .env'de eksik/yanlış. Mesaj gönderilmedi.`);
                            }
                        } else {
                            logDebug(`[Vardiya Değişimi] ${vardiyaLogAdi}: ${targetNobetci.name} zaten aktif nöbetçi.`);
                        }
                    } else {
                        console.warn(`[Vardiya Değişimi] ${vardiyaLogAdi}: Hedef nöbetçi bulunamadı.`);
                    }
                } catch (error) {
                    console.error(`[Vardiya Değişimi] ${vardiyaLogAdi} cron job hatası:`, error.message, error.stack);
                }
            }, { timezone: "Europe/Istanbul" });
            activeShiftChangeJobs.push(job);
            const logVardiyaAdi = isFirstShift ? "Vardiya 1 (Gündüz)" : "Vardiya 2 (Gece)";
            console.log(`[Cron Setup] ${logVardiyaAdi} değişim cron job'u "${cronTime}" (Europe/Istanbul) için ayarlandı.`);
        };

        await scheduleShiftChangeJob(shift1, true); 
        await scheduleShiftChangeJob(shift2, false);

    } else {
        logDebug("[Cron Setup] Tek vardiya / Vardiyasız mod. Özel vardiya değişim cron job'ları ayarlanmadı.");
    }
}

cron.schedule('3 * * * *', async () => { 
    logDebug("[Cron Kontrol] Saatlik kontrol: Vardiya değişim cron job'ları yeniden ayarlanıyor...");
    await setupShiftChangeCronJobs();
}, { timezone: "Europe/Istanbul" });

setupShiftChangeCronJobs();

// Dakikalık KREDİ güncelleme cron görevi
cron.schedule('* * * * *', async () => {
    const now = new Date();
    logDebug(`[Kredi Cron - ${now.toLocaleTimeString('tr-TR', {timeZone: 'Europe/Istanbul'})}] Tetiklendi.`);
    try {
        const aktifNobetci = await db.getAktifNobetci();
        if (!aktifNobetci) {
            logDebug("[Kredi Cron] Aktif nöbetçi yok, kredi güncellenmeyecek.");
            return;
        }
        logDebug(`[Kredi Cron] Aktif nöbetçi: ${aktifNobetci.name} (ID: ${aktifNobetci.id}), Mevcut Kredi: ${aktifNobetci.kredi}`);

        const tumKrediKurallari = await db.getAllKrediKurallari();
        const shiftTimeRanges = await db.getShiftTimeRanges();

        let eklenecekKredi = 0;
        let krediKaynagi = "Bilinmiyor";

        const ozelKredi = anlikOzelGunKredisiAl(now, tumKrediKurallari);
        if (ozelKredi !== null) {
            eklenecekKredi = ozelKredi;
            krediKaynagi = `Özel Gün (${ozelKredi})`;
        } else {
            const haftaSonuKredisiDegeri = anlikHaftaSonuKredisi(now, tumKrediKurallari);
            if (haftaSonuKredisiDegeri !== 0) {
                eklenecekKredi = haftaSonuKredisiDegeri;
                krediKaynagi = `Hafta Sonu (${haftaSonuKredisiDegeri})`;
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
                krediKaynagi = currentShiftRule ? `Saat Aralığı (${currentShiftRule.baslangic_saat}-${currentShiftRule.bitis_saat} -> ${eklenecekKredi})` : `Varsayılan Saat Aralığı (${eklenecekKredi})`;
            }
        }
        
        const currentKredi = aktifNobetci.kredi === undefined || aktifNobetci.kredi === null ? 0 : aktifNobetci.kredi;
        if (aktifNobetci.kredi === undefined || aktifNobetci.kredi === null) {
             logDebug(`[Kredi Cron] Nöbetçi ${aktifNobetci.name} (ID: ${aktifNobetci.id}) için kredi tanımsızdı. 0 olarak varsayıldı.`);
        }
        const yeniKredi = currentKredi + eklenecekKredi;
        await db.updateNobetciKredi(aktifNobetci.id, yeniKredi);
        
        logDebug(`[Kredi Cron] ${aktifNobetci.name} (ID: ${aktifNobetci.id}) kredisi güncellendi.`);
        logDebug(`    >> Kaynak: ${krediKaynagi}`);
        logDebug(`    >> Eski Kredi: ${currentKredi}, Eklenen: ${eklenecekKredi}, Yeni Kredi: ${yeniKredi}`);
        
    } catch (error) {
        console.error("[Kredi Cron] Dakikalık kredi güncelleme görevinde hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });


// Pazartesi 07:00 Cron Job'u (DÜZELTİLMİŞ)
cron.schedule('0 7 * * 1', async () => {
    const simdi = new Date();
    console.log(`[Pzt 07:00 Cron] [${simdi.toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})}] Haftalık ana nöbetçi belirleme çalışıyor...`);
    try {
        const currentWeek = getWeekOfYear(simdi);
        const currentYear = simdi.getFullYear();
        const override = await db.getDutyOverride(currentYear, currentWeek);
        
        const envTelegramChatIdPzt = process.env.TELEGRAM_CHAT_ID;
        const envIsTelegramActivePzt = !!process.env.TELEGRAM_BOT_TOKEN;

        logDebug("[Pzt 07:00 Cron] Anlık .env Telegram Ayarları:", { telegramChatId: envTelegramChatIdPzt, isTelegramActive: envIsTelegramActivePzt });
        
        let hedefNobetci = null;
        let atamaTuru = "Haftalık"; // Bildirim mesajı için

        if (override && override.nobetci_id_override !== null) {
            console.log(`[Pzt 07:00 Cron] Hafta ${currentWeek}/${currentYear} için manuel atama (${override.nobetci_adi_override || 'ID: '+override.nobetci_id_override}) uygulanacak.`);
            const manuelNobetciDetay = await db.getNobetciById(override.nobetci_id_override);
            if (manuelNobetciDetay) {
                hedefNobetci = { id: manuelNobetciDetay.id, name: manuelNobetciDetay.name, telegram_id: manuelNobetciDetay.telegram_id };
                atamaTuru = "Haftalık (Manuel Atama)";
            } else {
                 console.warn(`[Pzt 07:00 Cron] Manuel atama için nöbetçi ID'si (${override.nobetci_id_override}) veritabanında bulunamadı.`);
                 return; // Hedef bulunamadıysa devam etme
            }
        } else {
            console.log(`[Pzt 07:00 Cron] Otomatik haftalık nöbetçi belirleniyor.`);
            hedefNobetci = await getAsilHaftalikNobetci(simdi);
            atamaTuru = "Haftalık (Otomatik)";
        }
        
        if (hedefNobetci && hedefNobetci.id) {
            const aktifSuAn = await db.getAktifNobetci();
            
            // Eğer mevcut aktif nöbetçi, yeni haftanın hedefi ile aynı değilse, değiştir.
            if (!aktifSuAn || aktifSuAn.id !== hedefNobetci.id) {
                console.log(`[Pzt 07:00 Cron] Aktif nöbetçi değiştiriliyor. Mevcut: ${aktifSuAn ? aktifSuAn.name : 'Yok'}, Yeni: ${hedefNobetci.name}`);
                await db.setAktifNobetci(hedefNobetci.id);
                
                const message = `${atamaTuru} Değişimi:\nAktif Nöbetçi: *${hedefNobetci.name}*`;
                console.log(`[Pzt 07:00 Cron] Nöbetçi ayarlandı: ${hedefNobetci.name}.`);
                
                if (envIsTelegramActivePzt && envTelegramChatIdPzt) {
                    await sendTelegramMessageToGroup(envTelegramChatIdPzt, message);
                    console.log(`[Pzt 07:00 Cron] Telegram mesajı ${envTelegramChatIdPzt} ID'sine gönderildi.`);
                } else {
                    logDebug(`[Pzt 07:00 Cron] Telegram bot token veya chat ID .env'de eksik/yanlış. Mesaj gönderilmedi.`);
                }
            } else {
                logDebug(`[Pzt 07:00 Cron] ${hedefNobetci.name} zaten aktif nöbetçi. Değişiklik yapılmadı.`);
            }
            
            // İki vardiya modu için ek loglama
            const shiftTimeRanges = await db.getShiftTimeRanges();
            if (shiftTimeRanges && shiftTimeRanges.length >= 2) {
                logDebug(`[Pzt 07:00 Cron] Bilgi: İki vardiya modu aktif. Haftalık ana nöbetçi ${hedefNobetci.name} olarak ayarlandı. Gün içi değişimler vardiya job'ları tarafından yönetilecek (eğer tatil değilse).`);
            }

        } else {
            console.warn("[Pzt 07:00 Cron] Bu hafta için hedef nöbetçi belirlenemedi (ne manuel ne de otomatik).");
        }

    } catch (error) {
        console.error("[Pzt 07:00 Cron] Haftalık nöbetçi belirleme görevinde hata:", error.message, error.stack);
    }
}, { timezone: "Europe/Istanbul" });

console.log('Tüm cron job tanımlamaları tamamlandı (Europe/Istanbul).');
