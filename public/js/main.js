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
    // Yardımcı: ISO -> DD.MM.YYYY SS:dd
    function toTurkishDateTime(iso) {
        const d = new Date(iso);
        const gun = String(d.getDate()).padStart(2, '0');
        const ay = String(d.getMonth() + 1).padStart(2, '0');
        const yil = d.getFullYear();
        const saat = String(d.getHours()).padStart(2, '0');
        const dakika = String(d.getMinutes()).padStart(2, '0');
        return `${gun}.${ay}.${yil} ${saat}:${dakika}`;
    }
    // Sıralama: en eski en üstte
    izinler.sort((a, b) => new Date(a.baslangic_tarihi) - new Date(b.baslangic_tarihi));
    izinler.forEach(izin => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${izin.nobetci_adi || ''}</td>
        <td>${toTurkishDateTime(izin.baslangic_tarihi)}</td>
        <td>${toTurkishDateTime(izin.bitis_tarihi)}</td>
        <td>${izin.gunduz_yedek_adi || ''}</td>
        <td>${izin.gece_yedek_adi || ''}</td>
        <td>
          <button class="btn btn-link btn-sm editIzinBtn" data-id="${izin.id}"><i class="fa fa-pencil"></i></button>
          <button class="btn btn-danger btn-sm deleteIzinBtn" data-id="${izin.id}"><i class="fa fa-trash"></i></button>
        </td>
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
    // Düzenleme butonları
    tbody.querySelectorAll('.editIzinBtn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const izinId = btn.dataset.id;
        const izin = izinler.find(i => String(i.id) === String(izinId));
        const nobetciList = await fetchNobetciList();
        showIzinForm(nobetciList, izin);
      });
    });
  }

  async function loadIzinler() {
    const izinler = await fetchIzinler();
    renderIzinlerTable(izinler);
  }

  function showIzinForm(nobetciList, izin = null) {
    const formDiv = document.getElementById('izinFormu');
    // Seçili nöbetçi kimse, yedek dropdownlarında onu çıkar
    let selectedNobetciId = izin ? izin.nobetci_id : null;
    formDiv.innerHTML = `
        <form id="izinEkleForm">
            <label>Nöbetçi:
                <select name="nobetci_id" required id="izinNobetciSelect">
                    <option value="">Seçiniz</option>
                    ${nobetciList.map(n => `<option value="${n.id}"${izin && n.id == izin.nobetci_id ? ' selected' : ''}>${n.name}</option>`).join('')}
                </select>
            </label>
            <label>Başlangıç Tarihi:
                <input type="text" id="baslangic_tarihi_input" name="baslangic_tarihi" required value="${izin ? toTurkishDateTimeInputValue(izin.baslangic_tarihi) : ''}" placeholder="gg.aa.yyyy ss:dd">
            </label>
            <label>Bitiş Tarihi:
                <input type="text" id="bitis_tarihi_input" name="bitis_tarihi" required value="${izin ? toTurkishDateTimeInputValue(izin.bitis_tarihi) : ''}" placeholder="gg.aa.yyyy ss:dd">
            </label>
            <label>Gündüz Yedek:
                <select name="gunduz_yedek_id" required id="gunduzYedekSelect">
                    <option value="">Seçiniz</option>
                    ${nobetciList.filter(n => n.id != selectedNobetciId).map(n => `<option value="${n.id}"${izin && n.id == izin.gunduz_yedek_id ? ' selected' : ''}>${n.name}</option>`).join('')}
                </select>
            </label>
            <label>Gece Yedek:
                <select name="gece_yedek_id" required id="geceYedekSelect">
                    <option value="">Seçiniz</option>
                    ${nobetciList.filter(n => n.id != selectedNobetciId).map(n => `<option value="${n.id}"${izin && n.id == izin.gece_yedek_id ? ' selected' : ''}>${n.name}</option>`).join('')}
                </select>
            </label>
            <button type="submit" class="btn btn-success">Kaydet</button>
            <button type="button" id="izinFormKapatBtn" class="btn btn-secondary">İptal</button>
        </form>
    `;
    formDiv.style.display = '';
    // Flatpickr başlat
    flatpickr("#baslangic_tarihi_input", { enableTime: true, dateFormat: "d.m.Y H:i", locale: "tr", allowInput: true });
    flatpickr("#bitis_tarihi_input", { enableTime: true, dateFormat: "d.m.Y H:i", locale: "tr", allowInput: true });
    // Input mask ekle
    Inputmask("99.99.9999 99:99").mask("#baslangic_tarihi_input");
    Inputmask("99.99.9999 99:99").mask("#bitis_tarihi_input");
    document.getElementById('izinFormKapatBtn').onclick = () => { formDiv.style.display = 'none'; };
    // Nöbetçi değişirse yedek dropdownlarını güncelle
    document.getElementById('izinNobetciSelect').onchange = function() {
        const seciliId = this.value;
        const gunduzYedekSelect = document.getElementById('gunduzYedekSelect');
        const geceYedekSelect = document.getElementById('geceYedekSelect');
        [gunduzYedekSelect, geceYedekSelect].forEach(select => {
            Array.from(select.options).forEach(opt => {
                opt.disabled = (opt.value === seciliId && opt.value !== '');
            });
            // Eğer seçili yedek, yeni nöbetçiyle aynıysa sıfırla
            if (select.value === seciliId) select.value = '';
        });
    };
    document.getElementById('izinEkleForm').onsubmit = async function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        // Validasyon: yedekler seçili mi ve nöbetçiyle aynı mı?
        if (!data.gunduz_yedek_id || !data.gece_yedek_id) {
            alert('Gündüz ve gece yedek nöbetçi seçmek zorunludur!');
            return;
        }
        if (data.nobetci_id === data.gunduz_yedek_id || data.nobetci_id === data.gece_yedek_id) {
            alert('İzinli nöbetçi kendisi yedek olarak seçilemez!');
            return;
        }
        // Flatpickr ile gelen Türkçe formatı ISO'ya çevir
        data.baslangic_tarihi = toISODateTime(data.baslangic_tarihi);
        data.bitis_tarihi = toISODateTime(data.bitis_tarihi);
        if (izin && izin.id) {
            await fetch(`/api/nobetci/izinler/${izin.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            await fetch('/api/nobetci/izinler', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        formDiv.style.display = 'none';
        loadIzinler();
    };
  }

  // Türkçe tarih formatını ISO'ya çeviren fonksiyon
  function toISODateTime(dt) {
    if (!dt) return '';
    const [date, time] = dt.split(' ');
    const [day, month, year] = date.split('.');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time || '00:00'}`;
  }
  // ISO'yu Türkçe input formatına çeviren fonksiyon
  function toTurkishDateTimeInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const gun = String(d.getDate()).padStart(2, '0');
    const ay = String(d.getMonth() + 1).padStart(2, '0');
    const yil = d.getFullYear();
    const saat = String(d.getHours()).padStart(2, '0');
    const dakika = String(d.getMinutes()).padStart(2, '0');
    return `${gun}.${ay}.${yil} ${saat}:${dakika}`;
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
