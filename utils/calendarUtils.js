const db = require('../db');

// --- ÖNEMLİ YAPILANDIRMA BÖLÜMÜ ---
// Bu bölümü kendi nöbet başlangıç verilerinize göre düzenlemeniz GEREKİR.

/**
 * Nöbet rotasyonunun başladığı referans tarih.
 * Bu tarihin bir Pazartesi olması tavsiye edilir.
 * Örnek: '2024-01-01T00:00:00.000Z' (1 Ocak 2024)
 */
const ROTATION_START_DATE = new Date('2024-01-01T00:00:00.000Z');

/**
 * Referans tarihinde nöbetçi olan kişinin, veritabanından gelen sıralı listedeki indeksi.
 * Listeler 0'dan başladığı için ilk kişi için 0, ikinci kişi için 1 vb. kullanılır.
 * Örnek: Eğer 1 Ocak 2024'te listenin ilk kişisi nöbetçi ise bu değer 0 olmalıdır.
 */
const ROTATION_START_INDEX = 0;
// -----------------------------------------

/**
 * Veritabanından tüm aktif nöbetçileri ID'ye göre sıralı bir şekilde alır.
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
 * İki tarih arasındaki tam hafta sayısını hesaplar.
 * @param {Date} startDate - Başlangıç tarihi.
 * @param {Date} endDate - Bitiş tarihi.
 * @returns {number} İki tarih arasındaki hafta farkı.
 */
function getWeekDifference(startDate, endDate) {
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    // İki tarih arasındaki milisaniye farkını alıp bir haftadaki milisaniye sayısına bölüyoruz.
    // Math.floor ile tam hafta sayısını garantiliyoruz.
    return Math.floor((endDate - startDate) / MS_PER_WEEK);
}

/**
 * Belirtilen bir tarih için asıl nöbetçiyi belirler.
 * Önce manuel atama (override) var mı diye kontrol eder, yoksa otomatik rotasyonu hesaplar.
 * @param {Date} date - Nöbetçinin belirleneceği tarih.
 * @returns {Promise<Object|null>} Nöbetçi nesnesi veya bulunamazsa null.
 */
async function getAsilHaftalikNobetci(date) {
    try {
        // 1. Manuel atama kontrolü (Bu özelliğin çalışması için db.js'de getDutyOverride fonksiyonu olmalı)
        if (typeof db.getDutyOverride === 'function') {
            const year = date.getFullYear();
            const week = getWeekOfYear(date); // Manuel atama için hafta numarası gerekebilir
            const override = await db.getDutyOverride(year, week);
            if (override && override.nobetci_id_override) {
                console.log(`[Asil Nobetci] Manuel atama bulundu: Tarih ${date.toISOString()}`);
                return await db.getNobetciById(override.nobetci_id_override);
            }
        }

        // 2. Manuel atama yoksa, otomatik rotasyonu hesapla
        const nobetciler = await getAllNobetcilerFromDB();
        if (!nobetciler || nobetciler.length === 0) {
            console.error("[Asil Nobetci] Sistemde kayıtlı nöbetçi bulunamadı.");
            return null;
        }

        // YENİ VE SAĞLAM HESAPLAMA MANTIĞI
        const weeksPassed = getWeekDifference(ROTATION_START_DATE, date);
        const totalIndex = ROTATION_START_INDEX + weeksPassed;
        
        // Modulo operatörünün negatif sonuç verme ihtimaline karşı güvenli bir hesaplama
        const nobetciIndex = ((totalIndex % nobetciler.length) + nobetciler.length) % nobetciler.length;
        
        const asilNobetci = nobetciler[nobetciIndex];

        if (!asilNobetci) {
            console.error(`[Asil Nobetci] Hesaplama hatası: Index ${nobetciIndex} için nöbetçi bulunamadı.`);
            return null;
        }

        console.log(`[Asil Nobetci] Otomatik rotasyon: Tarih ${date.toISOString()} -> ${asilNobetci.name}`);
        return asilNobetci;

    } catch (error) {
        console.error("[Asil Nobetci] Asıl haftalık nöbetçi belirlenirken hata oluştu:", error);
        return null;
    }
}

/**
 * ISO 8601 standardına göre bir tarihin yıl içindeki hafta numarasını döndürür.
 * Not: Bu fonksiyon artık ana nöbetçi hesaplamasında kullanılmıyor, ancak
 * manuel atama gibi başka özellikler için saklanmıştır.
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

module.exports = {
    getAsilHaftalikNobetci,
    getAllNobetcilerFromDB
};
