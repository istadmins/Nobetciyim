
const db = require('../db');

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

async function getAsilHaftalikNobetci(date) {
    try {
        const yil = date.getFullYear();
        const hafta = getWeekOfYear(date);

  
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
