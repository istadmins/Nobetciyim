// public/js/main.js

let getNobetcilerIntervalId = null;

document.addEventListener('DOMContentLoaded', async () => {
  checkToken();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  const nobetciEkleForm = document.getElementById('nobetciEkleForm');
  if (nobetciEkleForm) {
    nobetciEkleForm.addEventListener('submit', handleNobetciEkle);
  }

  const kuralEkleForm = document.getElementById('kuralEkleForm');
  if (kuralEkleForm) {
    kuralEkleForm.addEventListener('submit', handleOzelGunKuralEkle);
  }

  await loadInitialDataAndSetupInterval();

  addAktifNobetciChangeListener();


  const zamanKredileriniKaydetBtn = document.getElementById('zaman-kredilerini-kaydet');
  if (zamanKredileriniKaydetBtn) {
    zamanKredileriniKaydetBtn.addEventListener('click', kredileriKaydet);
  }

  const yeniSatirEkleBtn = document.getElementById('yeniSatirEkleBtn');
  if (yeniSatirEkleBtn) {
    yeniSatirEkleBtn.addEventListener('click', addNewTimeRow);
  }

  const baslatKrediDagitimiBtn = document.getElementById('baslatKrediDagitimiBtn');
  if (baslatKrediDagitimiBtn) {
    baslatKrediDagitimiBtn.addEventListener('click', async () => {
        if (typeof hesaplaToplamKrediVeDagit === 'function') {
            try {
                await hesaplaToplamKrediVeDagit();
            } catch (error) {
                console.error("Kredi dağıtımı sırasında hata:", error);
                alert("Kredi dağıtımı sırasında bir hata oluştu.");
            }
        } else {
            console.error("hesaplaToplamKrediVeDagit fonksiyonu bulunamadı! Lütfen hesaplama.js dosyasını kontrol edin.");
            alert("Kredi hesaplama fonksiyonu bulunamadı. Lütfen konsolu kontrol edin.");
        }
    });
  }

  // Nöbetçi İzinleri UI ve API entegrasyonu
  async function fetchNobetciList() {
    const res = await fetch('/api/nobetci/list');
    return res.ok ? await res.json() : [];
  }

  async function fetchIzinler() {
    const res = await fetch('/api/nobetci/izinler');
    return res.ok ? await res.json() : [];
  }

  function renderIzinlerTable(izinler) {
    const tbody = document.querySelector('#izinlerTablosu tbody');
    tbody.innerHTML = '';
    izinler.forEach(izin => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${izin.nobetci_adi || ''}</td>
        <td>${izin.baslangic_tarihi}</td>
        <td>${izin.bitis_tarihi}</td>
        <td>${izin.gunduz_yedek_adi || ''}</td>
        <td>${izin.gece_yedek_adi || ''}</td>
        <td><button class="btn btn-danger btn-sm deleteIzinBtn" data-id="${izin.id}"><i class="fa fa-trash"></i></button></td>
      `;
      tbody.appendChild(tr);
    });
    // Silme butonları
    tbody.querySelectorAll('.deleteIzinBtn').forEach(btn => {
      btn.addEventListener('click', async function() {
        if (confirm('Bu izni silmek istediğinize emin misiniz?')) {
          await fetch(`/api/nobetci/izinler/${btn.dataset.id}`, { method: 'DELETE' });
          loadIzinler();
        }
      });
    });
  }

  async function loadIzinler() {
    const izinler = await fetchIzinler();
    renderIzinlerTable(izinler);
  }

  function showIzinForm(nobetciList) {
    const formDiv = document.getElementById('izinFormu');
    formDiv.innerHTML = `
        <form id="izinEkleForm">
            <label>Nöbetçi:
                <select name="nobetci_id" required>
                    <option value="">Seçiniz</option>
                    ${nobetciList.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}
                </select>
            </label>
            <label>Başlangıç Tarihi:
                <input type="datetime-local" name="baslangic_tarihi" required>
            </label>
            <label>Bitiş Tarihi:
                <input type="datetime-local" name="bitis_tarihi" required>
            </label>
            <label>Gündüz Yedek:
                <select name="gunduz_yedek_id">
                    <option value="">Seçiniz</option>
                    ${nobetciList.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}
                </select>
            </label>
            <label>Gece Yedek:
                <select name="gece_yedek_id">
                    <option value="">Seçiniz</option>
                    ${nobetciList.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}
                </select>
            </label>
            <button type="submit" class="btn btn-success">Kaydet</button>
            <button type="button" id="izinFormKapatBtn" class="btn btn-secondary">İptal</button>
        </form>
    `;
    formDiv.style.display = '';
    document.getElementById('izinFormKapatBtn').onclick = () => { formDiv.style.display = 'none'; };
    document.getElementById('izinEkleForm').onsubmit = async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        await fetch('/api/nobetci/izinler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        formDiv.style.display = 'none';
        loadIzinler();
    };
  }

  document.getElementById('izinEkleBtn').onclick = async function() {
    // Her tıklamada güncel nöbetçi listesini çek
    const nobetciList = await fetchNobetciList();
    showIzinForm(nobetciList);
  };

  await loadIzinler();
});

async function loadInitialDataAndSetupInterval() {
    if (typeof getNobetciler === 'function') await getNobetciler();
    if (typeof kurallariYukle === 'function') await kurallariYukle();
    if (typeof zamanKrediTablosunuDoldur === 'function') await zamanKrediTablosunuDoldur();
    if (typeof window.refreshCalendarData === 'function') { // Takvim verilerini de ilk yüklemede çek
        await window.refreshCalendarData();
    }


    if (typeof getNobetciler === 'function') {
        if (getNobetcilerIntervalId) {
            clearInterval(getNobetcilerIntervalId);
        }
        // Arayüz güncelleme sıklığını buradan ayarlayabilirsiniz.
        // Örneğin 10 saniyede bir güncelleme için 10000.
        // Daha sık güncelleme, sunucuya daha fazla istek anlamına gelir.
        // Uygulamanızın ihtiyacına göre bir denge bulun.
        const guncellemeAraligi = 10000; // 10 saniye
        getNobetcilerIntervalId = setInterval(async () => {
            console.log(`Nöbetçi listesi ve krediler periyodik olarak güncelleniyor (${guncellemeAraligi / 1000} saniyede bir)...`);
            await getNobetciler();
            // Nöbetçi listesi güncellendiğinde takvimi de yenilemek isteyebilirsiniz
            // Ancak bu, takvimin sürekli yeniden çizilmesine neden olabilir.
            // Sadece nöbetçi sayısı veya isimleri değiştiğinde takvimi yenilemek daha iyi olabilir.
            // Şimdilik sadece getNobetciler çağrılıyor.
            // if (typeof window.refreshCalendarData === 'function') {
            //    await window.refreshCalendarData();
            // }
        }, guncellemeAraligi);
        console.log(`Nöbetçi listesi ${guncellemeAraligi / 1000} saniyede bir güncellenecek.`);
    }
}

function addAktifNobetciChangeListener() {
    const nobetciListesiBody = document.querySelector('#nobetciTable tbody');

    if (nobetciListesiBody) {
        nobetciListesiBody.addEventListener('change', async (event) => {
            if (event.target.type === 'radio' && event.target.name === 'aktifNobetciSecimi') {
                const secilenNobetciId = event.target.value;
                console.log(`Aktif nöbetçi seçildi: ID ${secilenNobetciId}`);
                try {
                    const response = await fetch(`/api/nobetci/${secilenNobetciId}/set-aktif`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + localStorage.getItem('token')
                        }
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        alert(data.error || `Sunucu hatası: ${response.status}`);
                        if (typeof getNobetciler === 'function') await getNobetciler();
                    } else {
                        console.log(data.message || `Nöbetçi ID ${secilenNobetciId} aktif olarak ayarlandı.`);
                        // Aktif nöbetçi değiştiğinde takvimi de yenileyebiliriz
                        if (typeof window.refreshCalendarData === 'function') {
                           await window.refreshCalendarData();
                        }
                    }
                } catch (error) {
                    console.error('Aktif nöbetçi ayarlanırken hata:', error);
                    alert('Aktif nöbetçi ayarlanırken bir hata oluştu.');
                    if (typeof getNobetciler === 'function') await getNobetciler();
                }
            }
        });
    }
}
