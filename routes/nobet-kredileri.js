const express = require('express');
const router = express.Router();
const db = require('../db');

// Tüm nöbet kredilerini listele
router.get('/', (req, res) => {
  db.all('SELECT * FROM nobet_kredileri', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Nöbet kredilerini kaydet
router.post('/', (req, res) => {
  const krediBilgileri = req.body;
  
  db.serialize(() => {
    // Önce tüm kayıtları sil
    db.run('DELETE FROM nobet_kredileri', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Yeni kayıtları ekle
      const stmt = db.prepare('INSERT INTO nobet_kredileri (kredi_dakika, baslangic_saat, bitis_saat) VALUES (?, ?, ?)');
      
      krediBilgileri.forEach(kredi => {
        stmt.run([kredi.kredi_dakika, kredi.baslangic_saat, kredi.bitis_saat]);
      });
      
      stmt.finalize();
      res.json({ message: 'Kredi bilgileri başarıyla kaydedildi' });
    });
  });
});



module.exports = router;
