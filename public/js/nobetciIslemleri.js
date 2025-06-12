// public/js/nobetciIslemleri.js

async function sifirlaVeKazanilanKredileriGuncelle() {
    const nobetciSatirlari = document.querySelectorAll('#nobetciTable tbody tr');
    let gecerliNobetcilerListesi = [];
    nobetciSatirlari.forEach(satir => {
        // Colspan değeri değiştiği için bu kontrolü güncelleyelim (Telefon No sütunu eklendi)
        if (!satir.querySelector('td[colspan="9"]')) { // 8 yerine 9 oldu
            gecerliNobetcilerListesi.push(satir);
        }
    });

    if (gecerliNobetcilerListesi.length === 0) {
        console.log("sifirlaVeKazanilanKredileriGuncelle: Sıfırlanacak/Güncellenecek nöbetçi bulunamadı.");
        return true;
    }

    let nobetciler = [];
    gecerliNobetcilerListesi.forEach(satir => {
        const id = satir.dataset.id;
        const kazanilanKrediHucresi = satir.querySelector('.kazanilan-kredi');
        if (id && kazanilanKrediHucresi) {
            nobetciler.push({
                id: parseInt(id),
                kredi: parseInt(kazanilanKrediHucresi.textContent) || 0
            });
        }
    });

    if (nobetciler.length === 0) {
        console.log("sifirlaVeKazanilanKredileriGuncelle: İşlenecek geçerli nöbetçi verisi (ID ve kredi ile) bulunamadı.");
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
        if (!response.ok) {
            console.error("sifirlaVeKazanilanKredileriGuncelle: Kazanılan krediler güncellenirken sunucu hatası:", data.error || response.status);
            return false;
        } else {
            console.log("sifirlaVeKazanilanKredileriGuncelle:", data.message || "Kazanılan krediler başarıyla sıfırlanıp güncellendi.");
            return true;
        }
    } catch (error) {
        console.error("sifirlaVeKazanilanKredileriGuncelle: Kazanılan krediler güncellenirken JS hatası:", error);
        return false;
    }
}


async function handleNobetciEkle(e) {
  e.preventDefault();
  const nameInput = document.getElementById('name');
  const passwordInput = document.getElementById('password');
  const telegramIdInput = document.getElementById('telegram_id');
  const telefonNoInput = document.getElementById('telefon_no_form'); // ID güncellendi

  if (!nameInput || !passwordInput || !telegramIdInput || !telefonNoInput) {
      console.error("handleNobetciEkle: Form elementleri DOM'da bulunamadı!");
      alert("Form alanları yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.");
      return;
  }

  const name = nameInput.value.trim();
  const password = passwordInput.value.trim();
  const telegram_id = telegramIdInput.value.trim();
  const telefon_no = telefonNoInput.value.trim(); // Telefon no değerini al

  if (!name || !password) {
      alert("Lütfen isim ve şifre alanlarını doldurun.");
      return;
  }

  try {
    const response = await fetch('/api/nobetci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ name, password, telegram_id, telefon_no }) // telefon_no'yu gönder
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.error || `Sunucu hatası: ${response.status}`);
    } else {
      console.log("handleNobetciEkle: Nöbetçi başarıyla eklendi:", data);
      document.getElementById('nobetciEkleForm').reset();
      const nobetcilerGetirildi = await getNobetciler(); // Listeyi yenile
      if (nobetcilerGetirildi) {
          if (typeof window.refreshCalendarData === 'function') {
              await window.refreshCalendarData();
          }
          if (typeof hesaplaToplamKrediVeDagit === 'function') {
              await hesaplaToplamKrediVeDagit();
          }
      } else {
          alert("Nöbetçi eklendi ancak liste güncellenemediği için krediler dağıtılamadı.");
      }
    }
  } catch (error) {
    console.error("handleNobetciEkle: Nöbetçi eklenirken JS hatası:", error);
    alert("Nöbetçi eklenemedi. Lütfen konsolu kontrol edin.");
  }
}

