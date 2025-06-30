/**
 * nobetciIslemleri.js
 * Bu dosya, nöbetçi listesi üzerindeki tüm işlemleri (ekleme, silme, güncelleme) yönetir.
 * YENİ: Vardiya durumunu (Gündüz/Akşam) hesaplar ve arayüzde gösterir.
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
        kredi: parseInt(satir.cells[4].textContent) || 0 // Kazanılan Kredi sütunu (5. sütun, index 4)
    }));

    if (nobetciler.length === 0) {
        console.log("İşlenecek geçerli nöbetçi verisi bulunamadı.");
        return true;
    }

    const enDusukKredi = Math.min(...nobetciler.map(n => n.kredi));
    const guncellenecekKazanilanKrediler = nobetciler.map(n => ({
        id: n.id,
        kredi: n.kredi - enDusukKredi
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
    try {
        const response = await fetch('/api/nobetci', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const tbody = document.querySelector('#nobetciTable tbody');
        if (!tbody) return false;

        if (!response.ok) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Nöbetçiler yüklenemedi. Sunucu hatası.</td></tr>`;
            return false;
        }

        const nobetcilerData = await response.json();
        tbody.innerHTML = ''; // Mevcut tabloyu temizle

        if (nobetcilerData && nobetcilerData.length > 0) {
            let aktifNobetciId = (nobetcilerData.find(n => n.is_aktif === 1) || {}).id;

            nobetcilerData.forEach((nobetci) => {
                const tr = document.createElement('tr');
                tr.dataset.id = nobetci.id; // Satırın hangi nöbetçiye ait olduğunu belirtmek için

                const isChecked = nobetci.id === aktifNobetciId;
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
                        <button class="btn btn-info btn-sm" onclick="editTelegramIdPrompt(${nobetci.id}, '${telegramId === '-' ? '' : telegramId}')" title="Telegram ID Düzenle"><i class="fa fa-telegram"></i></button>
                        <button class="btn btn-secondary btn-sm" onclick="editTelefonNoPrompt(${nobetci.id}, '${telefonNo === '-' ? '' : telefonNo}')" title="Telefon No Düzenle"><i class="fa fa-phone"></i></button>
                        <button class="btn btn-warning btn-sm" onclick="sifreSifirla(${nobetci.id})" title="Şifre Sıfırla"><i class="fa fa-key"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="nobetciSil(${nobetci.id})" title="Nöbetçiyi Sil"><i class="fa fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            // YENİ: Vardiya durumunu hesapla ve göster
            await displayVardiyaStatus(nobetcilerData);

        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Kayıtlı nöbetçi bulunmamaktadır.</td></tr>`;
        }
        return true;
    } catch (error) {
        console.error("Nöbetçiler getirilirken bir hata oluştu:", error);
        const tbody = document.querySelector('#nobetciTable tbody');
        if(tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Bir hata oluştu. Lütfen konsolu kontrol edin.</td></tr>`;
        return false;
    }
}

// YENİ FONKSİYON: GÜNCEL VARDİYA DURUMUNU GÖSTERİR
async function displayVardiyaStatus(nobetcilerData) {
    const tableSection = document.getElementById('nobetciListesiBolumu');
    if (!tableSection) return;

    // Durum kutusunu bul veya oluştur
    let statusDiv = document.getElementById('vardiyaStatusDiv');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'vardiyaStatusDiv';
        statusDiv.style.padding = '15px';
        statusDiv.style.marginBottom = '20px';
        statusDiv.style.border = '1px solid #ddd';
        statusDiv.style.backgroundColor = '#f0f8ff';
        statusDiv.style.borderRadius = '8px';
        tableSection.insertBefore(statusDiv, tableSection.children[1]); // Başlığın altına ekle
    }

    // Gerekli verileri ve mevcut zamanı al
    const now = new Date();
    const day = now.getDay(); // 0:Pazar, 1:Pazartesi, ..., 6:Cumartesi
    const hour = now.getHours();

    // Takvimden bu haftanın ve gelecek haftanın nöbetçisini bul
    const { buHaftaNobetci, gelecekHaftaNobetci } = getNobetcilerFromCalendar();

    let aktifOlmasiGerekenNobetci = buHaftaNobetci;
    let vardiyaAdi = "Akşam Vardiyası";

    // Pazartesi ve saat 09:00-17:00 arası ise gündüz nöbetçisi aktif olmalı
    if (day === 1 && hour >= 9 && hour < 17) {
        aktifOlmasiGerekenNobetci = gelecekHaftaNobetci;
        vardiyaAdi = "Gündüz Vardiyası";
    }

    // Sunucudan gelen aktif nöbetçi bilgisini al
    const sunucudakiAktifNobetci = nobetcilerData.find(n => n.is_aktif === 1);

    // Durum mesajını oluştur
    let statusHTML = `
        <h3 style="margin-top:0; color: #337ab7;">Vardiya Durumu</h3>
        <p><strong>Bu Haftanın Nöbetçisi (Akşam):</strong> ${buHaftaNobetci || 'Belirlenemedi'}</p>
        <p><strong>Gelecek Haftanın Nöbetçisi (Gündüz):</strong> ${gelecekHaftaNobetci || 'Belirlenemedi'}</p>
        <hr style="border-top: 1px solid #ccc; margin: 10px 0;">
        <p style="font-size: 1.1em;">
            Şu anki <strong>${vardiyaAdi}</strong> nöbetçisi olması gereken kişi: 
            <strong style="color: green;">${aktifOlmasiGerekenNobetci || 'Bilinmiyor'}</strong>
        </p>
    `;

    // Arayüzdeki durum ile sunucudaki durum farklıysa uyarı göster
    if (sunucudakiAktifNobetci && aktifOlmasiGerekenNobetci && sunucudakiAktifNobetci.name !== aktifOlmasiGerekenNobetci) {
        statusHTML += `
            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 10px; border-radius: 5px; margin-top: 10px;">
                <strong>UYARI:</strong> Arayüzde aktif olarak işaretli nöbetçi 
                (<strong>${sunucudakiAktifNobetci.name}</strong>) ile olması gereken nöbetçi 
                (<strong>${aktifOlmasiGerekenNobetci}</strong>) farklı. 
                Kredilerin doğru hesaplanması için sunucu tarafındaki zamanlanmış görevin (cron job) güncellenmesi gerekmektedir.
            </div>
        `;
    } else {
         statusHTML += `<p style="color: #5cb85c;">✓ Sunucudaki aktif nöbetçi ile olması gereken nöbetçi eşleşiyor.</p>`;
    }
    
    statusDiv.innerHTML = statusHTML;
}

// YENİ YARDIMCI FONKSİYON: Tarihe göre hafta numarasını verir.
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// YENİ YARDIMCI FONKSİYON: Nöbet takviminden nöbetçileri okur.
function getNobetcilerFromCalendar() {
    const takvimBody = document.getElementById('takvimBody');
    if (!takvimBody) return { buHaftaNobetci: null, gelecekHaftaNobetci: null };

    const currentWeek = getWeekNumber(new Date());
    const nextWeek = currentWeek + 1;

    let buHaftaNobetci = null;
    let gelecekHaftaNobetci = null;

    const rows = takvimBody.getElementsByTagName('tr');
    for (let row of rows) {
        const weekCell = row.cells[0]; // Hafta sütunu
        const nobetciCell = row.cells[9]; // Nöbetçi Adı sütunu
        if (weekCell && nobetciCell) {
            const weekNumberInRow = parseInt(weekCell.textContent);
            if (weekNumberInRow === currentWeek) {
                buHaftaNobetci = nobetciCell.textContent.trim();
            }
            if (weekNumberInRow === nextWeek) {
                gelecekHaftaNobetci = nobetciCell.textContent.trim();
            }
        }
    }
    return { buHaftaNobetci, gelecekHaftaNobetci };
}

// --- MEVCUT BUTON FONKSİYONLARI (DEĞİŞİKLİK YOK) ---

window.editTelegramIdPrompt = async function(id, mevcutId) {
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
};

window.editTelefonNoPrompt = async function(id, mevcutNo) {
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
};

window.nobetciSil = async function(id) {
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
};

window.sifreSifirla = async function(id) {
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
};

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
        alert(`${data.name} başarıyla eklendi.`);
        e.target.reset();
        await getNobetciler();
        if (typeof hesaplaToplamKrediVeDagit === 'function') await hesaplaToplamKrediVeDagit();
        if (typeof window.refreshCalendarData === 'function') await window.refreshCalendarData();
    } catch (error) {
        alert(`Hata: ${error.message}`);
    }
}
