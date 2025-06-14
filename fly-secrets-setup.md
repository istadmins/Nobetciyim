# Fly.io Secrets Setup

Before deploying, you need to set your environment variables as secrets in Fly.io.

## Required Secrets

Run these commands in your terminal (replace the values with your actual values):

```bash
# JWT Secret (CRITICAL - generate a secure random string)
fly secrets set JWT_SECRET="your-super-secret-jwt-key-change-this-to-something-very-secure-and-random"

# Internal API Token (already generated for you)
fly secrets set INTERNAL_API_TOKEN="15f577a94e19b6137f19826a6ee7aab8a8c65a89ffbb446964f40fac0ae434bc"

# Email Configuration (if you want password reset functionality)
fly secrets set SES_SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
fly secrets set SES_SMTP_PORT="587"
fly secrets set SES_SMTP_USER="your-ses-smtp-username"
fly secrets set SES_SMTP_PASSWORD="your-ses-smtp-password"
fly secrets set EMAIL_FROM_SES_SMTP="noreply@yourdomain.com"

# Telegram Bot (optional - only if you want Telegram notifications)
fly secrets set TELEGRAM_BOT_TOKEN="your-telegram-bot-token-from-botfather"

# Security Settings
fly secrets set BCRYPT_ROUNDS="12"
fly secrets set SESSION_TIMEOUT="8h"
```

## Optional Secrets

```bash
# Rate Limiting (optional - has defaults)
fly secrets set RATE_LIMIT_WINDOW_MS="900000"
fly secrets set RATE_LIMIT_MAX_REQUESTS="100"

# Debug logging (optional)
fly secrets set CRON_DEBUG_LOGGING="false"
```

## Verify Secrets

After setting secrets, verify them:

```bash
fly secrets list
```

## Deploy

After setting secrets, deploy your app:

```bash
fly deploy
```

## Important Notes

1. **JWT_SECRET** is CRITICAL - generate a secure random string for this
2. **INTERNAL_API_TOKEN** is already generated and provided above
3. **TELEGRAM_BOT_TOKEN** is optional - only needed if you want Telegram notifications
4. **Email settings** are optional - only needed if you want password reset functionality

## Generate Secure JWT_SECRET

You can generate a secure JWT_SECRET using:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Or use an online generator like: https://generate-secret.vercel.app/64