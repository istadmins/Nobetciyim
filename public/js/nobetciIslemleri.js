/**
 * nobetciIslemleri.js
 * Bu dosya, nöbetçi listesi üzerindeki tüm işlemleri (ekleme, silme, güncelleme) yönetir.
 * Ayrıca kredi sıfırlama gibi ek mantıkları da içerir.
 * GÜNCELLEME: Sunucu güvenlik politikalarıyla (CSP) uyumlu hale getirilmiş ve 
 * onclick event'leri yerine addEventListener kullanılmıştır.
 */

// Nöbetçilerin kazanılan kredilerini en düşüğe göre sıfırlayıp günceller.
async function sifirlaVeKazanilanKredileriGuncelle() {
    const nobetciSatirlari = document.querySelectorAll('#nobetciTable tbody tr');
    let gecerliNobetcilerListesi = [];

    nobetciSatirlari.forEach(satir => {
        if (!satir.querySelector('td[colspan]')) {
            gecerliNobetcilerListesi.push(satir);
        }
    });

    if (gecerliNobetcilerListesi.length === 0) {
        console.log("Kredi sıfırlama için nöbetçi bulunamadı.");
        return true;
    }

    const nobetciler = gecerliNobetcilerListesi.map(satir => ({
        id: parseInt(satir.dataset.id),
        kredi: parseInt(satir.cells[4].textContent) || 0
    }));

    // DEBUG: DOM'dan okunan nöbetçi id ve kredi değerlerini konsola yazdır
    console.log('Kredi sıfırlama için işlenecek nöbetçiler:', nobetciler);

    if (nobetciler.length === 0) {
        console.log("İşlenecek geçerli nöbetçi verisi bulunamadı.");
        return true;
    }

    // Yeni eklenen nöbetçiyi (kredisi 0 ve en yüksek id'ye sahip olan) hariç tut
    const maxId = Math.max(...nobetciler.map(n => n.id));
    const yeniEklenen = nobetciler.find(n => n.kredi === 0 && n.id === maxId);
    let nobetcilerHaric = nobetciler;
    if (yeniEklenen) {
        nobetcilerHaric = nobetciler.filter(n => n.id !== yeniEklenen.id);
    }

    // Sıfırlama ve çıkarma işlemini yeni eklenen hariç diğerlerine uygula
    const enDusukKredi = Math.min(...nobetcilerHaric.map(n => n.kredi));
    const guncellenecekKazanilanKrediler = nobetciler.map(n => ({
        id: n.id,
        kredi: yeniEklenen && n.id === yeniEklenen.id ? 0 : n.kredi - enDusukKredi
    }));

    try {
        const response = await fetch('/api/nobetci/kredileri-guncelle', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify(guncellenecekKazanilanKrediler)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sunucu hatası');
        console.log("Kazanılan krediler başarıyla sıfırlandı ve güncellendi.");
        return true;
    } catch (error) {
        console.error("Kazanılan krediler güncellenirken hata:", error);
        return false;
    }
}

// Nöbetçileri sunucudan getiren ve tabloyu güncelleyen ana fonksiyon
async function getNobetciler() {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await fetch('/api/nobetci', {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            const tbody = document.querySelector('#nobetciTable tbody');
            if (!tbody) return resolve(false);

            if (!response.ok) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nöbetçiler yüklenemedi. Sunucu hatası.</td></tr>`;
                return resolve(false);
            }

            const nobetcilerData = await response.json();
            tbody.innerHTML = '';

            if (nobetcilerData && nobetcilerData.length > 0) {
                let aktifNobetciId = (nobetcilerData.find(n => n.is_aktif === 1) || {}).id;

                nobetcilerData.forEach((nobetci, index) => {
                    const tr = document.createElement('tr');
                    tr.dataset.id = nobetci.id;

                    const isChecked = aktifNobetciId ? (nobetci.id === aktifNobetciId) : (index === 0);
                    const kazanilanKredi = nobetci.kredi || 0;
                    const payEdilenKredi = nobetci.pay_edilen_kredi || 0;
                    const kalanKredi = payEdilenKredi - kazanilanKredi;
                    const telegramId = nobetci.telegram_id || "-";
                    const telefonNo = nobetci.telefon_no || "-";

                    tr.innerHTML = `
                        <td>
                            <input type="radio" name="aktifNobetciSecimi" value="${nobetci.id}" ${isChecked ? 'checked' : ''}>
                        </td>
                        <td>${nobetci.name}</td>
                        <td>${telegramId}</td>
                        <td>${telefonNo}</td>
                        <td>${kazanilanKredi}</td>
                        <td>${payEdilenKredi}</td>
                        <td>${kalanKredi}</td>
                        <td>
                            <button class="btn btn-info btn-sm" data-action="edit-telegram" title="Telegram ID Düzenle"><i class="fa fa-telegram"></i></button>
                            <button class="btn btn-secondary btn-sm" data-action="edit-phone" title="Telefon No Düzenle"><i class="fa fa-phone"></i></button>
                            <button class="btn btn-warning btn-sm" data-action="reset-password" title="Şifre Sıfırla"><i class="fa fa-key"></i></button>
                            <button class="btn btn-danger btn-sm" data-action="delete" title="Nöbetçiyi Sil"><i class="fa fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Kayıtlı nöbetçi bulunmamaktadır.</td></tr>`;
            }
            resolve(true);
        } catch (error) {
            console.error("Nöbetçiler getirilirken bir hata oluştu:", error);
            const tbody = document.querySelector('#nobetciTable tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Bir hata oluştu. Lütfen konsolu kontrol edin.</td></tr>`;
            resolve(false);
        }
    });
}

