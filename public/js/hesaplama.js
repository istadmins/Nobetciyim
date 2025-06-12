// public/js/hesaplama.js

/**
 * 1. "Kazanılan Kredi"leri sıfırlar/günceller.
 * 2. Yıl sonuna kadar toplam potansiyel krediyi hesaplar.
 * 3. Bu potansiyel krediyi nöbetçilere "Pay Edilen Kredi" olarak dağıtır.
 * 4. Bu "Pay Edilen Kredi"leri veritabanına kaydeder.
 * 5. Tabloyu güncel "Kazanılan Kredi", DB'den gelen "Pay Edilen Kredi" ve hesaplanan "Kalan Kredi" ile yeniler.
 */
async function hesaplaToplamKrediVeDagit() { // Fonksiyon adı daha açıklayıcı olabilir
  // Adım 1: Kazanılan kredileri sıfırla ve DB'yi güncelle
  if (typeof sifirlaVeKazanilanKredileriGuncelle === 'function') {
    const sifirlamaBasarili = await sifirlaVeKazanilanKredileriGuncelle();
    if (!sifirlamaBasarili) {
        alert("Kazanılan krediler güncellenemediği için pay dağıtımı yapılamıyor.");
        return;
    }
    // sifirlaVeKazanilanKredileriGuncelle zaten getNobetciler'i çağırarak UI'ı güncelledi.
  } else {
    console.error("sifirlaVeKazanilanKredileriGuncelle fonksiyonu bulunamadı!");
    alert("Kritik bir hata oluştu, kredi sıfırlama fonksiyonu eksik.");
    return;
  }

  // Adım 2: Yıl sonuna kadar toplam potansiyel dağıtılacak krediyi hesapla
  const simdi = new Date();
  const yilSonu = new Date(simdi.getFullYear(), 11, 31, 23, 59, 59); 
  let kalanDakika = 0;
  if (yilSonu > simdi) {
      kalanDakika = Math.floor((yilSonu - simdi) / (1000 * 60));
  }

  const haftaSonuKrediInput = document.getElementById('haftaSonuKrediInput');
  const hafta_sonu_kredi_degeri = haftaSonuKrediInput && haftaSonuKrediInput.value !== "" ? parseInt(haftaSonuKrediInput.value) : 0;

  const ozelGunler = [];
  const kuralSatirlari = document.querySelectorAll('#kurallarTablosu tbody tr:not([data-sabit="true"])');
  kuralSatirlari.forEach(satir => {
    if (satir.cells.length >= 3) { 
        const krediText = satir.cells[0].textContent;
        const aciklamaText = satir.cells[1].textContent; 
        const tarihText = satir.cells[2].textContent; 
        const kredi = parseInt(krediText);
        if (!isNaN(kredi) && tarihText && aciklamaText) { 
          const tarihParcalariClient = tarihText.split('.'); 
          if (tarihParcalariClient.length === 3) {
              const ozelGunTarihi = new Date(parseInt(tarihParcalariClient[2]), parseInt(tarihParcalariClient[1]) - 1, parseInt(tarihParcalariClient[0]));
              if (!isNaN(ozelGunTarihi.valueOf())) { 
                ozelGunler.push({ tarih: ozelGunTarihi, kredi_dakika: kredi, aciklama: aciklamaText }); 
              }
          }
        }
    }
  });

  const zamanAraliklari = [];
  const zamanSatirlari = document.querySelectorAll('#zaman-kredi-tablosu tbody tr');
  zamanSatirlari.forEach(satir => {
    if (satir.cells.length > 1 && !satir.querySelector('td[colspan="3"]')) {
        const krediInput = satir.querySelector('.kredi-dakika-input');
        const baslangicInput = satir.querySelector('.baslangic-saat');
        const bitisInput = satir.querySelector('.bitis-saat');
        if (krediInput && baslangicInput && bitisInput && krediInput.value !== "" && baslangicInput.value !== "" && bitisInput.value !== "") {
          const kredi = parseInt(krediInput.value);
          const baslangic = baslangicInput.value; 
          const bitis = bitisInput.value;     
          if (!isNaN(kredi) && kredi >= 0) {
            zamanAraliklari.push({ kredi_dakika: kredi, baslangic, bitis });
          }
        }
    }
  });

  function haftaSonuMu(tarih) {
    const gun = tarih.getDay(); 
    return gun === 0 || gun === 6; 
  }

  function ozelGunKredisiAl(tarih) { 
    for (const gun of ozelGunler) {
      if (gun.tarih.getFullYear() === tarih.getFullYear() &&
          gun.tarih.getMonth() === tarih.getMonth() &&
          gun.tarih.getDate() === tarih.getDate()) {
        return gun.kredi_dakika; 
      }
    }
    return null; 
  }

  function getSaatAraligiKredisi(tarih, araliklar) {
    const saat = tarih.getHours();
    const dakika = tarih.getMinutes();
    const suankiToplamDakika = saat * 60 + dakika;
    for (const aralik of araliklar) {
      const [baslangicSaat, baslangicDakika] = aralik.baslangic.split(':').map(Number);
      const [bitisSaat, bitisDakika] = aralik.bitis.split(':').map(Number);
      let aralikBaslangicToplamDakika = baslangicSaat * 60 + baslangicDakika;
      let aralikBitisToplamDakika = bitisSaat * 60 + bitisDakika;
      if (aralikBitisToplamDakika < aralikBaslangicToplamDakika) { 
        if (suankiToplamDakika >= aralikBaslangicToplamDakika || suankiToplamDakika < aralikBitisToplamDakika) {
          return aralik.kredi_dakika; 
        }
      } else { 
        if (suankiToplamDakika >= aralikBaslangicToplamDakika && suankiToplamDakika < aralikBitisToplamDakika) { 
          return aralik.kredi_dakika; 
        }
      }
    }
    return 1; 
  }

  let toplamDagitilacakKrediBuYil = 0; 
  let mevcutTarih = new Date(simdi); 
  if (kalanDakika > 0) {
      for (let i = 0; i < kalanDakika; i++) {
        const ozelKredi = ozelGunKredisiAl(mevcutTarih);
        if (ozelKredi !== null) {
          toplamDagitilacakKrediBuYil += ozelKredi;
        } 
        else if (haftaSonuMu(mevcutTarih)) {
          toplamDagitilacakKrediBuYil += hafta_sonu_kredi_degeri;
        } 
        else { 
          toplamDagitilacakKrediBuYil += getSaatAraligiKredisi(mevcutTarih, zamanAraliklari);
        }
        mevcutTarih.setMinutes(mevcutTarih.getMinutes() + 1); 
      }
  }
  console.log(`Yıl sonuna kadar toplam dağıtılacak kredi (Başlat sonrası): ${toplamDagitilacakKrediBuYil}`);

  // Adım 3: Bu toplam potansiyel krediyi nöbetçilere "Pay Edilen Kredi" olarak dağıt ve DB'ye kaydet
  await dagitVePayEdilenKredileriKaydet(toplamDagitilacakKrediBuYil);
}


