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

        // Haftanın başı ve sonu
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Pazartesi
        weekStart.setHours(0,0,0,0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Pazar
        weekEnd.setHours(23,59,59,999);

        // Haftanın tüm izinlerini çek
        const izinler = await db.getIzinlerForDateRange(weekStart.toISOString(), weekEnd.toISOString());

        const nobetSiralamaAyarlari = await getNobetSiralamaAyarlari();
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            return null;
        }

        let nobetciIndex;
        const shouldUseResortConfig = nobetSiralamaAyarlari.aktif &&
            ((yil > nobetSiralamaAyarlari.baslangicYili) ||
             (yil === nobetSiralamaAyarlari.baslangicYili && hafta > nobetSiralamaAyarlari.baslangicHaftasi));
        
        // Debug log
        if (nobetSiralamaAyarlari.aktif) {
            console.log(`[DEBUG] Hafta kontrolü: Yıl=${yil}, Hafta=${hafta}, BaşlangıçYılı=${nobetSiralamaAyarlari.baslangicYili}, BaşlangıçHaftası=${nobetSiralamaAyarlari.baslangicHaftasi}, ResortKullanılıyor=${shouldUseResortConfig}`);
        }
        
        if (shouldUseResortConfig) {
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

        // Haftanın asıl nöbetçisi
        const asilNobetci = nobetciler[nobetciIndex];
        if (!asilNobetci) return null;

        // Haftanın günlerinde kaç gün izinli?
        let izinliGunler = 0;
        for (let i = 0; i < 7; i++) {
            const gun = new Date(weekStart);
            gun.setDate(weekStart.getDate() + i);
            gun.setHours(12,0,0,0); // Günü ortalamak için
            const gunIzin = izinler.find(iz =>
                iz.nobetci_id === asilNobetci.id &&
                new Date(iz.baslangic_tarihi) <= gun &&
                new Date(iz.bitis_tarihi) >= gun
            );
            if (gunIzin) izinliGunler++;
        }

        // Eğer 3 gün veya daha fazla izinliyse, haftalık nöbetçi yedek olmalı (değiştirmek istersen burayı kullanabilirsin)
        // Ama planı bozmamak için, fonksiyon her zaman asil nöbetçiyi döndürmeli
        // Sadece izinli olduğu günlerde yedek atanacak (günlük fonksiyonlarda)
        return asilNobetci;
    } catch (error) {
        return null;
    }
}

/**
 * Verilen bir tarih ve saat için aktif vardiyayı ve görevli nöbetçiyi (izin/yedek dahil) döndürür.
 * Gündüz nöbetçisi: Sonraki haftanın haftalık nöbetçisi
 * Gece nöbetçisi: O haftanın haftalık nöbetçisi
 * İzinli ise ilgili yedek atanır
 * @param {Date} date - Görevli nöbetçinin belirleneceği tarih ve saat.
 * @returns {Promise<{nobetci: Object|null, vardiya: Object|null}>} Görevli nöbetçi ve vardiya nesnesi.
 */
async function getGorevliNobetci(date) {
    // 1. Vardiya saat aralıklarını çek
    const vardiyalar = await db.getShiftTimeRanges();
    if (!vardiyalar || vardiyalar.length === 0) return { nobetci: null, vardiya: null };

    // 2. Şu anki saat hangi vardiyaya denk geliyor?
    const pad = n => n < 10 ? '0' + n : n;
    const saatStr = pad(date.getHours()) + ':' + pad(date.getMinutes());
    let aktifVardiya = null;
    for (const v of vardiyalar) {
        // Gece vardiyası gibi gün aşımı olan aralıklar için özel kontrol
        if (v.baslangic_saat < v.bitis_saat) {
            // Aynı gün içinde biten vardiya
            if (saatStr >= v.baslangic_saat && saatStr <= v.bitis_saat) {
                aktifVardiya = v;
                break;
            }
        } else {
            // Gece vardiyası gibi, gün aşımı var
            if (saatStr >= v.baslangic_saat || saatStr <= v.bitis_saat) {
                aktifVardiya = v;
                break;
            }
        }
    }
    if (!aktifVardiya) return { nobetci: null, vardiya: null };

    // 3. Haftanın haftalık nöbetçisini bul (gece nöbetçisi)
    const asilNobetci = await getAsilHaftalikNobetci(date);
    // 4. Sonraki haftanın haftalık nöbetçisini bul (gündüz nöbetçisi)
    const nextWeekDate = new Date(date);
    nextWeekDate.setDate(date.getDate() + 7);
    const sonrakiHaftaNobetci = await getAsilHaftalikNobetci(nextWeekDate);

    // 5. O anda izinli mi? (ve yedekler)
    const izinler = await db.getIzinliNobetciVeYedekleri(date);
    let gorevliNobetci = null;
    let izinKaydi = null;
    let yedekId = null;
    const vardiyaAdi = aktifVardiya.vardiya_adi ? aktifVardiya.vardiya_adi.toLowerCase() : '';
    if (vardiyaAdi.includes('gündüz')) {
        // Gündüz nöbetçisi: sonraki haftanın haftalık nöbetçisi
        gorevliNobetci = sonrakiHaftaNobetci;
        izinKaydi = gorevliNobetci ? izinler.find(iz => iz.nobetci_id === gorevliNobetci.id) : null;
        if (izinKaydi) {
            yedekId = izinKaydi.gunduz_yedek_id;
        }
    } else if (vardiyaAdi.includes('gece')) {
        // Gece nöbetçisi: bu haftanın haftalık nöbetçisi
        gorevliNobetci = asilNobetci;
        izinKaydi = gorevliNobetci ? izinler.find(iz => iz.nobetci_id === gorevliNobetci.id) : null;
        if (izinKaydi) {
            yedekId = izinKaydi.gece_yedek_id;
        }
    } else {
        // Vardiya adı net değilse, saat aralığına göre karar ver
        // Gece vardiyası: 17:00 ve sonrası veya 09:00'dan önce
        if (aktifVardiya.baslangic_saat >= '17:00' || aktifVardiya.baslangic_saat < '09:00') {
            gorevliNobetci = asilNobetci;
            izinKaydi = gorevliNobetci ? izinler.find(iz => iz.nobetci_id === gorevliNobetci.id) : null;
            if (izinKaydi) {
                yedekId = izinKaydi.gece_yedek_id;
            }
        } else {
            // Gündüz vardiyası
            gorevliNobetci = sonrakiHaftaNobetci;
            izinKaydi = gorevliNobetci ? izinler.find(iz => iz.nobetci_id === gorevliNobetci.id) : null;
            if (izinKaydi) {
                yedekId = izinKaydi.gunduz_yedek_id;
            }
        }
    }
    if (izinKaydi && yedekId) {
        const yedek = await db.getNobetciById(yedekId);
        if (yedek) return { nobetci: yedek, vardiya: aktifVardiya };
    }
    if (gorevliNobetci) return { nobetci: gorevliNobetci, vardiya: aktifVardiya };
    return { nobetci: null, vardiya: aktifVardiya };
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
    getAllNobetcilerFromDB,
    getGorevliNobetci
};