// --- BUTON İŞLEMLERİ ---

async function editTelegramId(id, mevcutId) {
    const yeniId = prompt(`Yeni Telegram Chat ID'sini girin (mevcut: ${mevcutId}):`, mevcutId);
    if (yeniId !== null) {
        try {
            const response = await fetch(`/api/nobetci/${id}/telegram-id`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify({ telegram_id: yeniId.trim() })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            alert("Telegram ID başarıyla güncellendi.");
            await getNobetciler();
        } catch (error) {
            alert(`Hata: ${error.message}`);
        }
    }
}

async function editTelefonNo(id, mevcutNo) {
    const yeniNo = prompt(`Yeni Telefon Numarasını girin (mevcut: ${mevcutNo}):`, mevcutNo);
    if (yeniNo !== null) {
        try {
            const response = await fetch(`/api/nobetci/${id}/telefon-no`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify({ telefon_no: yeniNo.trim() })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            alert("Telefon numarası başarıyla güncellendi.");
            await getNobetciler();
        } catch (error) {
            alert(`Hata: ${error.message}`);
        }
    }
}

async function nobetciSil(id) {
    if (confirm('Bu nöbetçiyi kalıcı olarak silmek istediğinize emin misiniz?')) {
        try {
            const response = await fetch(`/api/nobetci/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            alert("Nöbetçi başarıyla silindi.");
            await getNobetciler();
            if (typeof hesaplaToplamKrediVeDagit === 'function') await hesaplaToplamKrediVeDagit();
            if (typeof window.refreshCalendarData === 'function') await window.refreshCalendarData();
        } catch (error) {
            alert(`Hata: ${error.message}`);
        }
    }
}

async function sifreSifirla(id) {
    if (confirm('Bu nöbetçinin şifresini sıfırlamak istediğinizden emin misiniz? Yeni şifre size gösterilecektir.')) {
        try {
            const response = await fetch(`/api/nobetci/reset-password/${id}`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            alert(`Şifre sıfırlandı!\n\nYeni Şifre: ${data.newPassword}\n\nLütfen bu şifreyi not alıp kullanıcıya iletin.`);
        } catch (error) {
            alert(`Hata: ${error.message}`);
        }
    }
}

async function handleNobetciEkle(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    if (!data.name || !data.password) {
        alert("İsim ve şifre alanları zorunludur.");
        return;
    }
    try {
        const response = await fetch('/api/nobetci', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        if (!response.ok) throw new Error(responseData.error);
        e.target.reset();
        await getNobetciler();
        if (typeof hesaplaToplamKrediVeDagit === 'function') await hesaplaToplamKrediVeDagit();
        if (typeof window.refreshCalendarData === 'function') await window.refreshCalendarData();
    } catch (error) {
        alert(`Hata: ${error.message}`);
    }
}

// --- OLAY DİNLEYİCİSİ (EVENT LISTENER) ---
document.addEventListener('DOMContentLoaded', () => {
    const nobetciTableBody = document.getElementById('nobetciTableBody');

    if (nobetciTableBody) {
        nobetciTableBody.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;

            const action = button.dataset.action;
            if (!action) return;

            const tr = button.closest('tr');
            const nobetciId = tr.dataset.id;

            switch (action) {
                case 'edit-telegram':
                    const mevcutTelegram = tr.cells[2].textContent;
                    editTelegramId(nobetciId, mevcutTelegram === '-' ? '' : mevcutTelegram);
                    break;
                case 'edit-phone':
                    const mevcutTelefon = tr.cells[3].textContent;
                    editTelefonNo(nobetciId, mevcutTelefon === '-' ? '' : mevcutTelefon);
                    break;
                case 'reset-password':
                    sifreSifirla(nobetciId);
                    break;
                case 'delete':
                    nobetciSil(nobetciId);
                    break;
            }
        });
    }
});