/**
 * Belirtilen toplam krediyi nöbetçilere dağıtır, UI'da gösterir ve DB'ye kaydeder.
 * "Kalan Kredi" sütununu da günceller.
 * @param {number} toplamDagitilacakKredi - Dağıtılacak toplam kredi miktarı.
 */
async function dagitVePayEdilenKredileriKaydet(toplamDagitilacakKredi) {
    const nobetciSatirlari = document.querySelectorAll('#nobetciTable tbody tr');
    let gecerliNobetciler = [];
    nobetciSatirlari.forEach(satir => {
        if (!satir.querySelector('td[colspan="7"]')) {
            gecerliNobetciler.push(satir);
        }
    });

    const nobetciSayisi = gecerliNobetciler.length;

    if (nobetciSayisi === 0) {
        console.log("Dağıtılacak nöbetçi bulunamadı.");
        return;
    }

    const temelPay = Math.floor(toplamDagitilacakKredi / nobetciSayisi);
    let kalanArtiKredi = toplamDagitilacakKredi % nobetciSayisi; 

    let payEdilenKrediListesi = [];

    gecerliNobetciler.forEach(satir => {
        const id = parseInt(satir.dataset.id);
        let buNobetcininPayi = temelPay;
        // Kalan krediyi sondan başlayarak dağıtma mantığı burada UI'a yansıtılırken
        // DB'ye gönderilecek listeye de eklenmeli.
        // Daha basit olması için, kalan krediyi ilk 'kalanArtiKredi' kadar nöbetçiye +1 olarak ekleyelim.
        // Ya da sondan dağıtma mantığını koruyalım:
        // Bu döngüden sonra kalanArtiKredi'yi dağıtacağız.

        const payEdilenKrediHucresi = satir.querySelector('.pay-edilen-kredi');
        if (payEdilenKrediHucresi) {
            payEdilenKrediHucresi.textContent = buNobetcininPayi; // Önce temel pay
        }
        payEdilenKrediListesi.push({ id: id, pay_edilen_kredi: buNobetcininPayi });
    });
    
    // Kalan krediyi sondan başlayarak dağıt ve listeyi güncelle
    for (let i = 0; i < kalanArtiKredi; i++) {
        const mevcutSatirIndex = nobetciSayisi - 1 - i; // Sondan başlayarak index
        if (mevcutSatirIndex >= 0) { 
            const satir = gecerliNobetciler[mevcutSatirIndex]; // Geçerli nöbetçiler listesinden al
            const payEdilenKrediHucresi = satir.querySelector('.pay-edilen-kredi');
            const nobetciId = parseInt(satir.dataset.id);

            if (payEdilenKrediHucresi) {
                const guncelPay = parseInt(payEdilenKrediHucresi.textContent) + 1;
                payEdilenKrediHucresi.textContent = guncelPay;
                
                // payEdilenKrediListesi'ndeki ilgili nöbetçinin payını güncelle
                const listeIndex = payEdilenKrediListesi.findIndex(n => n.id === nobetciId);
                if (listeIndex !== -1) {
                    payEdilenKrediListesi[listeIndex].pay_edilen_kredi = guncelPay;
                }
            }
        }
    }

    // Adım 4: Yeni "Pay Edilen Kredi" değerlerini veritabanına kaydet
    try {
        const response = await fetch('/api/nobetci/pay-edilen-kredileri-guncelle', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(payEdilenKrediListesi)
        });
        const data = await response.json();
        if (!response.ok) {
            console.error("Pay edilen krediler güncellenirken sunucu hatası:", data.error || response.status);
            alert("Pay edilen krediler veritabanına kaydedilirken bir hata oluştu.");
        } else {
            console.log(data.message || "Pay edilen krediler başarıyla veritabanına kaydedildi.");
        }
    } catch (error) {
        console.error("Pay edilen krediler güncellenirken hata:", error);
        alert("Pay edilen krediler veritabanına kaydedilirken bir hata oluştu.");
    }

    // Adım 5: Tabloyu en son verilerle (DB'den gelen pay_edilen_kredi dahil) yenile
    // Bu, Kalan Kredi'nin de doğru hesaplanmasını sağlar.
    if(typeof getNobetciler === 'function') {
        await getNobetciler();
    }
}

// krediyiNobetcilereDagit fonksiyonu artık dagitVePayEdilenKredileriKaydet oldu.
// Eski krediyiNobetcilereDagit fonksiyonu (sadece UI güncelleyen) kaldırıldı.
