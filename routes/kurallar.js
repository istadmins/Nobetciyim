const express = require('express');
const router = express.Router();
const db = require('../db');

// Tüm kuralları listele
router.get('/', (req, res) => {
  db.all('SELECT * FROM kredi_kurallari', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Yeni kural ekle
router.post('/', (req, res) => {
  const { kredi, kural_adi, tarih } = req.body;
  db.run(
    'INSERT INTO kredi_kurallari (kural_adi, kredi, tarih) VALUES (?, ?, ?)',
    [kural_adi, kredi, tarih],
    function(err) {
      if (err) return res.status(400).json({ error: 'Kural zaten mevcut' });
      res.json({ id: this.lastID, kural_adi, kredi, tarih });
    }
  );
});

// Kural sil (sabit kurallar hariç)
router.delete('/:id', (req, res) => {
  db.get('SELECT sabit_kural FROM kredi_kurallari WHERE id = ?', [req.params.id], (err, row) => {
    if (row.sabit_kural) return res.status(403).json({ error: 'Sabit kural silinemez' });
    db.run('DELETE FROM kredi_kurallari WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Kural silindi' });
    });
  });
});

// PUT /api/kurallar
router.put('/', (req, res) => {
  const { id, kural_adi, kredi } = req.body;
  if (id) {
    db.run(
      'UPDATE kredi_kurallari SET kredi = ? WHERE id = ?',
      [kredi, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Kural güncellendi' });
      }
    );
  } else if (kural_adi) {
    db.run(
      'UPDATE kredi_kurallari SET kredi = ? WHERE kural_adi = ?',
      [kredi, kural_adi],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Kural güncellendi' });
      }
    );
  } else {
    res.status(400).json({ error: 'Güncelleme için id veya kural_adi gerekli' });
  }
});

module.exports = router;
