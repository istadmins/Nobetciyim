const db = require('./db');
const bcrypt = require('bcryptjs');

// Admin bilgileri
const username = 'admin';
const password = 'btmHD1345'; // İstediğiniz şifreyi belirleyin
const hashedPassword = bcrypt.hashSync(password, 10);

// Admin kullanıcısı ekle
db.run(
  'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
  [username, hashedPassword, 'admin'],
  function(err) {
    if (err) {
      console.error('Hata:', err.message);
    } else {
      console.log('Admin kullanıcısı oluşturuldu, ID:', this.lastID);
    }
    db.close();
  }
);
