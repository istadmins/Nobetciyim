// utils/calendarUtils.js

const db = require('../db');

/**
 * Verilen bir tarihin ISO 8601 standardına göre hafta numarasını döndürür.
 * @param {Date} date - Hafta numarasını bulmak için tarih nesnesi.
 * @returns {number} Yılın hafta numarası (1-53).
 */
function getWeekOfYear(date) {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
}

/**
 * Tüm nöbetçileri veritabanından, ID'ye göre sıralı bir şekilde alır.
 * @returns {Promise<Array>} Nöbetçi listesi.
 */
async function getAllNobetcilerFromDB() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
            if (err) {
                console.error("DB Hatası (getAllNobetcilerFromDB):", err.message);
                reject(err);
            }
            resolve(rows || []);
        });
    });
}

/**
 * Belirtilen bir tarih için asıl nöbetçiyi belirler.
 * ÖNCELİK 1: Takvimdeki manuel atamayı (override) kontrol eder.
 * ÖNCELİK 2: Manuel atama yoksa, nöbet sıralama ayarlarını kontrol eder.
 * ÖNCELİK 3: Sıralama ayarları yoksa, basit ve güvenilir bir otomatik rotasyon uygular.
 * @param {Date} date - Nöbetçinin belirleneceği tarih.
 * @returns {Promise<Object|null>} Nöbetçi nesnesi veya bulunamazsa null.
 */
async function getAsilHaftalikNobetci(date) {
    try {
        const yil = date.getFullYear();
        const hafta = getWeekOfYear(date);

        // ÖNCELİK 1: Manuel atama (override) var mı diye kontrol et.
        if (typeof db.getDutyOverride === 'function') {
            const override = await db.getDutyOverride(yil, hafta);
            if (override && override.nobetci_id_override) {
                const nobetci = await db.getNobetciById(override.nobetci_id_override);
                return nobetci;
            }
        }

        // İzinli nöbetçileri bul (haftanın başı ve sonu)
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Pazartesi
        weekStart.setHours(0,0,0,0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Pazar
        weekEnd.setHours(23,59,59,999);
        const izinliNobetciIdleri = await db.getIzinliNobetciIdleri(weekStart.toISOString(), weekEnd.toISOString());

        const nobetSiralamaAyarlari = await getNobetSiralamaAyarlari();
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            return null;
        }

        let nobetciIndex;
        if (nobetSiralamaAyarlari.aktif &&
            (yil > nobetSiralamaAyarlari.baslangicYili ||
             (yil === nobetSiralamaAyarlari.baslangicYili && hafta >= nobetSiralamaAyarlari.baslangicHaftasi))) {
            let haftalarFarki = 0;
            if (yil === nobetSiralamaAyarlari.baslangicYili) {
                haftalarFarki = hafta - nobetSiralamaAyarlari.baslangicHaftasi;
            } else {
                let baslangicYilindakiSonHafta = getWeekOfYear(new Date(nobetSiralamaAyarlari.baslangicYili, 11, 28));
                haftalarFarki = baslangicYilindakiSonHafta - nobetSiralamaAyarlari.baslangicHaftasi;
                for (let y = nobetSiralamaAyarlari.baslangicYili + 1; y < yil; y++) {
                    haftalarFarki += getWeekOfYear(new Date(y, 11, 28));
                }
                haftalarFarki += hafta;
            }
            nobetciIndex = (nobetSiralamaAyarlari.baslangicNobetciIndex + haftalarFarki) % nobetciler.length;
        } else {
            const yearStartDateForWeekCalc = new Date(yil, 0, 1);
            const weeksSinceYearStart = hafta - getWeekOfYear(yearStartDateForWeekCalc) + 1;
            nobetciIndex = (weeksSinceYearStart - 1 + nobetciler.length) % nobetciler.length;
        }

        // İzinli olmayan ilk nöbetçiyi bul
        let asilNobetci = null;
        let deneme = 0;
        while (deneme < nobetciler.length) {
            const aday = nobetciler[(nobetciIndex + deneme) % nobetciler.length];
            if (!izinliNobetciIdleri.includes(aday.id)) {
                asilNobetci = aday;
                break;
            }
            deneme++;
        }

        // Eğer asil nöbetçi izinliyse, o gün ve saat için yedek ata
        if (asilNobetci && izinliNobetciIdleri.includes(asilNobetci.id)) {
            // O gün ve saat için izin kaydını bul
            const izinler = await db.getIzinliNobetciVeYedekleri(date);
            const izinKaydi = izinler.find(i => i.nobetci_id === asilNobetci.id);
            if (izinKaydi) {
                // Gündüz/gece saatini belirle
                const shiftRanges = await db.getShiftTimeRanges();
                let isGunduz = true;
                if (shiftRanges && shiftRanges.length > 1) {
                    // Gündüz: ilk vardiya, Gece: ikinci vardiya
                    const nowHour = date.getHours();
                    const gunduzBas = parseInt(shiftRanges[0].baslangic_saat.split(":")[0], 10);
                    const gunduzBit = parseInt(shiftRanges[0].bitis_saat.split(":")[0], 10);
                    if (gunduzBas <= nowHour && nowHour < gunduzBit) {
                        isGunduz = true;
                    } else {
                        isGunduz = false;
                    }
                }
                let yedekId = null;
                if (isGunduz && izinKaydi.gunduz_yedek_id) {
                    yedekId = izinKaydi.gunduz_yedek_id;
                } else if (!isGunduz && izinKaydi.gece_yedek_id) {
                    yedekId = izinKaydi.gece_yedek_id;
                }
                if (yedekId) {
                    const yedekNobetci = await db.getNobetciById(yedekId);
                    if (yedekNobetci) return yedekNobetci;
                }
            }
        }

        if (!asilNobetci) {
            return null;
        }
        return asilNobetci;
    } catch (error) {
        return null;
    }
}

/**
 * Nöbet sıralama ayarlarını veritabanından alır.
 * @returns {Promise<Object>} Nöbet sıralama ayarları
 */
async function getNobetSiralamaAyarlari() {
    return new Promise((resolve) => {
        db.get("SELECT ayar_value FROM uygulama_ayarlari WHERE ayar_key = 'nobet_siralama_ayarlari'", [], (err, row) => {
            if (err || !row) {
                // resort_config anahtarını da kontrol et
                db.get("SELECT ayar_value FROM uygulama_ayarlari WHERE ayar_key = 'resort_config'", [], (err2, row2) => {
                    if (err2 || !row2) {
                        resolve({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
                    } else {
                        try {
                            resolve(JSON.parse(row2.ayar_value));
                        } catch (e) {
                            resolve({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
                        }
                    }
                });
            } else {
                try {
                    resolve(JSON.parse(row.ayar_value));
                } catch (e) {
                    resolve({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
                }
            }
        });
    });
}

module.exports = {
    getWeekOfYear,
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB
};
