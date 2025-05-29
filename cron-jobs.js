// cron-jobs.js
const cron = require('node-cron');
const db = require('./db'); // Veritabanı bağlantınız

// --- Kredi Hesaplama Yardımcı Fonksiyonları ---

/**
 * Belirtilen tarihin hafta sonu olup olmadığını ve hafta sonu kredisini döndürür.
 * @param {Date} tarih Kontrol edilecek tarih.
 * @param {Array} tumKurallar Veritabanından çekilmiş tüm kredi kuralları (kredi_kurallari tablosu).
 * @returns {number|null} Hafta sonu ise kredi miktarı, değilse null.
 */
function anlikHaftaSonuKredisi(tarih, tumKurallar) {
    const haftaSonuKurali = tumKurallar.find(k => k.kural_adi === 'Hafta Sonu');
    if (!haftaSonuKurali || typeof haftaSonuKurali.kredi === 'undefined') {
        // console.warn("Hafta Sonu kuralı veya kredi miktarı bulunamadı.");
        return 0; // Veya null, hata durumunu nasıl yönetmek istediğinize bağlı
    }

    const gun = tarih.getDay(); // 0 (Pazar) - 6 (Cumartesi)
    return (gun === 0 || gun === 6) ? haftaSonuKurali.kredi : 0; // Hafta sonu değilse 0 kredi
}

/**
 * Belirtilen tarihin özel bir gün olup olmadığını ve özel gün kredisini döndürür.
 * @param {Date} tarih Kontrol edilecek tarih.
 * @param {Array} tumKurallar Veritabanından çekilmiş tüm kredi kuralları (kredi_kurallari tablosu).
 * @returns {number|null} Özel gün ise kredi miktarı, değilse null.
 */
function anlikOzelGunKredisiAl(tarih, tumKurallar) {
    const ozelGunler = tumKurallar.filter(k => k.kural_adi !== 'Hafta Sonu' && k.tarih);
    for (const gun of ozelGunler) {
        // Veritabanından gelen tarih string'ini (YYYY-MM-DD) Date objesine çevirirken dikkatli olmalıyız.
        // Zaman dilimi sorunlarını önlemek için tarihi UTC olarak veya sadece yıl, ay, gün karşılaştırması yaparak ele alalım.
        const kuralTarihParts = gun.tarih.split('-');
        const kuralYil = parseInt(kuralTarihParts[0]);
        const kuralAy = parseInt(kuralTarihParts[1]) - 1; // JavaScript'te aylar 0'dan başlar
        const kuralGun = parseInt(kuralTarihParts[2]);

        if (kuralYil === tarih.getFullYear() &&
            kuralAy === tarih.getMonth() &&
            kuralGun === tarih.getDate()) {
            return gun.kredi;
        }
    }
    return null; // Özel gün değilse null
}

/**
 * Belirtilen tarih ve saat için zaman aralığına göre krediyi döndürür.
 * Eşleşme yoksa varsayılan 1 kredi verir (bu davranış projenizin gereksinimlerine göre ayarlanabilir).
 * @param {Date} tarih Kontrol edilecek tarih ve saat.
 * @param {Array} zamanAraliklari Veritabanından çekilmiş zaman aralıkları (nobet_kredileri tablosu).
 * @returns {number} Hesaplanan kredi miktarı.
 */
function anlikGetSaatAraligiKredisi(tarih, zamanAraliklari) {
    const saat = tarih.getHours();
    const dakika = tarih.getMinutes();
    const suankiToplamDakika = saat * 60 + dakika;

    for (const aralik of zamanAraliklari) {
      // zamanAraliklari'ndaki baslangic_saat ve bitis_saat 'HH:MM' formatında olmalı
      const [baslangicSaat, baslangicDakika] = aralik.baslangic_saat.split(':').map(Number);
      const [bitisSaat, bitisDakika] = aralik.bitis_saat.split(':').map(Number);
      
      let aralikBaslangicToplamDakika = baslangicSaat * 60 + baslangicDakika;
      let aralikBitisToplamDakika = bitisSaat * 60 + bitisDakika;

      // Gün aşımı durumunu ele al (örn: 22:00 - 02:00)
      if (aralikBitisToplamDakika < aralikBaslangicToplamDakika) { 
        if (suankiToplamDakika >= aralikBaslangicToplamDakika || suankiToplamDakika < aralikBitisToplamDakika) {
          return aralik.kredi_dakika; 
        }
      } else { // Normal aralık (örn: 09:00 - 17:00)
        if (suankiToplamDakika >= aralikBaslangicToplamDakika && suankiToplamDakika < aralikBitisToplamDakika) { 
          return aralik.kredi_dakika; 
        }
      }
    }
    // console.warn("Saat aralığı için eşleşme bulunamadı, varsayılan 1 kredi uygulanıyor.");
    return 1; // Eşleşme yoksa varsayılan 1 kredi
}
// --- Kredi Hesaplama Yardımcı Fonksiyonları SONU ---

