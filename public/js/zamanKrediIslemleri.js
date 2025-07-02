// public/js/zamanKrediIslemleri.js

/**
 * Zaman bazlı kredi tablosundaki kontrolleri (Ekle butonu, Sil butonları) günceller.
 */
function updateTimeRowControls() {
    const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
    if (!tbody) return;

    const dataRows = Array.from(tbody.getElementsByTagName('tr')).filter(row => !row.querySelector('td[colspan="3"]'));
    const addBtn = document.getElementById('yeniSatirEkleBtn');

    if (addBtn) {
        addBtn.disabled = (dataRows.length >= 2);
    }

    dataRows.forEach((row, index) => {
        const deleteBtn = row.querySelector('button.btn-danger');
        if (deleteBtn) {
            if (dataRows.length === 1) {
                // Sadece bir vardiya varsa, silme butonu olmamalı (pasif ve gizli)
                deleteBtn.disabled = true;
                deleteBtn.style.display = 'none';
            } else if (dataRows.length === 2) {
                // İki vardiya varsa, sadece ikinci satırın silme butonu aktif ve görünür olmalı
                // İlk satırınki pasif ve gizli olmalı.
                if (index === 0) { // Bu ilk satır
                    deleteBtn.disabled = true;
                    deleteBtn.style.display = 'none';
                } else { // Bu ikinci satır
                    deleteBtn.disabled = false;
                    deleteBtn.style.display = '';
                }
            } else { // 0 satır varsa (bu durum "veri yok" mesajıyla ele alınır)
                deleteBtn.disabled = true;
                deleteBtn.style.display = 'none';
            }
        }
    });
}

/**
 * Zaman bazlı kredi tablosuna yeni bir satır ekler.
 */
function addNewTimeRow() {
    const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
    if (!tbody) return;
    const currentDataRows = Array.from(tbody.getElementsByTagName('tr')).filter(row => !row.querySelector('td[colspan="3"]'));

    if (currentDataRows.length >= 2) {
        // Buton zaten pasif olmalı, bu bir ek güvenlik.
        return;
    }

    let prevEnd = "00:00";
    let defaultStartTime = "00:00";
    let defaultEndTime = "23:59"; // Veya "00:00" eğer sisteminiz 24 saatlik periyodu bu şekilde yorumluyorsa

    if (currentDataRows.length === 0) { // İlk satır ekleniyor
        // Varsayılan olarak tüm günü kapsasın
        defaultStartTime = "00:00";
        defaultEndTime = "23:59";
    } else if (currentDataRows.length === 1) { // İkinci satır ekleniyor
        const lastRow = currentDataRows[0];
        const lastEndInput = lastRow.querySelector('.bitis-saat');
        if (lastEndInput && lastEndInput.value) {
            defaultStartTime = lastEndInput.value; // İkincinin başlangıcı, birincinin bitişi olsun
            // İkinci satır için varsayılan bitiş saati, mantıksal bir sonraki adım olabilir, örn: 23:59
            // Ya da kullanıcıya bırakılabilir. Şimdilik 23:59 yapalım.
            // Eğer ilk satır 00:00-17:00 ise, ikinci 17:00-23:59 olabilir.
            // Kullanıcı bunu düzenleyecektir.
            const [h, m] = defaultStartTime.split(':').map(Number);
            if (h === 23 && m === 59) { // Eğer ilk satır zaten tüm günü kapsıyorsa, ikinciye mantıklı bir aralık ver
                 defaultStartTime = "00:00"; // Bu durum aslında addButon disable olacağı için oluşmamalı
            }
        }
    }

    const noDataRow = tbody.querySelector('tr td[colspan="3"]');
    if (noDataRow) {
        noDataRow.parentNode.remove();
    }

    const newRow = tbody.insertRow(-1);
    const vardiyaAdlari = ['Birinci', 'İkinci', 'Üçüncü'];
    const currentIndex = currentDataRows.length;
    newRow.innerHTML = `
    <td class="vardiya-adi">${vardiyaAdlari[currentIndex] || ''}</td>
    <td><input type="number" class="kredi-dakika-input form-control" min="0" value="1"></td>
    <td>
        <input type="time" class="baslangic-saat form-control" value="${defaultStartTime}">
        -
        <input type="time" class="bitis-saat form-control" value="${defaultEndTime}">
    </td>
    <td><button type="button" class="btn btn-danger btn-sm deleteTimeRowBtn"><i class="fa fa-trash"></i></button></td>
  `;
    newRow.querySelector('.deleteTimeRowBtn').addEventListener('click', function() {
        removeTimeRow(newRow);
    });
    updateTimeRowControls();
}

/**
 * Zaman bazlı kredi tablosundan belirtilen satırı siler.
 * Eğer sildikten sonra tek satır kalırsa, o satırın saatlerini 00:00 - 23:59 yapar.
 */
window.removeTimeRow = function(rowElement) {
    if (confirm('Bu saat aralığını silmek istediğinize emin misiniz?')) {
        rowElement.remove();
        const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
        if (!tbody) return;
        const currentDataRows = Array.from(tbody.getElementsByTagName('tr')).filter(row => !row.querySelector('td[colspan="3"]'));

        if (currentDataRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
        } else if (currentDataRows.length === 1) {
            // Tek satır kaldıysa, saatlerini 00:00 - 23:59 yap
            const remainingRow = currentDataRows[0];
            const baslangicInput = remainingRow.querySelector('.baslangic-saat');
            const bitisInput = remainingRow.querySelector('.bitis-saat');
            if (baslangicInput) baslangicInput.value = "00:00";
            if (bitisInput) bitisInput.value = "23:59";
            console.log("Tek vardiya kaldı, saatler 00:00-23:59 olarak ayarlandı.");
        }
        updateTimeRowControls();
    }
}

