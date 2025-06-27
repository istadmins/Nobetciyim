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

// İşlem butonları için event listener ekle
function addOperationButtonListeners() {
    const nobetciTableBody = document.querySelector('#nobetciTable tbody');
    if (!nobetciTableBody) return;

    // Event delegation kullanarak butonlara tıklama olayı ekle
    nobetciTableBody.addEventListener('click', async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const row = target.closest('tr');
        const nobetciId = row.querySelector('input[name="aktifNobetciSecimi"]')?.value;
        const nobetciName = row.cells[1]?.textContent?.trim(); // İsim sütunu

        if (!nobetciId) {
            showNotification('Nöbetçi ID bulunamadı', 'error');
            return;
        }

        // Buton tipini class'a veya içeriğe göre belirle
        if (target.classList.contains('telegram-btn') || target.textContent.includes('👁')) {
            await handleTelegramUpdate(nobetciId, nobetciName);
        } else if (target.classList.contains('phone-btn') || target.textContent.includes('📞')) {
            await handlePhoneUpdate(nobetciId, nobetciName);
        } else if (target.classList.contains('delete-btn') || target.textContent.includes('🗑')) {
            await handleUserDelete(nobetciId, nobetciName);
        } else if (target.classList.contains('password-btn') || target.textContent.includes('🔑')) {
            await handlePasswordReset(nobetciId, nobetciName);
        }
    });
}

// 1. Telegram numarası güncelleme
async function handleTelegramUpdate(nobetciId, nobetciName) {
    const currentTelegram = prompt(`${nobetciName} için Telegram ID'sini girin:`);
    if (!currentTelegram) return;

    try {
        const response = await fetch(`/api/nobetci/${nobetciId}/telegram`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ telegram_id: currentTelegram })
        });

        const data = await response.json();
        if (response.ok) {
            showNotification(`${nobetciName} için Telegram ID güncellendi`, 'success');
            await getNobetciler(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Telegram ID güncellenemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Telegram ID güncellenirken hata oluştu');
    }
}

// 2. Telefon numarası güncelleme
async function handlePhoneUpdate(nobetciId, nobetciName) {
    const currentPhone = prompt(`${nobetciName} için yeni telefon numarasını girin:`);
    if (!currentPhone) return;

    try {
        const response = await fetch(`/api/nobetci/${nobetciId}/phone`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ telefon_no: currentPhone })
        });

        const data = await response.json();
        if (response.ok) {
            showNotification(`${nobetciName} için telefon numarası güncellendi`, 'success');
            await getNobetciler(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Telefon numarası güncellenemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Telefon numarası güncellenirken hata oluştu');
    }
}

