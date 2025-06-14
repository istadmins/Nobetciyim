const { body, param, query, validationResult } = require('express-validator');

// Common validation rules
const validationRules = {
  // User validation
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Kullanıcı adı 3-50 karakter arasında olmalıdır')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Kullanıcı adı sadece harf, rakam, tire ve alt çizgi içerebilir'),

  password: body('password')
    .isLength({ min: 6, max: 100 })
    .withMessage('Şifre en az 6 karakter olmalıdır'),

  email: body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Geçerli bir e-posta adresi giriniz'),

  // Nobetci validation
  nobetciName: body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nöbetçi adı 2-100 karakter arasında olmalıdır')
    .matches(/^[a-zA-ZçğıöşüÇĞIİÖŞÜ\s]+$/)
    .withMessage('Nöbetçi adı sadece harf ve boşluk içerebilir'),

  kredi: body('kredi')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Kredi 0-10000 arasında bir sayı olmalıdır'),

  telegramId: body('telegram_id')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Telegram ID çok uzun'),

  telefonNo: body('telefon_no')
    .optional()
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Geçerli bir telefon numarası giriniz'),

  // ID validation
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('Geçerli bir ID giriniz'),

  // Time validation
  time: body(['baslangic_saat', 'bitis_saat'])
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Geçerli bir saat formatı giriniz (HH:MM)'),

  // Date validation
  date: body('tarih')
    .optional()
    .isISO8601()
    .withMessage('Geçerli bir tarih formatı giriniz'),

  // Rule validation
  kuralAdi: body('kural_adi')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Kural adı 2-100 karakter arasında olmalıdır'),

  // Year and week validation
  yil: [
    body('yil').optional().isInt({ min: 2020, max: 2050 }).withMessage('Geçerli bir yıl giriniz'),
    query('yil').optional().isInt({ min: 2020, max: 2050 }).withMessage('Geçerli bir yıl giriniz')
  ],

  hafta: [
    body('hafta').optional().isInt({ min: 1, max: 53 }).withMessage('Hafta 1-53 arasında olmalıdır'),
    query('hafta').optional().isInt({ min: 1, max: 53 }).withMessage('Hafta 1-53 arasında olmalıdır')
  ]
};

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Geçersiz veri',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Sanitize input data
const sanitizeInput = (data) => {
  if (typeof data === 'string') {
    return data.trim().replace(/[<>]/g, '');
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return data;
};

module.exports = {
  validationRules,
  validate,
  sanitizeInput
};