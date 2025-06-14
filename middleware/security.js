const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Rate limiting configuration
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100, message = 'Çok fazla istek gönderildi') => {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({ success: false, error: message });
    }
  });
};

// General rate limiter
const generalLimiter = createRateLimit(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // 100 requests per window
);

// Strict rate limiter for auth endpoints
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.'
);

// Password reset rate limiter
const passwordResetLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts per hour
  'Çok fazla şifre sıfırlama isteği. 1 saat sonra tekrar deneyin.'
);

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, error: 'Erişim token\'ı gerekli' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Invalid token attempt from IP: ${req.ip}`);
      return res.status(403).json({ success: false, error: 'Geçersiz token' });
    }
    req.user = user;
    next();
  });
};

// Admin role check middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    logger.warn(`Unauthorized admin access attempt by user: ${req.user?.username || 'unknown'}`);
    res.status(403).json({ success: false, error: 'Admin yetkisi gerekli' });
  }
};

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Sunucu hatası oluştu',
    ...(isDevelopment && { stack: err.stack })
  });
};

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  authenticateToken,
  requireAdmin,
  securityHeaders,
  requestLogger,
  errorHandler
};