async function getNobetciler() {
  try {
    const response = await fetch('/api/nobetci', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const tbody = document.querySelector('#nobetciTable tbody');
    if (!response.ok) {
        const errData = await response.json();
        console.error("getNobetciler: Nöbetçiler getirilirken sunucu hatası:", errData.error || response.status);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Nöbetçiler yüklenemedi.</td></tr>`; // Colspan 9 oldu
        return false;
    }
    const nobetcilerData = await response.json();
    if(tbody) tbody.innerHTML = ''; // Önceki içeriği temizle

    if (nobetcilerData && nobetcilerData.length > 0) {
        let aktifNobetciVarMi = nobetcilerData.some(nobetci => nobetci.is_aktif === 1);
        nobetcilerData.forEach((nobetci, index) => {
          const tr = document.createElement('tr');
          tr.dataset.id = nobetci.id; // Satıra nöbetçi ID'sini ekle

          let isChecked = false;
          if (aktifNobetciVarMi) {
            isChecked = (nobetci.is_aktif === 1);
          } else if (index === 0 && nobetcilerData.length > 0 && !aktifNobetciVarMi) {
            isChecked = true;
          }

          const kazanilanKredi = nobetci.kredi || 0;
          const payEdilenKredi = nobetci.pay_edilen_kredi || 0;
          const kalanKredi = payEdilenKredi - kazanilanKredi;
          const telegramId = nobetci.telegram_id || "-";
          const telefonNo = nobetci.telefon_no || "-"; // Telefon numarasını al

          tr.innerHTML = `
            <td>
              <input type="radio" name="aktifNobetciSecimi" value="${nobetci.id}" class="aktif-nobetci-radio" ${isChecked ? 'checked' : ''}>
            </td>
            <td>${nobetci.name}</td>
            <td class="telegram-id-cell" data-nobetci-id="${nobetci.id}">${telegramId}</td>
            <td class="telefon-no-cell" data-nobetci-id="${nobetci.id}">${telefonNo}</td> <td class="kazanilan-kredi">${kazanilanKredi}</td>
            <td class="pay-edilen-kredi">${payEdilenKredi}</td>
            <td class="kalan-kredi">${kalanKredi}</td>
            <td>
              <button class="btn btn-info btn-sm" onclick="editTelegramIdPrompt(${nobetci.id}, '${telegramId === '-' ? '' : telegramId}')" title="Telegram ID Düzenle">
                <i class="fa fa-telegram"></i>
              </button>
              <button class="btn btn-secondary btn-sm" onclick="editTelefonNoPrompt(${nobetci.id}, '${telefonNo === '-' ? '' : telefonNo}')" title="Telefon No Düzenle"> <i class="fa fa-phone"></i>
              </button>
              <button class="btn btn-danger btn-sm" onclick="nobetciSil(${nobetci.id})" title="Nöbetçiyi Sil">
                <i class="fa fa-trash"></i>
              </button>
              <button class="btn btn-warning btn-sm" onclick="sifreSifirla(${nobetci.id})" title="Şifre Sıfırla">
                <i class="fa fa-key"></i>
              </button>
            </td>
          `;
          if(tbody) tbody.appendChild(tr);
        });
    } else {
        if(tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Kayıtlı nöbetçi bulunmamaktadır.</td></tr>`; // Colspan 9 oldu
    }
    return true;
  } catch (error) {
    console.error("getNobetciler: Nöbetçiler getirilirken JS hatası:", error);
    const tbody = document.querySelector('#nobetciTable tbody');
    if(tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Nöbetçiler yüklenirken bir hata oluştu.</td></tr>`; // Colspan 9 oldu
    return false;
  }
}

// Telegram ID'sini düzenlemek için prompt göster
window.editTelegramIdPrompt = async function(nobetciId, mevcutTelegramId) {
    const yeniTelegramId = prompt(`Nöbetçi için yeni Telegram Chat ID'sini girin (mevcut: ${mevcutTelegramId || 'Boş'}):`, mevcutTelegramId || '');

    if (yeniTelegramId !== null) { // Kullanıcı iptal etmediyse
        try {
            const response = await fetch(`/api/nobetci/${nobetciId}/telegram-id`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ telegram_id: yeniTelegramId.trim() })
            });
            const data = await response.json();
            if (!response.ok) {
                alert(data.error || `Telegram ID güncellenirken sunucu hatası: ${response.status}`);
            } else {
                alert(data.message || "Telegram ID başarıyla güncellendi.");
                await getNobetciler(); // Listeyi yenile
            }
        } catch (error) {
            console.error("editTelegramIdPrompt: Telegram ID güncellenirken JS hatası:", error);
            alert("Telegram ID güncellenemedi. Lütfen konsolu kontrol edin.");
        }
    }
};

// YENİ FONKSİYON: Telefon Numarasını düzenlemek için prompt göster
window.editTelefonNoPrompt = async function(nobetciId, mevcutTelefonNo) {
    const yeniTelefonNo = prompt(`Nöbetçi için yeni Telefon Numarasını girin (mevcut: ${mevcutTelefonNo || 'Boş'}):`, mevcutTelefonNo || '');

    if (yeniTelefonNo !== null) { // Kullanıcı iptal etmediyse
        try {
            const response = await fetch(`/api/nobetci/${nobetciId}/telefon-no`, { // Yeni API endpoint'i
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ telefon_no: yeniTelefonNo.trim() })
            });
            const data = await response.json();
            if (!response.ok) {
                alert(data.error || `Telefon numarası güncellenirken sunucu hatası: ${response.status}`);
            } else {
                alert(data.message || "Telefon numarası başarıyla güncellendi.");
                await getNobetciler(); // Listeyi yenile
            }
        } catch (error) {
            console.error("editTelefonNoPrompt: Telefon numarası güncellenirken JS hatası:", error);
            alert("Telefon numarası güncellenemedi. Lütfen konsolu kontrol edin.");
        }
    }
};


window.nobetciSil = async function(id) {
  if (confirm('Bu nöbetçiyi silmek istediğinize emin misiniz?')) {
    try {
      const response = await fetch(`/api/nobetci/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`);
      } else {
        console.log("nobetciSil:", data.message || "Nöbetçi başarıyla silindi.");
        const nobetcilerGetirildi = await getNobetciler(); // Listeyi yenile
        if (nobetcilerGetirildi) {
            if (typeof window.refreshCalendarData === 'function') {
                await window.refreshCalendarData();
            }
            if (typeof hesaplaToplamKrediVeDagit === 'function') {
                await hesaplaToplamKrediVeDagit();
            }
        } else {
            alert("Nöbetçi silindi ancak liste güncellenemediği için krediler dağıtılamadı.");
        }
      }
    } catch (error) {
      console.error("nobetciSil: Nöbetçi silinirken JS hatası:", error);
      alert("Nöbetçi silinemedi. Lütfen konsolu kontrol edin.");
    }
  }
};

window.sifreSifirla = async function(id) {
  if (confirm('Bu nöbetçinin şifresini sıfırlamak istediğinize emin misiniz?')) {
    try {
      const response = await fetch(`/api/nobetci/reset-password/${id}`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || `Sunucu hatası: ${response.status}`);
      } else {
        alert('Yeni şifre: ' + data.newPassword + '\nLütfen bu şifreyi kullanıcıya iletin.');
      }
    } catch (error) {
      console.error("sifreSifirla: Şifre sıfırlanırken JS hatası:", error);
      alert("Şifre sıfırlanamadı. Lütfen konsolu kontrol edin.");
    }
  }
};