const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authorizeRole } = require('./auth');

// Sadece admin erişebilir
router.get('/users', authorizeAdmin, (req, res) => {
  db.all('SELECT id, username FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


// Yeni kullanıcı ekle
router.post('/users', authorizeRole('admin'), async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hashedPassword, role],
    function(err) {
      if (err) return res.status(400).json({ error: 'Kullanıcı mevcut' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Kullanıcı sil
router.delete('/users/:id', authorizeRole('admin'), (req, res) => {
  db.run(
    'DELETE FROM users WHERE id = ?',
    [req.params.id],
    function(err) {
      if (this.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      res.json({ message: `${this.changes} kullanıcı silindi` });
    }
  );
});

module.exports = router;
