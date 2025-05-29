// public/js/zamanKrediIslemleri.js

// Bu dosya, zaman bazlı kredi aralıklarını (hafta içi saatleri)
// yönetme fonksiyonlarını içerir.

/**
 * Zaman bazlı kredi tablosuna yeni bir satır ekler.
 */
function addNewTimeRow() { 
  const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
  const rows = tbody.getElementsByTagName('tr');
  let prevEnd = "00:00"; 
  if (rows.length > 0 && !rows[0].querySelector('td[colspan="3"]')) { 
    const lastRow = rows[rows.length - 1];
    const lastEndInput = lastRow.querySelector('.bitis-saat');
    if(lastEndInput && lastEndInput.value) { 
        prevEnd = lastEndInput.value;
    }
  }
  if (rows.length === 1 && rows[0].querySelector('td[colspan="3"]')) {
    tbody.innerHTML = '';
  }

  const newRow =tbody.insertRow(-1); 
  newRow.innerHTML = `
    <td><input type="number" class="kredi-dakika-input form-control" min="0" value="1"></td>
    <td>
        <input type="time" class="baslangic-saat form-control" value="${prevEnd}">
        -
        <input type="time" class="bitis-saat form-control" value="23:59">
    </td>
    <td><button type="button" class="btn btn-danger btn-sm" onclick="removeTimeRow(this.parentNode.parentNode)"><i class="fa fa-trash"></i></button></td>
  `;
}

/**
 * Zaman bazlı kredi tablosundan belirtilen satırı siler.
 * @param {HTMLElement} rowElement - Silinecek tablo satırı (TR elementi)
 */
window.removeTimeRow = function(rowElement) { // Global scope
    if (confirm('Bu saat aralığını silmek istediğinize emin misiniz?')) {
        rowElement.remove();
        const tbody = document.getElementById('zaman-kredi-tablosu').getElementsByTagName('tbody')[0];
        if (tbody.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
        }
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
    tbody.innerHTML = ''; 

    if (!response.ok) {
        const errData = await response.json();
        console.error("Zaman kredileri yüklenirken sunucu hatası:", errData.error || response.status);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
        return;
    }
    const veriler = await response.json(); 
    
    if (veriler && veriler.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tanımlı zaman aralığı bulunmamaktadır. Ekleyebilirsiniz.</td></tr>';
    } else if (veriler) {
      veriler.forEach((satir) => { 
        const tr = tbody.insertRow();
        tr.innerHTML = `
          <td><input type="number" class="kredi-dakika-input form-control" min="0" value="${satir.kredi_dakika}"></td>
          <td>
            <input type="time" class="baslangic-saat form-control" value="${satir.baslangic_saat}">
            -
            <input type="time" class="bitis-saat form-control" value="${satir.bitis_saat}">
          </td>
          <td>
            <button type="button" class="btn btn-danger btn-sm" onclick="removeTimeRow(this.parentNode.parentNode)"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
        `;
      });
    }
  } catch (err) {
    console.error('Zaman bazlı kredi tablosu doldurulamadı:', err);
    const tbody = document.querySelector('#zaman-kredi-tablosu tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tablo yüklenirken bir hata oluştu.</td></tr>';
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
        zamanKrediTablosunuDoldur(); 
    }
  } catch (error) {
    console.error("Zaman bazlı kredi bilgileri kaydedilirken hata:", error);
    alert('Zaman bazlı kredi bilgileri kaydedilemedi. Lütfen konsolu kontrol edin.');
  }
}
