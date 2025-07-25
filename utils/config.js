// Nobetciyim/utils/config.js
const logger = require('./logger');

/**
 * Configuration management utility
 * Centralizes environment variable handling and provides defaults
 */
class Config {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.env === 'development';
        this.isProduction = this.env === 'production';
        this.isTest = this.env === 'test';
        
        // Validate required environment variables
        this.validateRequiredEnvVars();
    }

    /**
     * Server configuration
     */
    get server() {
        return {
            port: parseInt(process.env.PORT) || 80,
            host: process.env.HOST || '0.0.0.0',
            trustProxy: process.env.TRUST_PROXY === 'true' || true
        };
    }

    /**
     * Database configuration
     */
    get database() {
        return {
            path: process.env.DB_PATH || './data/nobetciyim.db',
            backupPath: process.env.DB_BACKUP_PATH || './data/backups/',
            maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 10
        };
    }

    /**
     * Security configuration
     */
    get security() {
        return {
            jwtSecret: process.env.JWT_SECRET || this.generateFallbackSecret(),
            jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
            bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
            sessionSecret: process.env.SESSION_SECRET || this.generateFallbackSecret(),
            allowedOrigins: process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : ['*']
        };
    }

    /**
     * Rate limiting configuration
     */
    get rateLimit() {
        return {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
            authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,
            passwordResetWindowMs: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
            passwordResetMaxRequests: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS) || 3
        };
    }

    /**
     * Telegram configuration
     */
    get telegram() {
        return {
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID,
            enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
        };
    }

    /**
     * Email configuration
     */
    get email() {
        return {
            smtp: {
                host: process.env.SES_SMTP_HOST,
                port: parseInt(process.env.SES_SMTP_PORT) || 587,
                user: process.env.SES_SMTP_USER,
                password: process.env.SES_SMTP_PASSWORD,
                from: process.env.EMAIL_FROM_SES_SMTP
            },
            enabled: !!(process.env.SES_SMTP_HOST && process.env.SES_SMTP_USER)
        };
    }

    /**
     * Logging configuration
     */
    get logging() {
        return {
            level: process.env.LOG_LEVEL || (this.isProduction ? 'info' : 'debug'),
            maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
            maxSize: process.env.LOG_MAX_SIZE || '5m',
            enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false'
        };
    }

    /**
     * Cron job configuration
     */
    get cron() {
        return {
            timezone: process.env.CRON_TIMEZONE || 'Europe/Istanbul',
            creditUpdateEnabled: process.env.CRON_CREDIT_UPDATE_ENABLED !== 'false',
            weeklyAssignmentEnabled: process.env.CRON_WEEKLY_ASSIGNMENT_ENABLED !== 'false',
            shiftChangeEnabled: process.env.CRON_SHIFT_CHANGE_ENABLED !== 'false'
        };
    }

    /**
     * Application-specific configuration
     */
    get app() {
        return {
            name: 'Nobetciyim',
            version: process.env.npm_package_version || '1.0.0',
            defaultPasswordLength: parseInt(process.env.DEFAULT_PASSWORD_LENGTH) || 8,
            maxFileUploadSize: process.env.MAX_FILE_UPLOAD_SIZE || '10mb',
            sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000 // 24 hours
        };
    }

    /**
     * Validate required environment variables
     */
    validateRequiredEnvVars() {
        const required = [];
        const warnings = [];

        // Critical variables
        if (!process.env.JWT_SECRET && this.isProduction) {
            required.push('JWT_SECRET');
        }

        // Important but not critical
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            warnings.push('TELEGRAM_BOT_TOKEN - Telegram notifications will be disabled');
        }

        if (!process.env.SES_SMTP_HOST) {
            warnings.push('SES_SMTP_HOST - Email notifications will be disabled');
        }

        // Log warnings
        warnings.forEach(warning => {
            logger.warn(`Missing environment variable: ${warning}`);
        });

        // Throw error for required variables
        if (required.length > 0) {
            const message = `Missing required environment variables: ${required.join(', ')}`;
            logger.error(message);
            throw new Error(message);
        }
    }

    /**
     * Generate a fallback secret for development
     */
    generateFallbackSecret() {
        if (this.isProduction) {
            throw new Error('Secret keys must be provided in production environment');
        }
        
        const fallback = 'dev-fallback-secret-' + Math.random().toString(36).substring(7);
        logger.warn(`Using fallback secret: ${fallback.substring(0, 10)}... (development only)`);
        return fallback;
    }

    /**
     * Get configuration for a specific module
     */
    getModuleConfig(moduleName) {
        const moduleConfigs = {
            server: this.server,
            database: this.database,
            security: this.security,
            rateLimit: this.rateLimit,
            telegram: this.telegram,
            email: this.email,
            logging: this.logging,
            cron: this.cron,
            app: this.app
        };

        return moduleConfigs[moduleName] || null;
    }

    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature) {
        const features = {
            telegram: this.telegram.enabled,
            email: this.email.enabled,
            cronJobs: this.cron.creditUpdateEnabled,
            logging: true
        };

        return features[feature] !== undefined ? features[feature] : false;
    }

    /**
     * Get all configuration as a safe object (without secrets)
     */
    getSafeConfig() {
        return {
            env: this.env,
            server: {
                port: this.server.port,
                host: this.server.host
            },
            features: {
                telegram: this.telegram.enabled,
                email: this.email.enabled,
                cronJobs: this.cron.creditUpdateEnabled
            },
            app: this.app
        };
    }
}

// Export singleton instance
module.exports = new Config();