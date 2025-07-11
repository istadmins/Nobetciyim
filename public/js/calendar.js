// public/js/calendar.js

document.addEventListener('DOMContentLoaded', async () => {
    // Global değişkenler
    let nav = 0; // Ay navigasyonu için
    const calendarBody = document.getElementById('takvimBody');
    const currentMonthYearDisplay = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const yenidenSiralaBtn = document.getElementById('yenidenSiralaBtn');

    const trMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    let ozelGunKurallari = [];
    let nobetciler = [];
    let takvimVerileri = [];
    let currentYearForData = new Date().getFullYear();

    let nobetSiralamaAyarlari = {
        aktif: false,
        baslangicYili: 0,
        baslangicHaftasi: 0,
        baslangicNobetciIndex: 0,
    };

    // Sürüklenen elemanın bilgilerini tutmak için global değişken.
    // handleDrop içinde bunun bir kopyası kullanılacak.
    let draggedItemPayload = null;

    let izinler = [];

    // --- API Çağrıları ---
    async function fetchResortConfig() {
        try {
            const response = await fetch('/api/settings/resort-config', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
            if (!response.ok) {
                console.error("Yeniden sıralama ayarları alınamadı:", response.status, await response.text());
                return { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };
            }
            return await response.json();
        } catch (error) {
            console.error("Yeniden sıralama ayarları alınırken JS hatası:", error);
            return { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };
        }
    }

    async function saveResortConfig(config) {
        try {
            const response = await fetch('/api/settings/resort-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify(config)
            });
            if (!response.ok) {
                alert("Yeniden sıralama ayarları kaydedilemedi: " + response.status);
                return false;
            }
            console.log("Yeniden sıralama ayarları kaydedildi.");
            nobetSiralamaAyarlari = config;
            return true;
        } catch (error) {
            console.error("Yeniden sıralama ayarları kaydedilirken JS hatası:", error);
            alert("Yeniden sıralama ayarları kaydedilemedi.");
            return false;
        }
    }

    function getTurkishHolidays(year) {
        const holidays = [
            { kural_adi: "Yılbaşı", tarih: `${year}-01-01`, sourceType: 'system' },
            { kural_adi: "Ulusal Egemenlik ve Çocuk Bayramı", tarih: `${year}-04-23`, sourceType: 'system' },
            { kural_adi: "Emek ve Dayanışma Günü", tarih: `${year}-05-01`, sourceType: 'system' },
            { kural_adi: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", tarih: `${year}-05-19`, sourceType: 'system' },
            { kural_adi: "Demokrasi ve Milli Birlik Günü", tarih: `${year}-07-15`, sourceType: 'system' },
            { kural_adi: "Zafer Bayramı", tarih: `${year}-08-30`, sourceType: 'system' },
            { kural_adi: "Cumhuriyet Bayramı", tarih: `${year}-10-29`, sourceType: 'system' }
        ];
        if (year === 2025) {
            holidays.push({ kural_adi: "Ramazan Bayramı Arifesi", tarih: "2025-03-29", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 1. Gün", tarih: "2025-03-30", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 2. Gün", tarih: "2025-03-31", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 3. Gün", tarih: "2025-04-01", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı Arifesi", tarih: "2025-06-05", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 1. Gün", tarih: "2025-06-06", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 2. Gün", tarih: "2025-06-07", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 3. Gün", tarih: "2025-06-08", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 4. Gün", tarih: "2025-06-09", sourceType: 'system' });
        }
        if (year === 2024) {
             holidays.push({ kural_adi: "Ramazan Bayramı Arifesi", tarih: "2024-04-09", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 1. Gün", tarih: "2024-04-10", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 2. Gün", tarih: "2024-04-11", sourceType: 'system' });
            holidays.push({ kural_adi: "Ramazan Bayramı 3. Gün", tarih: "2024-04-12", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı Arifesi", tarih: "2024-06-15", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 1. Gün", tarih: "2024-06-16", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 2. Gün", tarih: "2024-06-17", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 3. Gün", tarih: "2024-06-18", sourceType: 'system' });
            holidays.push({ kural_adi: "Kurban Bayramı 4. Gün", tarih: "2024-06-19", sourceType: 'system' });
        }
        return holidays;
    }

    async function fetchUserDefinedOzelGunler() {
        try {
            const response = await fetch('/api/kurallar', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
            if (!response.ok) return [];
            const data = await response.json();
            return data.filter(k => k.tarih && k.kural_adi !== 'Hafta Sonu').map(k => ({ ...k, sourceType: 'user' }));
        } catch (error) { console.error("Error fetching user defined special days:", error); return []; }
    }

    async function combineAndSetOzelGunler(yearToUse) {
        const userDefined = await fetchUserDefinedOzelGunler();
        const turkishHolidays = getTurkishHolidays(yearToUse);
        const combined = [...userDefined];
        turkishHolidays.forEach(th => {
            if (!userDefined.some(udg => udg.tarih === th.tarih)) {
                combined.push(th);
            }
        });
        ozelGunKurallari = combined;
    }

    async function fetchNobetciler() {
        try {
            const response = await fetch('/api/nobetci', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
            if (!response.ok) { console.error("Error fetching guards: Status " + response.status); return [];}
            const data = await response.json();
            return data.sort((a,b) => a.id - b.id);
        } catch (error) { console.error("Error fetching guards:", error); return []; }
    }

    async function fetchTakvimVerileri(yil) {
        try {
            const response = await fetch(`/api/remarks?yil=${yil}`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
            if (!response.ok) { console.error(`Takvim verileri (${yil}) yüklenemedi. Durum:`, response.status); return [];}
            return await response.json();
        } catch (error) { console.error(`Takvim verileri (${yil}) alınırken hata:`, error); return []; }
    }

    async function saveTakvimData(yil, hafta, dataToSave) {
        try {
            const payload = {
                yil: parseInt(yil),
                hafta: parseInt(hafta),
                aciklama: dataToSave.aciklama,
                nobetci_id_override: dataToSave.nobetci_id_override
            };
            const response = await fetch('/api/remarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify(payload)
            });
            const responseData = await response.json();
            if (!response.ok) {
                alert(responseData.error || `Takvim verisi kaydedilemedi: ${response.status}`);
                return false;
            }
            console.log("Takvim verisi başarıyla kaydedildi/güncellendi:", `Yıl: ${yil}, Hafta: ${hafta}`, dataToSave);
            const existingDataIndex = takvimVerileri.findIndex(d => d.yil === parseInt(yil) && d.hafta === parseInt(hafta));
            if (existingDataIndex > -1) {
                takvimVerileri[existingDataIndex].aciklama = dataToSave.aciklama;
                takvimVerileri[existingDataIndex].nobetci_id_override = dataToSave.nobetci_id_override;
                if (dataToSave.nobetci_id_override) {
                    const nobetci = nobetciler.find(n => n.id === dataToSave.nobetci_id_override);
                    takvimVerileri[existingDataIndex].nobetci_adi_override = nobetci ? nobetci.name : null;
                } else {
                    takvimVerileri[existingDataIndex].nobetci_adi_override = null;
                }
            } else {
                let nobetciAdiOverride = null;
                if (dataToSave.nobetci_id_override) {
                    const nobetci = nobetciler.find(n => n.id === dataToSave.nobetci_id_override);
                    nobetciAdiOverride = nobetci ? nobetci.name : null;
                }
                takvimVerileri.push({
                    yil: parseInt(yil),
                    hafta: parseInt(hafta),
                    aciklama: dataToSave.aciklama,
                    nobetci_id_override: dataToSave.nobetci_id_override,
                    nobetci_adi_override: nobetciAdiOverride
                });
            }
            return true;
        } catch (error) {
            console.error("Takvim verisi kaydedilirken hata:", error);
            alert("Takvim verisi kaydedilemedi. Konsolu kontrol edin.");
            return false;
        }
    }

    function getWeekOfYear(date) {
        const target = new Date(date.valueOf());
        const dayNr = (date.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
        }
        return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
    }

    async function fetchIzinler(yil, ay) {
        // Ayın başı ve sonu
        const firstDay = new Date(yil, ay, 1);
        const lastDay = new Date(yil, ay + 1, 0);
        const baslangic = firstDay.toISOString();
        const bitis = lastDay.toISOString();
        try {
            const response = await fetch(`/api/nobetci/izinler?baslangic=${baslangic}&bitis=${bitis}`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
            if (!response.ok) return [];
            return await response.json();
        } catch (e) { return []; }
    }

    async function loadCalendar() {
        const dt = new Date();
        if (nav !== 0) {
            dt.setMonth(new Date().getMonth() + nav, 1);
        }
        const month = dt.getMonth();
        const year = dt.getFullYear();

        if (year !== currentYearForData) {
            currentYearForData = year;
            takvimVerileri = await fetchTakvimVerileri(currentYearForData);
            await combineAndSetOzelGunler(currentYearForData);
        }
        // İzinleri çek
        izinler = await fetchIzinler(year, month);

        currentMonthYearDisplay.innerText = `${trMonths[month]} ${year}`;
        calendarBody.innerHTML = '';
        const firstDayOfMonth = new Date(year, month, 1);
        let dayOfWeekOfFirstDay = (firstDayOfMonth.getDay() + 6) % 7;
        let weekRow = null;
        let currentGlobalWeekNumber = -1;
        const bugunTarihi = new Date();
        bugunTarihi.setHours(0,0,0,0);

        for (let i = 0; i < 42; i++) {
            const daySquareDate = new Date(year, month, (i - dayOfWeekOfFirstDay) + 1);
            const daySquareDay = daySquareDate.getDate();
            const daySquareMonth = daySquareDate.getMonth();
            const daySquareYear = daySquareDate.getFullYear();

            if (i % 7 === 0) {
                weekRow = calendarBody.insertRow();
                currentGlobalWeekNumber = getWeekOfYear(daySquareDate);
                const weekCell = weekRow.insertCell();
                weekCell.textContent = currentGlobalWeekNumber;
                weekCell.classList.add('week-number-cell');
                const monthCell = weekRow.insertCell();
                monthCell.classList.add('month-name-cell');
            }

            const dayCell = weekRow.insertCell();
            dayCell.textContent = daySquareDay;

            if (daySquareYear < year || (daySquareYear === year && daySquareMonth < month)) {
                dayCell.classList.add('prev-month-day');
            } else if (daySquareYear > year || (daySquareYear === year && daySquareMonth > month)) {
                dayCell.classList.add('next-month-day');
            } else {
                dayCell.dataset.date = `${daySquareYear}-${String(daySquareMonth + 1).padStart(2, '0')}-${String(daySquareDay).padStart(2, '0')}`;
                if (daySquareDay === new Date().getDate() && daySquareMonth === new Date().getMonth() && daySquareYear === new Date().getFullYear() && nav === 0) {
                    dayCell.classList.add('current-day');
                }
                const ozelGun = ozelGunKurallari.find(k => {
                    const kuralTarihObj = new Date(k.tarih + "T00:00:00");
                    const dayCellDateObj = new Date(dayCell.dataset.date + "T00:00:00");
                    return kuralTarihObj.getTime() === dayCellDateObj.getTime();
                });
                if (ozelGun) {
                    dayCell.classList.add('special-day');
                    if (ozelGun.sourceType === 'user') dayCell.classList.add('user-defined-holiday');
                    else if (ozelGun.sourceType === 'system') dayCell.classList.add('official-holiday');
                    const tooltip = document.createElement('span');
                    tooltip.classList.add('tooltip-text');
                    tooltip.textContent = ozelGun.kural_adi;
                    dayCell.appendChild(tooltip);
                }
                const dayOfWeek = daySquareDate.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) dayCell.classList.add('weekend-day');
            }

            if (i % 7 === 6) {
                const dutyCell = weekRow.insertCell();
                dutyCell.classList.add('duty-cell');
                const remarkCell = weekRow.insertCell();
                remarkCell.classList.add('remark-cell');
                remarkCell.setAttribute('contenteditable', 'true');
                remarkCell.dataset.year = daySquareYear;
                remarkCell.dataset.week = currentGlobalWeekNumber;

                const haftalikVeri = takvimVerileri.find(d => d.yil === daySquareYear && d.hafta === currentGlobalWeekNumber);
                remarkCell.textContent = haftalikVeri ? haftalikVeri.aciklama : "";

                let nobetciAdi = "-";
                let nobetciIdForDrag = null;
                let yedekTip = null;
                let yedekAdi = null;
                // Haftanın asıl nöbetçisi (dutyCell)
                if (haftalikVeri && typeof haftalikVeri.nobetci_id_override === 'number') {
                    const manuelAtananNobetci = nobetciler.find(n => n.id === haftalikVeri.nobetci_id_override);
                    nobetciAdi = manuelAtananNobetci ? manuelAtananNobetci.name : 'Bilinmeyen (Manuel)';
                    nobetciIdForDrag = haftalikVeri.nobetci_id_override;
                    dutyCell.classList.add('manual-assignment');
                } else if (nobetciler.length > 0) {
                    let nobetciSira;
                    if (nobetSiralamaAyarlari.aktif &&
                        (daySquareYear > nobetSiralamaAyarlari.baslangicYili ||
                         (daySquareYear === nobetSiralamaAyarlari.baslangicYili && currentGlobalWeekNumber >= nobetSiralamaAyarlari.baslangicHaftasi))) {
                        let haftalarFarki = 0;
                        if (daySquareYear === nobetSiralamaAyarlari.baslangicYili) {
                            haftalarFarki = currentGlobalWeekNumber - nobetSiralamaAyarlari.baslangicHaftasi;
                        } else {
                            let baslangicYilindakiSonHafta = getWeekOfYear(new Date(nobetSiralamaAyarlari.baslangicYili, 11, 28));
                            haftalarFarki = baslangicYilindakiSonHafta - nobetSiralamaAyarlari.baslangicHaftasi;
                            for (let y = nobetSiralamaAyarlari.baslangicYili + 1; y < daySquareYear; y++) {
                                haftalarFarki += getWeekOfYear(new Date(y, 11, 28));
                            }
                            haftalarFarki += currentGlobalWeekNumber;
                        }
                        nobetciSira = (nobetSiralamaAyarlari.baslangicNobetciIndex + haftalarFarki) % nobetciler.length;
                    } else {
                        const yearStartDateForWeekCalc = new Date(daySquareYear, 0, 1);
                        const weeksSinceYearStart = currentGlobalWeekNumber - getWeekOfYear(yearStartDateForWeekCalc) + 1;
                        nobetciSira = (weeksSinceYearStart - 1 + nobetciler.length) % nobetciler.length;
                    }
                    if (nobetciler[nobetciSira]) {
                        nobetciAdi = nobetciler[nobetciSira].name;
                        nobetciIdForDrag = nobetciler[nobetciSira].id;
                    }
                    dutyCell.classList.remove('manual-assignment');
                }
                dutyCell.textContent = nobetciAdi;
                dutyCell.dataset.nobetciId = String(nobetciIdForDrag);
                dutyCell.dataset.year = daySquareYear;
                dutyCell.dataset.week = currentGlobalWeekNumber;

                const haftaninIlkGunu = new Date(daySquareYear, daySquareMonth, daySquareDay - 6);
                haftaninIlkGunu.setHours(0,0,0,0);

                if (haftaninIlkGunu >= bugunTarihi && nobetciler.length > 1) {
                    dutyCell.setAttribute('draggable', 'true');
                    dutyCell.addEventListener('dragstart', handleDragStart);
                    dutyCell.addEventListener('dragend', handleDragEnd);
                    dutyCell.addEventListener('dragover', handleDragOver);
                    dutyCell.addEventListener('drop', handleDrop);
                    dutyCell.style.cursor = 'grab';
                } else {
                    dutyCell.setAttribute('draggable', 'false');
                    dutyCell.style.cursor = 'default';
                }

                remarkCell.addEventListener('blur', async (e) => {
                    const yil = parseInt(e.target.dataset.year);
                    const hafta = parseInt(e.target.dataset.week);
                    const mevcutHaftaVerisi = takvimVerileri.find(d => d.yil === yil && d.hafta === hafta) || {};
                    await saveTakvimData(yil, hafta, {
                        aciklama: e.target.textContent.trim(),
                        nobetci_id_override: mevcutHaftaVerisi.nobetci_id_override
                    });
                });
            }
        }
        adjustRowSpansAndMonthNames();
    }

    // --- Sürükle-Bırak Fonksiyonları ---
    function handleDragStart(e) {
        const nobetciId = e.target.dataset.nobetciId;
        if (!nobetciId || nobetciId === "null") { // "null" string kontrolü
            console.warn("Sürüklenmeye çalışılan hücrede geçerli bir nobetciId yok veya 'null' string.", e.target.dataset);
            e.preventDefault();
            return;
        }
        e.target.classList.add('dragging');
        draggedItemPayload = { // Global değişkene atama
            nobetci_id: nobetciId,
            nobetci_adi: e.target.textContent,
            kaynakYil: parseInt(e.target.dataset.year),
            kaynakHafta: parseInt(e.target.dataset.week)
        };
        console.log("Drag Start:", draggedItemPayload);
        e.dataTransfer.effectAllowed = 'move';
        // dataTransfer'a sadece bir tanımlayıcı koymak yeterli, tüm obje yerine.
        // Tarayıcılar arası uyumluluk için text/plain kullanmak iyi bir pratiktir.
        e.dataTransfer.setData('application/json', JSON.stringify(draggedItemPayload));
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        // draggedItemPayload'u burada null yapmak, drop işlemi asenkron ise sorun yaratabilir.
        // Drop işlemi bittikten sonra null yapmak daha güvenli.
        // console.log("Drag End, draggedItemPayload:", draggedItemPayload);
        document.querySelectorAll('.duty-cell.drag-over').forEach(cell => {
            cell.classList.remove('drag-over');
        });
    }

    function handleDragOver(e) {
        e.preventDefault();
        if (e.target.classList.contains('duty-cell') && e.target.getAttribute('draggable') === 'true') {
             e.target.classList.add('drag-over');
             e.dataTransfer.dropEffect = 'move';
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    }
    document.addEventListener('dragleave', function(event) {
        if (event.target.classList && event.target.classList.contains('duty-cell')) {
            event.target.classList.remove('drag-over');
        }
    });

    async function handleDrop(e) {
        e.preventDefault();
        e.target.classList.remove('drag-over');

        let localDraggedItemInfo;
        try {
            // Öncelikle dataTransfer'dan veriyi almayı dene
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                localDraggedItemInfo = JSON.parse(data);
                console.log("Veri dataTransfer'dan alındı:", localDraggedItemInfo);
            } else {
                // dataTransfer boşsa (bazı tarayıcılarda veya durumlarda olabilir), global değişkene fallback yap
                console.warn("dataTransfer boş, global draggedItemPayload kullanılıyor.");
                if (draggedItemPayload) {
                    localDraggedItemInfo = { ...draggedItemPayload }; // Lokal kopya
                }
            }
        } catch (err) {
            console.error("Sürüklenen veri parse edilemedi veya alınamadı, globala fallback yapılıyor:", err);
            if (draggedItemPayload) {
                localDraggedItemInfo = { ...draggedItemPayload }; // Lokal kopya
            }
        }

        if (!localDraggedItemInfo || !localDraggedItemInfo.nobetci_id) { // nobetci_id var mı diye kontrol et
            console.error("HATA: handleDrop içinde localDraggedItemInfo veya nobetci_id tanımsız!", localDraggedItemInfo);
            draggedItemPayload = null; // Globali temizle
            return;
        }
        // Artık localDraggedItemInfo'nun 'kaynakYil' gibi özelliklere sahip olduğunu varsayabiliriz.

        if (!e.target.classList.contains('duty-cell') || e.target.getAttribute('draggable') !== 'true') {
            console.warn("Geçersiz bırakma hedefi.");
            draggedItemPayload = null;
            return;
        }

        const hedefYil = parseInt(e.target.dataset.year);
        const hedefHafta = parseInt(e.target.dataset.week);
        const hedeftekiMevcutNobetciIdStr = e.target.dataset.nobetciId;
        const hedeftekiMevcutNobetciId = (hedeftekiMevcutNobetciIdStr && hedeftekiMevcutNobetciIdStr !== "null") ? parseInt(hedeftekiMevcutNobetciIdStr) : null;

        if (localDraggedItemInfo.kaynakYil === hedefYil && localDraggedItemInfo.kaynakHafta === hedefHafta) {
            console.log("Aynı hücreye bırakıldı, işlem yok.");
            draggedItemPayload = null;
            return;
        }

        console.log("Drop Event İşleniyor:", {
            sürüklenen: localDraggedItemInfo,
            hedefYil, hedefHafta, hedeftekiMevcutNobetciId
        });

        // 1. Hedef haftaya sürüklenen nöbetçiyi ata
        const hedefVeri = takvimVerileri.find(d => d.yil === hedefYil && d.hafta === hedefHafta) || { aciklama: "" };
        await saveTakvimData(hedefYil, hedefHafta, {
            aciklama: hedefVeri.aciklama,
            nobetci_id_override: parseInt(localDraggedItemInfo.nobetci_id)
        });

        // 2. Kaynak haftaya (sürüklenenin eski yeri) hedefteki nöbetçiyi ata (swap)
        const kaynakVeri = takvimVerileri.find(d => d.yil === localDraggedItemInfo.kaynakYil && d.hafta === localDraggedItemInfo.kaynakHafta) || { aciklama: "" };
        await saveTakvimData(localDraggedItemInfo.kaynakYil, localDraggedItemInfo.kaynakHafta, {
            aciklama: kaynakVeri.aciklama,
            nobetci_id_override: hedeftekiMevcutNobetciId // Bu null olabilir
        });
        
        draggedItemPayload = null; // İşlem bittikten sonra global sürüklenen bilgiyi temizle
        await window.refreshCalendarData();
    }
    // --- Sürükle-Bırak Fonksiyonları SONU ---

    function adjustRowSpansAndMonthNames() {
        // ... (önceki implementasyon ile aynı)
        const rows = calendarBody.getElementsByTagName('tr');
        if (!rows.length) return;
        let lastProcessedMonthForSpan = "";
        let monthRowSpanStartIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].getElementsByTagName('td');
            if (cells.length < 3) continue;
            const monthCell = cells[1];
            let currentMonthInRow = "";
            const firstDayCellInRow = cells[2];
            const dayText = parseInt(firstDayCellInRow.textContent);
            const displayedYear = parseInt(currentMonthYearDisplay.innerText.split(" ")[1]);
            const displayedMonthIndex = trMonths.indexOf(currentMonthYearDisplay.innerText.split(" ")[0]);
            let tempDate;
            if (firstDayCellInRow.classList.contains('prev-month-day') && dayText > 20) {
                tempDate = new Date(displayedYear, displayedMonthIndex - 1, dayText);
            } else if (firstDayCellInRow.classList.contains('next-month-day') && dayText < 15) {
                tempDate = new Date(displayedYear, displayedMonthIndex + 1, dayText);
            } else {
                 let cellDateToCheck = null;
                 for(let k=2; k < cells.length - 2; k++){
                    if(cells[k] && cells[k].dataset.date && cells[k].textContent.trim() !== ""){
                        cellDateToCheck = new Date(cells[k].dataset.date + "T00:00:00");
                        break;
                    }
                 }
                 if(cellDateToCheck) tempDate = cellDateToCheck;
                 else tempDate = new Date(displayedYear, displayedMonthIndex, dayText);
            }
            currentMonthInRow = trMonths[tempDate.getMonth()];
            if (currentMonthInRow) {
                if (lastProcessedMonthForSpan !== currentMonthInRow) {
                    if (monthRowSpanStartIndex !== -1 && rows[monthRowSpanStartIndex].cells[1]) {
                        rows[monthRowSpanStartIndex].cells[1].rowSpan = i - monthRowSpanStartIndex;
                    }
                    monthCell.textContent = currentMonthInRow;
                    monthCell.style.display = '';
                    lastProcessedMonthForSpan = currentMonthInRow;
                    monthRowSpanStartIndex = i;
                } else {
                    if (monthCell) monthCell.style.display = 'none';
                }
            }
        }
        if (monthRowSpanStartIndex !== -1 && rows.length > 0 && rows[monthRowSpanStartIndex].cells[1]) {
            rows[monthRowSpanStartIndex].cells[1].rowSpan = rows.length - monthRowSpanStartIndex;
        }
    }

    function initButtons() {
        prevMonthBtn.addEventListener('click', async () => { nav--; await loadCalendar(); });
        nextMonthBtn.addEventListener('click', async () => { nav++; await loadCalendar(); });

        if (yenidenSiralaBtn) {
            yenidenSiralaBtn.addEventListener('click', async () => {
                if (!nobetciler || nobetciler.length === 0) {
                    alert("Sıralanacak nöbetçi bulunmamaktadır."); return;
                }
                let secimMesaji = "Lütfen başlangıç nöbetçisini seçin (numarasını girin):\n";
                nobetciler.forEach((nobetci, index) => { secimMesaji += `${index + 1}. ${nobetci.name}\n`; });
                const kullaniciSecimiStr = prompt(secimMesaji);
                if (kullaniciSecimiStr === null) return;
                const secilenIndexNum = parseInt(kullaniciSecimiStr);
                if (isNaN(secilenIndexNum) || secilenIndexNum < 1 || secilenIndexNum > nobetciler.length) {
                    alert("Geçersiz seçim."); return;
                }
                const secilenBaslangicNobetciIndex = secilenIndexNum - 1;
                const bugun = new Date();
                const gelecekHaftaBasi = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - bugun.getDay() + 1 + 7);
                const baslangicYili = gelecekHaftaBasi.getFullYear();
                const baslangicHaftasi = getWeekOfYear(gelecekHaftaBasi);
                
                // Debug log
                console.log('[WEB DEBUG] Bugün:', bugun.toISOString(), 'Gün:', bugun.getDay());
                console.log('[WEB DEBUG] Gelecek hafta başı:', gelecekHaftaBasi.toISOString());
                console.log('[WEB DEBUG] Başlangıç yılı:', baslangicYili, 'Başlangıç haftası:', baslangicHaftasi);
                const secilenNobetciAdi = nobetciler[secilenBaslangicNobetciIndex].name;

                if (confirm(`'${secilenNobetciAdi}' adlı nöbetçi, ${baslangicYili} yılı ${baslangicHaftasi}. haftasından itibaren başlayacak şekilde sıralama yapılacaktır. Onaylıyor musunuz?`)) {
                    const success = await saveResortConfig({
                        aktif: true,
                        baslangicYili: baslangicYili,
                        baslangicHaftasi: baslangicHaftasi,
                        baslangicNobetciIndex: secilenBaslangicNobetciIndex,
                    });
                    if (success) {
                        alert("Nöbet sıralama ayarları güncellendi. Takvim yenileniyor...");
                        await window.refreshCalendarData();
                    }
                }
            });
        }
    }

    window.refreshCalendarData = async () => {
        console.log("Takvim verileri yenileniyor...");
        nobetciler = await fetchNobetciler();
        nobetSiralamaAyarlari = await fetchResortConfig();
        await combineAndSetOzelGunler(currentYearForData);
        takvimVerileri = await fetchTakvimVerileri(currentYearForData);
        await loadCalendar();
    };

    // Başlangıç yüklemesi
    nobetciler = await fetchNobetciler();
    nobetSiralamaAyarlari = await fetchResortConfig();
    await combineAndSetOzelGunler(currentYearForData);
    takvimVerileri = await fetchTakvimVerileri(currentYearForData);
    initButtons();
    await loadCalendar();
});
