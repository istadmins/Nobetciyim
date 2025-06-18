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
        // Nöbetçilerin tüm bilgilerini çekiyoruz
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
 * Belirtilen bir tarih için asıl nöbetçiyi (manuel atama veya otomatik rotasyon ile) belirler.
 * Bu fonksiyon, karmaşık ayarlar yerine basit ve güvenilir bir rotasyon kullanır.
 * @param {Date} date - Nöbetçiyi belirlemek için kullanılacak tarih.
 * @returns {Promise<Object|null>} Belirlenen nöbetçinin tüm bilgilerini veya bulunamazsa null döndürür.
 */
async function getAsilHaftalikNobetci(date) {
    try {
        const yil = date.getFullYear();
        const hafta = getWeekOfYear(date);

        // 1. Manuel atama (override) var mı diye kontrol et.
        // db.js içinde getDutyOverride fonksiyonunun olduğundan emin olun.
        if (typeof db.getDutyOverride === 'function') {
            const override = await db.getDutyOverride(yil, hafta);
            if (override && override.nobetci_id_override) {
                console.log(`[Asil Nobetci] Manuel atama bulundu: Yıl ${yil}, Hafta ${hafta}`);
                // Manuel atanan nöbetçinin tüm bilgilerini döndür
                return await db.getNobetciById(override.nobetci_id_override);
            }
        }

        // 2. Manuel atama yoksa, otomatik rotasyonu hesapla.
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            console.error("[Asil Nobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null; // Nöbetçi yoksa null dön.
        }

        // 3. Basit ve güvenilir rotasyon: Hafta numarasını nöbetçi sayısına bölerek sıradaki nöbetçiyi bul.
        // (Hafta numarası 1'den başladığı için -1 yapılır)
        const nobetciIndex = (hafta - 1) % nobetciler.length;
        const asilNobetci = nobetciler[nobetciIndex];
        
        if (!asilNobetci) {
            console.error(`[Asil Nobetci] Hesaplama hatası: Index ${nobetciIndex} için nöbetçi bulunamadı.`);
            return null;
        }

        console.log(`[Asil Nobetci] Otomatik rotasyon: Yıl ${yil}, Hafta ${hafta} -> ${asilNobetci.name}`);
        return asilNobetci;

    } catch (error) {
        console.error("[Asil Nobetci] Asıl haftalık nöbetçi belirlenirken hata oluştu:", error);
        return null;
    }
}

module.exports = {
    getWeekOfYear,
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB
};
