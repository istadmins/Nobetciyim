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
 * ÖNCELİK 2: Manuel atama yoksa, basit ve güvenilir bir otomatik rotasyon uygular.
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
                console.log(`[Asil Nobetci] Manuel atama bulundu: Yıl ${yil}, Hafta ${hafta}. Nöbetçi ID: ${override.nobetci_id_override}`);
                return await db.getNobetciById(override.nobetci_id_override);
            }
        }

        // ÖNCELİK 2: Manuel atama yoksa, otomatik rotasyonu hesapla.
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            console.error("[Asil Nobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null;
        }

        // Basit ve güvenilir rotasyon: (hafta numarası - 1) % nöbetçi sayısı
        const nobetciIndex = (hafta - 1) % nobetciler.length;
        const asilNobetci = nobetciler[nobetciIndex];
        
        if (!asilNobetci) {
            console.error(`[Asil Nobetci] Otomatik rotasyon hesaplama hatası: Index ${nobetciIndex} için nöbetçi bulunamadı.`);
            return null;
        }

        console.log(`[Asil Nobetci] Otomatik rotasyon hesaplandı: Yıl ${yil}, Hafta ${hafta} -> ${asilNobetci.name}`);
        return asilNobetci;

    } catch (error) {
        console.error("[Asil Nobetci] Asıl haftalık nöbetçi belirlenirken kritik hata oluştu:", error);
        return null;
    }
}

module.exports = {
    getWeekOfYear,
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB
};
