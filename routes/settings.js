console.log("--- settings.js dosyası yüklendi! ---");

// routes/settings.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // Veritabanı bağlantısı

const RESORT_CONFIG_KEY = 'resort_config'; // Ayar anahtarı için sabit

// Yeniden sıralama ayarlarını getir
router.get('/resort-config', (req, res) => {
    db.get("SELECT ayar_value FROM uygulama_ayarlari WHERE ayar_key = ?", [RESORT_CONFIG_KEY], (err, row) => {
        if (err) {
            console.error("Yeniden sıralama ayarları getirilirken DB hatası:", err.message);
            return res.status(500).json({ error: "Ayar alınırken bir sunucu hatası oluştu." });
        }
        if (row && row.ayar_value) {
            try {
                // Veritabanından gelen JSON string'i parse et
                res.json(JSON.parse(row.ayar_value));
            } catch (parseError) {
                console.error("Yeniden sıralama ayarları JSON parse hatası:", parseError.message);
                // Eğer parse edilemezse, bozuk veri olduğunu belirt
                res.status(500).json({ error: "Ayar verisi bozuk." });
            }
        } else {
            // Eğer veritabanında bu ayar bulunamazsa, varsayılan bir konfigürasyon döndür
            const defaultConfig = { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };
            console.log("resort_config ayarı bulunamadı, varsayılan gönderiliyor.");
            res.json(defaultConfig);
        }
    });
});

// Yeniden sıralama ayarlarını kaydet/güncelle
router.post('/resort-config', (req, res) => {
    const newConfig = req.body; // Gelen ayar objesi

    // Gerekli alanların varlığını kontrol et
    if (typeof newConfig.aktif === 'undefined' ||
        typeof newConfig.baslangicYili === 'undefined' ||
        typeof newConfig.baslangicHaftasi === 'undefined' ||
        typeof newConfig.baslangicNobetciIndex === 'undefined') {
        return res.status(400).json({ error: 'Eksik ayar parametreleri.' });
    }

    const configValue = JSON.stringify(newConfig); // Obje'yi JSON string'ine çevir

    // Veritabanına kaydet (varsa üzerine yaz)
    db.run(
        "INSERT OR REPLACE INTO uygulama_ayarlari (ayar_key, ayar_value) VALUES (?, ?)",
        [RESORT_CONFIG_KEY, configValue],
        function(err) {
            if (err) {
                console.error("Yeniden sıralama ayarları kaydedilirken DB hatası:", err.message);
                return res.status(500).json({ error: "Ayar kaydedilirken bir sunucu hatası oluştu." });
            }
            res.status(200).json({ message: "Yeniden sıralama ayarları başarıyla kaydedildi." });
        }
    );
});

// Yeniden sıralama ayarlarını sil (varsayılana döndür)
// Bu endpoint, "Sıralamayı İptal Et" butonu kaldırıldığı için şu anda calendar.js tarafından çağrılmıyor olabilir.
// İhtiyaç duyulmuyorsa kaldırılabilir veya ileride kullanılmak üzere bırakılabilir.
router.delete('/resort-config', (req, res) => {
    console.log("DELETE /api/settings/resort-config çağrıldı.");
    const defaultConfig = JSON.stringify({ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 });
    db.run(
        "INSERT OR REPLACE INTO uygulama_ayarlari (ayar_key, ayar_value) VALUES (?, ?)",
        [RESORT_CONFIG_KEY, defaultConfig], // Varsayılan ayarı kaydet
        function(err) {
            if (err) {
                console.error("Yeniden sıralama ayarları silinirken (varsayılana döndürülürken) DB hatası:", err.message);
                return res.status(500).json({ error: "Ayar silinirken (varsayılana döndürülürken) bir sunucu hatası oluştu." });
            }
            res.status(200).json({ message: "Yeniden sıralama ayarları varsayılana döndürüldü." });
        }
    );
});

module.exports = router; // Router'ı export etmeyi unutmayın
