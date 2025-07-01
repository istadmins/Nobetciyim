// public/js/kuralIslemleri.js

// Bu dosya, özel gün ve hafta sonu kredi kurallarını yönetme
// fonksiyonlarını içerir.

/**
 * Yeni özel gün kuralı ekleme formunu yönetir.
 * @param {Event} e - Form submit olayı
 */
async function handleOzelGunKuralEkle(e) { 
  e.preventDefault();
  const krediInput = document.getElementById('yeniKuralKredi'); 
  const aciklamaInput = document.getElementById('yeniKuralAciklama'); 
  const tarihInput = document.getElementById('yeniKuralTarih');
  
  const kredi = krediInput.value;
  const kural_adi = aciklamaInput.value.trim(); 
  const tarih = tarihInput.value; 

  if (!kredi || !kural_adi || !tarih) {
      alert("Lütfen tüm alanları (Kredi Miktarı, Açıklama, Tarih) doldurun.");
      return;
  }
  try{
    const response = await fetch('/api/kurallar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ kredi: parseInt(kredi), kural_adi: kural_adi, tarih: tarih }) 
    });
    const data = await response.json();
     if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`);
    } else {
        document.getElementById('kuralEkleForm').reset(); 
        kurallariYukle(); 
        console.log(data.message || "Özel gün kuralı başarıyla eklendi.");
    }
  } catch(error){
    console.error("Özel gün kuralı eklenirken hata:", error);
    alert("Özel gün kuralı eklenemedi. Lütfen konsolu kontrol edin.");
  }
}

/**
 * API'den kredi kurallarını (hafta sonu ve özel günler) alır ve tabloya ekler.
 * Özel günleri tarihe göre sıralar.
 */
async function kurallariYukle() {
  try {
    const response = await fetch('/api/kurallar', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
     if (!response.ok) {
        const errData = await response.json();
        console.error("Kurallar yüklenirken sunucu hatası:", errData.error || response.status);
        const tbody = document.querySelector('#kurallarTablosu tbody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Kurallar yüklenemedi.</td></tr>';
        return;
    }
    let apiKurallar = await response.json(); 
    const tbody = document.querySelector('#kurallarTablosu tbody');
    tbody.innerHTML = ''; 

    const haftaSonuKural = apiKurallar.find(k => k.kural_adi === 'Hafta Sonu');
    let haftaSonuKrediValue = 0;
    if (haftaSonuKural) {
        haftaSonuKrediValue = haftaSonuKural.kredi;
    }

    const haftaSonuRow = tbody.insertRow();
    haftaSonuRow.setAttribute('data-sabit', 'true');
    haftaSonuRow.innerHTML = `
        <td><span id="haftaSonuKrediSpan">${haftaSonuKrediValue}</span></td>
        <td>Hafta Sonu</td>
        <td></td>
        <td><button type="button" class="btn btn-link btn-sm" id="haftaSonuEditBtn" title="Düzenle"><i class="fa fa-pencil"></i></button></td>
    `;
    document.getElementById('haftaSonuEditBtn').onclick = function() {
        const tdIslem = document.getElementById('haftaSonuEditBtn').closest('td');
        const span = document.getElementById('haftaSonuKrediSpan');
        const currentValue = span.textContent;
        // Butonu gizle
        document.getElementById('haftaSonuEditBtn').style.display = 'none';
        // Input oluştur
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentValue;
        input.style.width = '60px';
        input.className = 'form-control';
        input.onkeydown = function(e) {
            if (e.key === 'Enter') {
                input.blur();
            }
        };
        input.onblur = function() {
            const yeniKredi = input.value;
            if (yeniKredi !== '' && !isNaN(parseInt(yeniKredi)) && parseInt(yeniKredi) >= 0) {
                fetch('/api/kurallar', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                    body: JSON.stringify({ kural_adi: 'Hafta Sonu', kredi: parseInt(yeniKredi) })
                }).then(r => r.json()).then(() => kurallariYukle());
            } else {
                kurallariYukle();
            }
        };
        tdIslem.appendChild(input);
        input.focus();
    };
    
    const ozelGunKurallari = apiKurallar.filter(item => 
        item && typeof item.kural_adi === 'string' && item.kural_adi !== 'Hafta Sonu' && 
        typeof item.tarih === 'string' && item.tarih && !isNaN(new Date(item.tarih).valueOf())
    );
    
    ozelGunKurallari.sort((a, b) => new Date(a.tarih) - new Date(b.tarih)); 

    if (ozelGunKurallari && ozelGunKurallari.length > 0) {
        ozelGunKurallari.forEach(tekKural => { 
            const tr = tbody.insertRow(); 
            tr.dataset.id = tekKural.id; 
            tr.innerHTML = `
              <td><span class="krediSpan">${tekKural.kredi}</span></td>
              <td>${tekKural.kural_adi}</td> 
              <td>${new Date(tekKural.tarih).toLocaleDateString('tr-TR')}</td> 
              <td>
                <button class="btn btn-link btn-sm editKrediBtn" title="Düzenle"><i class="fa fa-pencil"></i></button>
                <button class="btn btn-danger btn-sm" onclick="kuralSil(${tekKural.id})">
                  <i class="fa fa-trash"></i>
                </button>
              </td>
            `;
        });
        // Tüm edit butonlarına event ekle
        tbody.querySelectorAll('.editKrediBtn').forEach(btn => {
            btn.onclick = function() {
                const tr = btn.closest('tr');
                const tdIslem = btn.closest('td');
                const span = tr.querySelector('.krediSpan');
                const currentValue = span.textContent;
                const kuralId = tr.dataset.id;
                // Eski butonları gizle
                tdIslem.querySelectorAll('button').forEach(b => b.style.display = 'none');
                // Input oluştur
                const input = document.createElement('input');
                input.type = 'number';
                input.value = currentValue;
                input.style.width = '60px';
                input.className = 'form-control';
                input.onkeydown = function(e) {
                    if (e.key === 'Enter') {
                        input.blur();
                    }
                };
                input.onblur = function() {
                    const yeniKredi = input.value;
                    if (yeniKredi !== '' && !isNaN(parseInt(yeniKredi)) && parseInt(yeniKredi) >= 0) {
                        fetch('/api/kurallar', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                            body: JSON.stringify({ id: kuralId, kredi: parseInt(yeniKredi) })
                        }).then(r => r.json()).then(() => kurallariYukle());
                    } else {
                        kurallariYukle();
                    }
                };
                tdIslem.appendChild(input);
                input.focus();
            };
        });
    }
  } catch (error) {
    console.error('Kurallar yüklenirken genel hata:', error); 
    const tbody = document.querySelector('#kurallarTablosu tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Kurallar yüklenirken bir hata oluştu.</td></tr>';
  }
}

/**
 * Belirtilen ID'ye sahip özel gün kuralını siler.
 * @param {number} id - Silinecek kuralın ID'si
 */
window.kuralSil = async function(id) { // Global scope
  if (confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
    try{
      const response = await fetch(`/api/kurallar/${id}`, { 
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`);
      } else {
        kurallariYukle(); 
        console.log(data.message || "Kural başarıyla silindi.");
      }
    } catch(error){
       console.error("Kural silinirken hata:", error);
      alert("Kural silinemedi. Lütfen konsolu kontrol edin.");
    }
  }
};