/**
 * API'den zaman bazlı kredi aralıklarını alır ve tabloya ekler.
 */
async function zamanKrediTablosunuDoldur() {
  try {
    const response = await fetch('/api/nobet-kredileri', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const tbody = document.querySelector('#zaman-kredi-tablosu tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!response.ok) {
        const errData = await response.json();
        console.error("Zaman kredileri yüklenirken sunucu hatası:", errData.error || response.status);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
        updateTimeRowControls();
        return;
    }
    const veriler = await response.json();

    if (veriler && veriler.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
    } else if (veriler) {
      const vardiyaAdlari = ['Birinci', 'İkinci', 'Üçüncü'];
      veriler.forEach((satir, index) => {
        const tr = tbody.insertRow();
        tr.innerHTML = `
          <td class="vardiya-adi">${vardiyaAdlari[index] || ''}</td>
          <td><input type="number" class="kredi-dakika-input form-control" min="0" value="${satir.kredi_dakika}"></td>
          <td>
            <input type="time" class="baslangic-saat form-control" value="${satir.baslangic_saat}">
            -
            <input type="time" class="bitis-saat form-control" value="${satir.bitis_saat}">
          </td>
          <td>
            <button type="button" class="btn btn-danger btn-sm deleteTimeRowBtn"><i class="fa fa-trash"></i></button>
          </td>
        `;
        tr.querySelector('.deleteTimeRowBtn').addEventListener('click', function() {
            removeTimeRow(tr);
        });
      });
    }
    updateTimeRowControls(); // Tablo dolduktan sonra kontrolleri güncelle
  } catch (err) {
    console.error('Zaman bazlı kredi tablosu doldurulamadı:', err);
    const tbody = document.querySelector('#zaman-kredi-tablosu tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tablo yüklenirken bir hata oluştu.</td></tr>';
    }
    updateTimeRowControls();
  }
}

/**
 * Zaman bazlı kredi tablosundaki değişiklikleri API'ye kaydeder.
 */
async function kredileriKaydet() {
  const satirlar = document.querySelectorAll('#zaman-kredi-tablosu tbody tr');
  const krediBilgileri = [];
  let valid = true;

  for (const satir of satirlar) {
    const krediDakikaInput = satir.querySelector('.kredi-dakika-input');
    const baslangicSaatInput = satir.querySelector('.baslangic-saat');
    const bitisSaatInput = satir.querySelector('.bitis-saat');

    if (satir.getElementsByTagName('td').length === 1 && satir.querySelector('td[colspan="3"]')) {
        continue;
    }

    if(krediDakikaInput && baslangicSaatInput && bitisSaatInput){
        const krediDakika = krediDakikaInput.value;
        const baslangicSaat = baslangicSaatInput.value;
        const bitisSaat = bitisSaatInput.value;

        if (krediDakika === "" || baslangicSaat === "" || bitisSaat === "" || isNaN(parseInt(krediDakika)) || parseInt(krediDakika) < 0) {
            valid = false;
            break;
        }
        krediBilgileri.push({ kredi_dakika: parseInt(krediDakika), baslangic_saat: baslangicSaat, bitis_saat: bitisSaat });
    } else if (!satir.querySelector('td[colspan="3"]')) {
        valid = false;
        break;
    }
  }

  if (!valid) {
      alert("Lütfen tüm zaman bazlı kredi alanlarını doğru şekilde (kredi >= 0, saatler dolu) doldurun.");
      return;
  }

  if (krediBilgileri.length === 0) {
      alert("En az bir zaman aralığı (vardiya) tanımlanmalıdır. Lütfen bir aralık ekleyin.");
      const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
      if (tbody && tbody.children.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
      }
      updateTimeRowControls();
      return;
  }
  
  // Eğer iki vardiya varsa, saatlerin çakışmadığından ve 24 saati mantıklı şekilde kapladığından emin olmak için ek kontrol eklenebilir.
  // Örneğin:
  if (krediBilgileri.length === 2) {
    const v1_start = krediBilgileri[0].baslangic_saat;
    const v1_end = krediBilgileri[0].bitis_saat;
    const v2_start = krediBilgileri[1].baslangic_saat;
    const v2_end = krediBilgileri[1].bitis_saat;

    // Basit bir kontrol: Birinci vardiyanın bitişi, ikinci vardiyanın başlangıcıyla aynı veya çok yakın olmalı.
    // Ve ikinci vardiyanın bitişi, birinci vardiyanın başlangıcıyla aynı veya çok yakın olmalı (geceyi dönüyorsa).
    // Bu kontrol daha detaylı olabilir. Şimdilik sadece kullanıcıya bırakıyoruz.
    // Önemli olan, cron-jobs.js'deki isTimeInInterval'in doğru çalışması.
  }


  try {
    const response = await fetch('/api/nobet-kredileri', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify(krediBilgileri)
    });
    const data = await response.json();
    if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`);
    } else {
        console.log(data.message || 'Zaman bazlı kredi bilgileri kaydedildi!');
        await zamanKrediTablosunuDoldur(); 
        // Vardiya saatleri değiştiği için cron job'ların yeniden ayarlanması gerekebilir.
        // Bu, cron-jobs.js içindeki saatlik kontrol ile otomatik olarak yapılacaktır.
    }
  } catch (error) {
    console.error("Zaman bazlı kredi bilgileri kaydedilirken hata:", error);
    alert('Zaman bazlı kredi bilgileri kaydedilemedi. Lütfen konsolu kontrol edin.');
  }
}