// 3. Kullanıcı silme ve kredi yeniden hesaplama
async function handleUserDelete(nobetciId, nobetciName) {
    const confirmDelete = confirm(`${nobetciName} kullanıcısını silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz ve krediler yeniden hesaplanacak.`);
    if (!confirmDelete) return;

    try {
        const response = await fetch(`/api/nobetci/${nobetciId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        const data = await response.json();
        if (response.ok) {
            showNotification(`${nobetciName} başarıyla silindi`, 'success');
            
            // Kredileri yeniden hesapla
            showNotification('Krediler yeniden hesaplanıyor...', 'info');
            await recalculateCreditsAfterUserDelete();
            
            await getNobetciler(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Kullanıcı silinemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Kullanıcı silinirken hata oluştu');
    }
}

// 4. Şifre sıfırlama (Telegram üzerinden)
async function handlePasswordReset(nobetciId, nobetciName) {
    const confirmReset = confirm(`${nobetciName} için şifre sıfırlama işlemi başlatılsın mı?\n\nYeni şifre Telegram üzerinden gönderilecek.`);
    if (!confirmReset) return;

    try {
        const response = await fetch(`/api/nobetci/${nobetciId}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        const data = await response.json();
        if (response.ok) {
            showNotification(`${nobetciName} için şifre sıfırlama talebi gönderildi`, 'success');
        } else {
            showNotification(data.error || 'Şifre sıfırlanamadı', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Şifre sıfırlanırken hata oluştu');
    }
}

// Kullanıcı silindikten sonra kredileri yeniden hesaplama
async function recalculateCreditsAfterUserDelete() {
    try {
        const response = await fetch('/api/recalculate-credits', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        const data = await response.json();
        if (response.ok) {
            showNotification('Krediler başarıyla yeniden hesaplandı', 'success');
        } else {
            showNotification('Kredi hesaplama hatası: ' + (data.error || 'Bilinmeyen hata'), 'warning');
        }
    } catch (error) {
        console.error('Kredi yeniden hesaplama hatası:', error);
        showNotification('Kredi hesaplama sırasında hata oluştu', 'warning');
    }
}

// Token kontrolü
function checkToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
}

// Çıkış yapma
function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// Nöbetçileri getir ve tabloya yükle
async function getNobetciler() {
    try {
        const response = await fetch('/api/nobetciler', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const nobetciler = await response.json();
        const tableBody = document.querySelector('#nobetciTable tbody');
        
        if (!tableBody) return;

        // Tabloyu temizle
        tableBody.innerHTML = '';

        // Her nöbetçi için satır oluştur
        nobetciler.forEach(nobetci => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="radio" name="aktifNobetciSecimi" value="${nobetci.id}" ${nobetci.is_aktif ? 'checked' : ''}>
                </td>
                <td>${nobetci.name || ''}</td>
                <td>${nobetci.telegram_id || ''}</td>
                <td>${nobetci.telefon_no || ''}</td>
                <td>${nobetci.kredi || 0}</td>
                <td>${nobetci.pay_edilen_kredi || 0}</td>
                <td>${(nobetci.kredi || 0) - (nobetci.pay_edilen_kredi || 0)}</td>
                <td>
                    <button class="telegram-btn" title="Telegram Güncelle">👁️</button>
                    <button class="phone-btn" title="Telefon Güncelle">📞</button>
                    <button class="delete-btn" title="Kullanıcı Sil">🗑️</button>
                    <button class="password-btn" title="Şifre Sıfırla">🔑</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        handleApiError(error, 'Nöbetçiler yüklenirken hata oluştu');
    }
}

// Yeni nöbetçi ekleme
async function handleNobetciEkle(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const nobetciData = {
        name: formData.get('isim'),
        telefon_no: formData.get('telefonNo'),
        telegram_id: formData.get('telegramId'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/nobetci', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(nobetciData)
        });

        const data = await response.json();
        if (response.ok) {
            showNotification('Nöbetçi başarıyla eklendi', 'success');
            event.target.reset(); // Formu temizle
            await getNobetciler(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Nöbetçi eklenemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Nöbetçi eklenirken hata oluştu');
    }
}

// Kuralları yükle
async function kurallariYukle() {
    try {
        const response = await fetch('/api/kurallar', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) return;

        const kurallar = await response.json();
        const tableBody = document.querySelector('#kurallarTable tbody');
        
        if (!tableBody) return;

        tableBody.innerHTML = '';

        kurallar.forEach(kural => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${kural.kredi || 0}</td>
                <td>${kural.kural_adi || ''}</td>
                <td>${kural.created_at || ''}</td>
                <td>
                    <button onclick="kuralSil(${kural.id})" class="btn btn-danger">Sil</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Kurallar yüklenirken hata:', error);
    }
}

// Kural silme
async function kuralSil(kuralId) {
    if (!confirm('Bu kuralı silmek istediğinizden emin misiniz?')) return;

    try {
        const response = await fetch(`/api/kural/${kuralId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (response.ok) {
            showNotification('Kural başarıyla silindi', 'success');
            await kurallariYukle(); // Tabloyu yenile
        } else {
            showNotification('Kural silinemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Kural silinirken hata oluştu');
    }
}

// Özel gün kuralı ekleme
async function handleOzelGunKuralEkle(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const kuralData = {
        kural_adi: formData.get('kuralAdi'),
        kredi: parseFloat(formData.get('krediMiktari'))
    };

    try {
        const response = await fetch('/api/kural', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(kuralData)
        });

        const data = await response.json();
        if (response.ok) {
            showNotification('Kural başarıyla eklendi', 'success');
            event.target.reset(); // Formu temizle
            await kurallariYukle(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Kural eklenemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Kural eklenirken hata oluştu');
    }
}

// Zaman kredi tablosunu doldur
async function zamanKrediTablosunuDoldur() {
    try {
        const response = await fetch('/api/zaman-kredileri', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        if (!response.ok) return;

        const zamanKredileri = await response.json();
        const tableBody = document.querySelector('#zamanKrediTable tbody');
        
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (zamanKredileri.length === 0) {
            // Varsayılan zaman dilimi ekle
            addNewTimeRow();
            return;
        }

        zamanKredileri.forEach(zaman => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="number" step="0.01" value="${zaman.kredi_dakika || 0}" class="kredi-input">
                </td>
                <td>
                    <input type="time" value="${zaman.baslangic_saat || '00:00'}" class="baslangic-input">
                    -
                    <input type="time" value="${zaman.bitis_saat || '23:59'}" class="bitis-input">
                </td>
                <td>
                    <button onclick="zamanKrediSatirSil(this)" class="btn btn-danger">Sil</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Zaman kredileri yüklenirken hata:', error);
    }
}

// Yeni zaman satırı ekle
function addNewTimeRow() {
    const tableBody = document.querySelector('#zamanKrediTable tbody');
    if (!tableBody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <input type="number" step="0.01" value="1.0" class="kredi-input">
        </td>
        <td>
            <input type="time" value="00:00" class="baslangic-input">
            -
            <input type="time" value="23:59" class="bitis-input">
        </td>
        <td>
            <button onclick="zamanKrediSatirSil(this)" class="btn btn-danger">Sil</button>
        </td>
    `;
    tableBody.appendChild(row);
}

// Zaman kredi satırı sil
function zamanKrediSatirSil(button) {
    if (!confirm('Bu zaman dilimini silmek istediğinizden emin misiniz?')) return;
    
    const row = button.closest('tr');
    row.remove();
}

// Kredileri kaydet
async function kredileriKaydet() {
    const tableBody = document.querySelector('#zamanKrediTable tbody');
    if (!tableBody) return;

    const rows = tableBody.querySelectorAll('tr');
    const zamanKredileri = [];

    rows.forEach(row => {
        const krediInput = row.querySelector('.kredi-input');
        const baslangicInput = row.querySelector('.baslangic-input');
        const bitisInput = row.querySelector('.bitis-input');

        if (krediInput && baslangicInput && bitisInput) {
            zamanKredileri.push({
                kredi_dakika: parseFloat(krediInput.value) || 0,
                baslangic_saat: baslangicInput.value || '00:00',
                bitis_saat: bitisInput.value || '23:59'
            });
        }
    });

    try {
        const response = await fetch('/api/zaman-kredileri', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ zamanKredileri })
        });

        const data = await response.json();
        if (response.ok) {
            showNotification('Zaman kredileri başarıyla kaydedildi', 'success');
        } else {
            showNotification(data.error || 'Zaman kredileri kaydedilemedi', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Zaman kredileri kaydedilirken hata oluştu');
    }
}

// Kredi hesaplama ve dağıtım
async function hesaplaToplamKrediVeDagit() {
    try {
        const response = await fetch('/api/kredi-dagit', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        });

        const data = await response.json();
        if (response.ok) {
            showNotification('Kredi dağıtımı başarıyla tamamlandı', 'success');
            await getNobetciler(); // Tabloyu yenile
        } else {
            showNotification(data.error || 'Kredi dağıtımı başarısız', 'error');
        }
    } catch (error) {
        handleApiError(error, 'Kredi dağıtımı sırasında hata oluştu');
    }
}

// Takvim verilerini yenile (basit placeholder)
window.refreshCalendarData = async function() {
    try {
        // Burada takvim verileri yenilenir
        console.log('Takvim verileri yenileniyor...');
    } catch (error) {
        console.error('Takvim verileri yenilenirken hata:', error);
    }
};

// Ana event listener
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

        // İşlem butonları için event listener'ları başlat
        addOperationButtonListeners();

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
                try {
                    await hesaplaToplamKrediVeDagit();
                    showNotification('Kredi dağıtımı başarıyla tamamlandı', 'success');
                } catch (error) {
                    handleApiError(error, "Kredi dağıtımı sırasında bir hata oluştu");
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
    await getNobetciler();
    await kurallariYukle();
    await zamanKrediTablosunuDoldur();
    await window.refreshCalendarData();

    if (getNobetcilerIntervalId) {
        clearInterval(getNobetcilerIntervalId);
    }

    const guncellemeAraligi = 10000; // 10 saniye
    getNobetcilerIntervalId = setInterval(async () => {
        console.log(`Nöbetçi listesi ve krediler periyodik olarak güncelleniyor (${guncellemeAraligi / 1000} saniyede bir)...`);
        await getNobetciler();
    }, guncellemeAraligi);
    console.log(`Nöbetçi listesi ${guncellemeAraligi / 1000} saniyede bir güncellenecek.`);
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
                        await getNobetciler();
                    } else {
                        console.log(data.message || `Nöbetçi ID ${secilenNobetciId} aktif olarak ayarlandı.`);
                        await window.refreshCalendarData();
                    }
                } catch (error) {
                    console.error('Aktif nöbetçi ayarlanırken hata:', error);
                    alert('Aktif nöbetçi ayarlanırken bir hata oluştu.');
                    await getNobetciler();
                }
            }
        });
    }
}
