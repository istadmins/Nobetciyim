// public/js/main.js

let getNobetcilerIntervalId = null;
let isOnline = navigator.onLine;

// Utility functions
const showNotification = (message, type = 'info') => {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  switch(type) {
    case 'success':
      notification.style.backgroundColor = '#4CAF50';
      break;
    case 'error':
      notification.style.backgroundColor = '#f44336';
      break;
    case 'warning':
      notification.style.backgroundColor = '#ff9800';
      break;
    default:
      notification.style.backgroundColor = '#2196F3';
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
};

const handleApiError = (error, defaultMessage = 'Bir hata oluştu') => {
  console.error('API Error:', error);
  
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    showNotification('Bağlantı hatası. İnternet bağlantınızı kontrol edin.', 'error');
    return;
  }
  
  if (error.status === 401) {
    showNotification('Oturum süreniz dolmuş. Yeniden giriş yapın.', 'warning');
    setTimeout(() => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    }, 2000);
    return;
  }
  
  if (error.status === 429) {
    showNotification('Çok fazla istek gönderildi. Lütfen bekleyin.', 'warning');
    return;
  }
  
  const message = error.message || defaultMessage;
  showNotification(message, 'error');
};

// Network status monitoring
window.addEventListener('online', () => {
  isOnline = true;
  showNotification('İnternet bağlantısı yeniden kuruldu', 'success');
});

window.addEventListener('offline', () => {
  isOnline = false;
  showNotification('İnternet bağlantısı kesildi', 'warning');
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
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
            showNotification('Kredi dağıtımı başarıyla tamamlandı', 'success');
          } catch (error) {
            handleApiError(error, "Kredi dağıtımı sırasında bir hata oluştu");
          }
        } else {
          console.error("hesaplaToplamKrediVeDagit fonksiyonu bulunamadı!");
          showNotification("Kredi hesaplama fonksiyonu bulunamadı", 'error');
        }
      });
    }

    showNotification('Uygulama başarıyla yüklendi', 'success');
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Uygulama yüklenirken hata oluştu', 'error');
  }
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