// Her dakika çalışacak kredi güncelleme cron görevi (Mevcut)
cron.schedule('* * * * *', async () => {
  console.log(`[${new Date().toLocaleString()}] Aktif nöbetçi kredisi güncelleme görevi çalışıyor...`);
  try {
    const tumKrediKurallari = await new Promise((resolve, reject) => {
        db.all("SELECT kural_adi, kredi, tarih FROM kredi_kurallari", [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
    const tumZamanAraliklari = await new Promise((resolve, reject) => {
        db.all("SELECT kredi_dakika, baslangic_saat, bitis_saat FROM nobet_kredileri", [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    db.get("SELECT id, name, kredi FROM Nobetciler WHERE is_aktif = 1", [], async (err, aktifNobetci) => {
      if (err) {
        console.error("Cron job (kredi): Aktif nöbetçi bulunurken hata:", err.message);
        return;
      }
      if (aktifNobetci) {
        const simdi = new Date();
        let eklenecekKredi = 0;
        
        const ozelKredi = anlikOzelGunKredisiAl(simdi, tumKrediKurallari);
        if (ozelKredi !== null) {
          eklenecekKredi = ozelKredi;
        } else {
          const haftaSonuKredisi = anlikHaftaSonuKredisi(simdi, tumKrediKurallari);
          if (haftaSonuKredisi !== 0 && haftaSonuKredisi !== null) { // Hafta sonu kredisi 0 değilse ve null değilse
            eklenecekKredi = haftaSonuKredisi;
          } else { // Hafta içi veya hafta sonu kredisi 0 ise saat aralığına bak
            eklenecekKredi = anlikGetSaatAraligiKredisi(simdi, tumZamanAraliklari);
          }
        }

        const yeniKredi = aktifNobetci.kredi + eklenecekKredi;
        db.run("UPDATE Nobetciler SET kredi = ? WHERE id = ?", [yeniKredi, aktifNobetci.id], function(updateErr) {
          if (updateErr) {
            console.error(`Cron job (kredi): Nöbetçi ${aktifNobetci.name} kredisi güncellenirken hata:`, updateErr.message);
          } else if (this.changes > 0) {
            console.log(`Cron job (kredi): Nöbetçi ${aktifNobetci.name} kredisi ${aktifNobetci.kredi} -> ${yeniKredi}'ye güncellendi. (+${eklenecekKredi})`);
          }
        });
      } else {
        console.log("Cron job (kredi): Güncellenecek aktif nöbetçi bulunamadı.");
      }
    });
  } catch (genelHata) {
    console.error("Cron job (kredi): Genel bir hata oluştu:", genelHata.message);
  }
});

/**
 * Belirli bir tarihin yılın kaçıncı haftası olduğunu döndürür (ISO 8601'e yakın).
 * Pazartesi haftanın ilk günü kabul edilir.
 * @param {Date} date - Tarih objesi
 * @returns {number} Yılın haftası
 */
function getWeekOfYearForCron(date) {
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

// YENİ CRON GÖREVİ: Her Pazartesi sabah 07:00'de aktif nöbetçiyi güncelle
// cron formatı: dakika saat gün-ay ay gün-hafta
// '0 7 * * 1' -> Her Pazartesi sabah 07:00'de
// Test için: '25 14 * * *' (örneğin saat 14:25'te)
cron.schedule('0 7 * * 1', async () => { // Orijinal zamanlamaya geri döndürdüm, test için değiştirebilirsiniz.
    const simdi = new Date();
    console.log(`[${simdi.toLocaleString()}] Otomatik aktif nöbetçi değiştirme görevi çalışıyor...`);

    try {
        const nobetciler = await new Promise((resolve, reject) => {
            db.all("SELECT id, name FROM Nobetciler ORDER BY id ASC", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (!nobetciler || nobetciler.length === 0) {
            console.log("Otomatik nöbetçi değişimi: Aktif edilecek nöbetçi bulunamadı.");
            return;
        }

        const currentYear = simdi.getFullYear();
        const currentWeekNumber = getWeekOfYearForCron(simdi);
        
        // Varsayılan (yıl başı) sıralama mantığı
        const yearStartDateForWeekCalc = new Date(currentYear, 0, 1);
        const weeksSinceYearStart = currentWeekNumber - getWeekOfYearForCron(yearStartDateForWeekCalc) + 1;
        const nobetciSiraIndex = (weeksSinceYearStart - 1 + nobetciler.length) % nobetciler.length;
        
        const yeniAktifNobetci = nobetciler[nobetciSiraIndex];

        if (yeniAktifNobetci) {
            console.log(`Bu haftanın (${currentYear} - ${currentWeekNumber}. Hafta) nöbetçisi: ${yeniAktifNobetci.name} (ID: ${yeniAktifNobetci.id})`);

            db.serialize(() => {
                db.run("UPDATE Nobetciler SET is_aktif = 0", function(err) {
                    if (err) {
                        console.error("Otomatik nöbetçi değişimi: Tüm nöbetçiler pasif yapılırken hata:", err.message);
                        return;
                    }
                    db.run("UPDATE Nobetciler SET is_aktif = 1 WHERE id = ?", [yeniAktifNobetci.id], function(errUpdate) {
                        if (errUpdate) {
                            console.error(`Otomatik nöbetçi değişimi: Nöbetçi ID ${yeniAktifNobetci.id} aktif yapılırken hata:`, errUpdate.message);
                        } else if (this.changes > 0) {
                            console.log(`Otomatik nöbetçi değişimi: Nöbetçi ${yeniAktifNobetci.name} (ID: ${yeniAktifNobetci.id}) aktif olarak ayarlandı.`);
                        } else {
                            console.log(`Otomatik nöbetçi değişimi: Nöbetçi ID ${yeniAktifNobetci.id} için aktif ayarı yapılamadı (değişiklik yok veya bulunamadı).`);
                        }
                    });
                });
            });
        } else {
            console.log("Otomatik nöbetçi değişimi: Bu hafta için atanacak nöbetçi belirlenemedi.");
        }
    } catch (error) {
        console.error("Otomatik aktif nöbetçi değiştirme görevinde genel hata:", error.message);
    }
});

console.log('Cron job (nöbetçi kredi güncelleme) tanımlandı ve çalışmaya hazır.');
console.log('Cron job (Pazartesi 07:00 aktif nöbetçi değişimi) tanımlandı ve çalışmaya hazır.');
