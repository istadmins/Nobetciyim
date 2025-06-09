// Nobetciyim/utils/calendarUtils.js
const db = require('../db');

/**
 * Belirtilen tarihin yılın kaçıncı haftası olduğunu döndürür (ISO 8601'e yakın).
 * Pazartesi haftanın ilk günü kabul edilir.
 * @param {Date} date - Tarih objesi
 * @returns {number} Yılın haftası
 */
function getWeekOfYear(date) {
    const target = new Date(date.valueOf());
    target.setHours(0, 0, 0, 0); // Saati sıfırla, sadece tarihle çalış
    // Pazartesi haftanın ilk günü (getDay: Pazar=0, Pzt=1.. Cts=6)
    // ISO 8601'e göre: Pazartesi=1..Pazar=7. Bizim için Pazartesi=0.
    const dayNr = (target.getDay() + 6) % 7; 
    target.setDate(target.getDate() - dayNr + 3); // Haftanın Perşembesine git (ISO 8601 kuralı)
    const firstThursday = target.valueOf();
    target.setMonth(0, 1); // Yılın ilk gününe git
    if (target.getDay() !== 4) { // Eğer ilk gün Perşembe değilse, yılın ilk Perşembesine git
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
}

/**
 * Veritabanından tüm nöbetçileri çeker (ID'ye göre sıralı).
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
        // db.getSettings() fonksiyonu zaten uygulama_ayarlari tablosunu okuyor.
        // Onu kullanabiliriz veya burada direkt sorgu yapabiliriz.
        // Eğer db.js'de getSettings yoksa bu direkt sorgu kalabilir.
        // Varsa, db.getSettings().then(settings => resolve(settings.resort_config || default_config))
        db.get("SELECT ayar_value FROM uygulama_ayarlari WHERE ayar_key = 'resort_config'", [], (err, row) => {
            const defaultConfig = { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };
            if (err) {
                console.error("DB Error (getResortConfigFromDB):", err.message);
                reject(err); // Hata durumunda reject et
            } else if (row && row.ayar_value) {
                try {
                    resolve(JSON.parse(row.ayar_value));
                } catch (parseError) {
                    console.error("JSON Parse Error (getResortConfigFromDB):", parseError.message);
                    resolve(defaultConfig); // Bozuk veri durumunda varsayılanı döndür
                }
            } else {
                resolve(defaultConfig); // Ayar bulunamazsa varsayılanı döndür
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
        const override = await db.getDutyOverride(yil, haftaNo); // db.js'deki fonksiyonu kullanıyoruz

        if (override && typeof override.nobetci_id_override === 'number') {
            // Manuel atanan nöbetçinin diğer bilgilerini de (telegram_id) çekmek iyi olabilir.
            // getDutyOverride zaten Nobetciler tablosuyla join yapıp adı getiriyor.
            // Eğer telegram_id de gerekirse, o sorguya eklenebilir.
            // Şimdilik sadece ID ve adı varsayıyoruz.
            // console.log(`[getAsilHaftalikNobetci] Override bulundu: Yıl ${yil}, Hafta ${haftaNo} -> ${override.nobetci_adi_override} (ID: ${override.nobetci_id_override})`);
            const overriddenNobetci = await db.getNobetciById(override.nobetci_id_override);
            return overriddenNobetci ? { id: overriddenNobetci.id, name: overriddenNobetci.name, telegram_id: overriddenNobetci.telegram_id } : null;
        }

        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            console.warn("[getAsilHaftalikNobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null;
        }

        const resortConfig = await getResortConfigFromDB();
        let nobetciSiraIndex = 0; // Varsayılan eğer hesaplanamazsa

        if (nobetciler.length > 0) { // Nöbetçi varsa sıralama yap
            if (resortConfig.aktif &&
                (yil > resortConfig.baslangicYili ||
                 (yil === resortConfig.baslangicYili && haftaNo >= resortConfig.baslangicHaftasi))) {
                let haftalarFarki = 0;
                if (yil === resortConfig.baslangicYili) {
                    haftalarFarki = haftaNo - resortConfig.baslangicHaftasi;
                } else {
                    let baslangicYilindakiSonHafta = getWeekOfYear(new Date(resortConfig.baslangicYili, 11, 28));
                    haftalarFarki = baslangicYilindakiSonHafta - resortConfig.baslangicHaftasi;
                    for (let y = resortConfig.baslangicYili + 1; y < yil; y++) {
                        haftalarFarki += getWeekOfYear(new Date(y, 11, 28));
                    }
                    haftalarFarki += haftaNo;
                }
                nobetciSiraIndex = (resortConfig.baslangicNobetciIndex + haftalarFarki) % nobetciler.length;
            } else {
                const yearStartDateForWeekCalc = new Date(yil, 0, 1);
                const weeksOffset = getWeekOfYear(yearStartDateForWeekCalc);
                nobetciSiraIndex = (haftaNo - weeksOffset + nobetciler.length) % nobetciler.length;
            }
        }

        const asilNobetci = nobetciler[nobetciSiraIndex];
        if (asilNobetci) {
            return { id: asilNobetci.id, name: asilNobetci.name, telegram_id: asilNobetci.telegram_id };
        } else {
            console.warn(`[getAsilHaftalikNobetci] Asıl nöbetçi hesaplanamadı. Index: ${nobetciSiraIndex}, Nöbetçi Sayısı: ${nobetciler.length}`);
            return null;
        }

    } catch (error) {
        console.error("[getAsilHaftalikNobetci] Fonksiyonunda hata:", error.message, error.stack);
        return null;
    }
}

module.exports = {
    getWeekOfYear,
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB // Telegram botu için de gerekebilir
};
