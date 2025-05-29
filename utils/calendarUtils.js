// node2/utils/calendarUtils.js
const db = require('../db'); // Veritabanı bağlantısı

/**
 * Belirtilen tarihin yılın kaçıncı haftası olduğunu döndürür (ISO 8601'e yakın).
 * Pazartesi haftanın ilk günü kabul edilir.
 * Kaynak: cron-jobs.js dosyasından alınmıştır.
 * @param {Date} date - Tarih objesi
 * @returns {number} Yılın haftası
 */
function getWeekOfYear(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7; // Pazartesi = 0 ... Pazar = 6
    target.setDate(target.getDate() - dayNr + 3); // Haftanın Perşembesine git
    const firstThursday = target.valueOf();
    target.setMonth(0, 1); // Yılın ilk gününe git
    if (target.getDay() !== 4) { // Eğer ilk gün Perşembe değilse, yılın ilk Perşembesine git
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
}

/**
 * Veritabanından tüm nöbetçileri çeker.
 * @returns {Promise<Array<Object>>} Nöbetçi listesi [{id, name, telegram_id}, ...]
 */
async function getAllNobetcilerFromDB() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, name, telegram_id FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
            if (err) {
                console.error("DB Error (getAllNobetcilerFromDB):", err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Veritabanından yeniden sıralama ayarlarını çeker.
 * @returns {Promise<Object>} Yeniden sıralama ayarları objesi
 */
async function getResortConfigFromDB() {
    return new Promise((resolve, reject) => {
        db.get("SELECT ayar_value FROM uygulama_ayarlari WHERE ayar_key = 'resort_config'", [], (err, row) => {
            if (err) {
                console.error("DB Error (getResortConfigFromDB):", err.message);
                reject(err);
            } else if (row && row.ayar_value) {
                try {
                    resolve(JSON.parse(row.ayar_value));
                } catch (parseError) {
                    console.error("JSON Parse Error (getResortConfigFromDB):", parseError.message);
                    // Bozuk veri durumunda varsayılanı döndür
                    resolve({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
                }
            } else {
                // Ayar bulunamazsa varsayılanı döndür
                resolve({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
            }
        });
    });
}

/**
 * Belirli bir tarih için o haftanın asıl nöbetçisini belirler.
 * Önce takvimdeki manuel atamayı (override) kontrol eder.
 * Yoksa, yeniden sıralama ayarlarını (resort_config) dikkate alarak veya
 * standart sıralama ile haftanın nöbetçisini bulur.
 * @param {Date} date - Asıl nöbetçisi belirlenecek haftanın herhangi bir günü.
 * @returns {Promise<Object|null>} Asıl nöbetçinin {id, name, telegram_id} objesini veya bulunamazsa null döner.
 */
async function getAsilHaftalikNobetci(date) {
    const yil = date.getFullYear();
    const haftaNo = getWeekOfYear(date);

    try {
        // 1. Takvimde manuel override var mı kontrol et
        const override = await new Promise((resolve, reject) => {
            db.get("SELECT ta.nobetci_id_override, n.name, n.telegram_id FROM takvim_aciklamalari ta JOIN Nobetciler n ON n.id = ta.nobetci_id_override WHERE ta.yil = ? AND ta.hafta = ?", [yil, haftaNo], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (override && typeof override.nobetci_id_override === 'number') {
            console.log(`[getAsilHaftalikNobetci] Override bulundu: Yıl ${yil}, Hafta ${haftaNo} -> ${override.name} (ID: ${override.nobetci_id_override})`);
            return { id: override.nobetci_id_override, name: override.name, telegram_id: override.telegram_id };
        }

        // 2. Override yoksa, sıralama mantığını kullan
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            console.warn("[getAsilHaftalikNobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null;
        }

        const resortConfig = await getResortConfigFromDB();
        let nobetciSiraIndex;

        if (resortConfig.aktif &&
            (yil > resortConfig.baslangicYili ||
             (yil === resortConfig.baslangicYili && haftaNo >= resortConfig.baslangicHaftasi))) {
            // Yeniden sıralama aktif ve tarih kapsamında
            let haftalarFarki = 0;
            if (yil === resortConfig.baslangicYili) {
                haftalarFarki = haftaNo - resortConfig.baslangicHaftasi;
            } else {
                // Başlangıç yılındaki son haftayı bul (28 Aralık her zaman yılın son haftasındadır)
                let baslangicYilindakiSonHafta = getWeekOfYear(new Date(resortConfig.baslangicYili, 11, 28));
                haftalarFarki = baslangicYilindakiSonHafta - resortConfig.baslangicHaftasi;

                for (let y = resortConfig.baslangicYili + 1; y < yil; y++) {
                    haftalarFarki += getWeekOfYear(new Date(y, 11, 28)); // O yılın toplam hafta sayısı
                }
                haftalarFarki += haftaNo; // Mevcut yılın hafta numarası
            }
            nobetciSiraIndex = (resortConfig.baslangicNobetciIndex + haftalarFarki) % nobetciler.length;
            console.log(`[getAsilHaftalikNobetci] Yeniden sıralama kullanıldı. Fark: ${haftalarFarki}, Index: ${nobetciSiraIndex}`);

        } else {
            // Standart sıralama (calendar.js ve cron-jobs.js ile benzer mantık)
            // Yılın ilk gününün hafta numarasını bul
            const yearStartDateForWeekCalc = new Date(yil, 0, 1);
            // Pazartesi'yi haftanın ilk günü kabul eden bir getWeekOfYear kullandığımız için,
            // yılın ilk gününün bulunduğu haftayı direkt çıkarabiliriz.
            // calendar.js'deki mantık: (haftaNo - yılınİlkHaftaNo + 1) -1
            // cron-jobs.js'deki mantık: (weeksSinceYearStart - 1)
            // weeksSinceYearStart = currentWeekNumber - getWeekOfYearForCron(yearStartDateForWeekCalc) + 1;
            // nobetciSiraIndex = (weeksSinceYearStart - 1 + nobetciler.length) % nobetciler.length;

            const weeksOffset = getWeekOfYear(yearStartDateForWeekCalc);
            // Haftalar 1'den başladığı için ve index 0'dan başladığı için ayarlama
            nobetciSiraIndex = (haftaNo - weeksOffset + nobetciler.length) % nobetciler.length;


            // Alternatif ve daha basit olabilecek bir standart sıralama:
            // Her yılın 1. haftasında ilk nöbetçiden başla.
            // nobetciSiraIndex = (haftaNo - 1 + nobetciler.length) % nobetciler.length;
            // Bu, `calendar.js`'deki `weeksSinceYearStart` mantığına daha yakın:
            // const weeksSinceYearStart = haftaNo - getWeekOfYear(new Date(yil, 0, 1)) +1; (getWeekOfYear, 1 tabanlı)
            // nobetciSiraIndex = (weeksSinceYearStart -1 + nobetciler.length) % nobetciler.length;
             console.log(`[getAsilHaftalikNobetci] Standart sıralama kullanıldı. HaftaNo: ${haftaNo}, Index: ${nobetciSiraIndex}`);
        }

        const asilNobetci = nobetciler[nobetciSiraIndex];
        if (asilNobetci) {
            console.log(`[getAsilHaftalikNobetci] Belirlenen asıl nöbetçi: ${asilNobetci.name} (ID: ${asilNobetci.id})`);
            return { id: asilNobetci.id, name: asilNobetci.name, telegram_id: asilNobetci.telegram_id };
        } else {
            console.warn(`[getAsilHaftalikNobetci] Asıl nöbetçi hesaplanamadı. Index: ${nobetciSiraIndex}, Nöbetçi Sayısı: ${nobetciler.length}`);
            return null;
        }

    } catch (error) {
        console.error("[getAsilHaftalikNobetci] Fonksiyonunda hata:", error.message);
        return null;
    }
}

module.exports = {
    getWeekOfYear,
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB // Bunu da export edelim, telegram_bot_handler'da gerekebilir
};