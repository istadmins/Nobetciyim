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
        <td>
            <input type="number" id="haftaSonuKrediInput" class="form-control" style="width:100px;" min="0" value="${haftaSonuKrediValue}">
        </td>
        <td>Hafta Sonu</td>
        <td></td> <td>
            <button type="button" class="btn btn-success btn-sm" onclick="haftaSonuKrediKaydet()">Kaydet</button>
        </td>
    `;
    
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
              <td>${tekKural.kredi}</td>
              <td>${tekKural.kural_adi}</td> 
              <td>${new Date(tekKural.tarih).toLocaleDateString('tr-TR')}</td> 
              <td>
                <button class="btn btn-danger btn-sm" onclick="kuralSil(${tekKural.id})">
                  <i class="fa fa-trash"></i>
                </button>
              </td>
            `;
        });
    }
  } catch (error) {
    console.error('Kurallar yüklenirken genel hata:', error); 
    const tbody = document.querySelector('#kurallarTablosu tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Kurallar yüklenirken bir hata oluştu.</td></tr>';
  }
}

/**
 * Hafta sonu kredi miktarını günceller.
 */
window.haftaSonuKrediKaydet = async function() { // Global scope
  const krediInput = document.getElementById('haftaSonuKrediInput');
  if (!krediInput) {
      alert("Hafta sonu kredi input elementi bulunamadı."); 
      return;
  }
  const kredi = krediInput.value;
  if (kredi === "" || isNaN(parseInt(kredi)) || parseInt(kredi) < 0) {
      alert("Lütfen geçerli bir kredi miktarı girin (0 veya daha büyük)."); 
      return;
  }

  try {
    const response = await fetch('/api/kurallar', { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ kural_adi: 'Hafta Sonu', kredi: parseInt(kredi) }) 
    });
    const data = await response.json();
    if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`); 
    } else {
        console.log(data.message || 'Hafta Sonu kredi miktarı güncellendi!'); 
    }
  } catch (error) {
    console.error("Hafta sonu kredisi güncellenirken hata:", error);
    alert("Hafta sonu kredisi güncellenemedi. Lütfen konsolu kontrol edin."); 
  }
};

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
