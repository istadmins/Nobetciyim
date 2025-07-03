const db = require('./db');

async function checkWeek28() {
    try {
        console.log('=== 28. Hafta Kontrolü ===');
        
        // 28. hafta için manuel atama var mı?
        const week28Data = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM takvim_aciklamalari WHERE yil = 2025 AND hafta = 28", [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('28. Hafta Takvim Verisi:', week28Data);
        
        // Tüm nöbetçileri al
        const nobetciler = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM Nobetciler ORDER BY id", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log('\nTüm Nöbetçiler:', nobetciler.map(n => ({ id: n.id, name: n.name })));
        
        // 28. hafta için otomatik rotasyon hesapla
        const hafta28 = 28;
        const nobetciIndex = (hafta28 - 1) % nobetciler.length;
        const otomatikNobetci = nobetciler[nobetciIndex];
        
        console.log(`\n28. Hafta Otomatik Rotasyon:`);
        console.log(`- Hafta: ${hafta28}`);
        console.log(`- Nöbetçi Sayısı: ${nobetciler.length}`);
        console.log(`- Index: ${nobetciIndex}`);
        console.log(`- Seçilen Nöbetçi: ${otomatikNobetci.name}`);
        
        // Eğer manuel atama varsa, o nöbetçiyi de göster
        if (week28Data && week28Data.nobetci_id_override) {
            const manuelNobetci = nobetciler.find(n => n.id === week28Data.nobetci_id_override);
            console.log(`\n28. Hafta Manuel Atama:`);
            console.log(`- Manuel Atanan Nöbetçi: ${manuelNobetci ? manuelNobetci.name : 'Bilinmeyen'}`);
        } else {
            console.log('\n28. Hafta için manuel atama yok, otomatik rotasyon kullanılacak.');
        }
        
    } catch (error) {
        console.error('Hata:', error);
    } finally {
        process.exit(0);
    }
}

checkWeek28(); 