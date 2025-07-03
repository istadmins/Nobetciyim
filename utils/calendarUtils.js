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
        
        console.log(`[DEBUG] getAsilHaftalikNobetci çağrıldı: ${date.toISOString()}, Yıl: ${yil}, Hafta: ${hafta}`);

        // ÖNCELİK 1: Manuel atama (override) var mı diye kontrol et.
        if (typeof db.getDutyOverride === 'function') {
            const override = await db.getDutyOverride(yil, hafta);
            if (override && override.nobetci_id_override) {
                console.log(`[DEBUG] Manuel atama bulundu: ID ${override.nobetci_id_override}`);
                const nobetci = await db.getNobetciById(override.nobetci_id_override);
                console.log(`[DEBUG] Manuel atanan nöbetçi:`, nobetci);
                return nobetci;
            }
        }

        // ÖNCELİK 2: Nöbet sıralama ayarlarını kontrol et
        const nobetSiralamaAyarlari = await getNobetSiralamaAyarlari();
        console.log(`[DEBUG] Nöbet sıralama ayarları:`, nobetSiralamaAyarlari);

        const nobetciler = await getAllNobetcilerFromDB();
        console.log(`[DEBUG] Toplam nöbetçi sayısı: ${nobetciler.length}`);
        
        if (!nobetciler || nobetciler.length === 0) {
            console.error("[Asil Nobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null;
        }

        let nobetciIndex;

        // Nöbet sıralama ayarları aktif mi ve bu hafta için geçerli mi?
        if (nobetSiralamaAyarlari.aktif &&
            (yil > nobetSiralamaAyarlari.baslangicYili ||
             (yil === nobetSiralamaAyarlari.baslangicYili && hafta >= nobetSiralamaAyarlari.baslangicHaftasi))) {
            
            console.log(`[DEBUG] Nöbet sıralama ayarları kullanılıyor`);
            
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
            console.log(`[DEBUG] Sıralama hesaplaması: Haftalar farkı=${haftalarFarki}, Index=${nobetciIndex}`);
        } else {
            // ÖNCELİK 3: Basit ve güvenilir rotasyon: (hafta numarası - 1) % nöbetçi sayısı
            const yearStartDateForWeekCalc = new Date(yil, 0, 1);
            const weeksSinceYearStart = hafta - getWeekOfYear(yearStartDateForWeekCalc) + 1;
            nobetciIndex = (weeksSinceYearStart - 1 + nobetciler.length) % nobetciler.length;
            console.log(`[DEBUG] Basit rotasyon: Yıl başından haftalar=${weeksSinceYearStart}, Index=${nobetciIndex}`);
        }

        const asilNobetci = nobetciler[nobetciIndex];
        console.log(`[DEBUG] Seçilen nöbetçi: Index ${nobetciIndex}, Nöbetçi: ${asilNobetci?.name}`);

        if (!asilNobetci) {
            console.error(`[Asil Nobetci] Nöbetçi hesaplama hatası: Index ${nobetciIndex} için nöbetçi bulunamadı.`);
            return null;
        }

        console.log(`[Asil Nobetci] Nöbetçi belirlendi: Yıl ${yil}, Hafta ${hafta} -> ${asilNobetci.name}`);
        return asilNobetci;

    } catch (error) {
        console.error("[Asil Nobetci] Asıl haftalık nöbetçi belirlenirken kritik hata oluştu:", error);
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
