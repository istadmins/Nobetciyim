# Nobetciyim - Duty Schedule Management System

A comprehensive duty schedule management system built with Node.js, Express, and SQLite.

## Features

- 🔐 **Secure Authentication** - JWT-based authentication with bcrypt password hashing
- 👥 **User Management** - Admin and user roles with proper authorization
- 📅 **Schedule Management** - Dynamic duty scheduling with credit system
- 🤖 **Telegram Integration** - Automated notifications via Telegram bot
- 📧 **Email Notifications** - Password reset via Amazon SES SMTP
- 🔒 **Security** - Rate limiting, input validation, SQL injection protection
- 📊 **Logging** - Comprehensive logging with Winston
- 🐳 **Docker Support** - Production-ready Docker configuration

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm 8+
- SQLite3

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Nobetciyim
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

5. **Access the application**
   - Open http://localhost:80 in your browser
   - Default login page will be displayed

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=80
NODE_ENV=production

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-change-this-in-production

# Database Configuration
DB_PATH=./data/nobet.db

# Email Configuration (Amazon SES SMTP)
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=your-ses-smtp-username
SES_SMTP_PASSWORD=your-ses-smtp-password
EMAIL_FROM_SES_SMTP=noreply@yourdomain.com

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
INTERNAL_API_TOKEN=your-internal-api-token-here

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=8h
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Cron Job Configuration
CRON_DEBUG_LOGGING=false
```

## Docker Deployment

### Build and Run

```bash
# Build the image
docker build -t nobetciyim .

# Run the container
docker run -d \
  --name nobetciyim-app \
  -p 80:80 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  nobetciyim
```

### Docker Compose

```yaml
version: '3.8'
services:
  nobetciyim:
    build: .
    ports:
      - "80:80"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:80/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/initiate-password-reset` - Password reset

### Duty Management
- `GET /api/nobetci` - Get all duty officers
- `POST /api/nobetci` - Create duty officer
- `PUT /api/nobetci/:id` - Update duty officer
- `DELETE /api/nobetci/:id` - Delete duty officer
- `POST /api/nobetci/:id/set-aktif` - Set active duty officer

### Rules Management
- `GET /api/kurallar` - Get all rules
- `POST /api/kurallar` - Create rule
- `PUT /api/kurallar/:id` - Update rule
- `DELETE /api/kurallar/:id` - Delete rule

### Credits Management
- `GET /api/nobet-kredileri` - Get time credits
- `POST /api/nobet-kredileri` - Create time credit
- `PUT /api/nobet-kredileri/:id` - Update time credit
- `DELETE /api/nobet-kredileri/:id` - Delete time credit

### Calendar
- `GET /api/remarks` - Get calendar remarks
- `POST /api/remarks` - Create calendar remark
- `PUT /api/remarks/:id` - Update calendar remark

### Settings
- `GET /api/settings` - Get application settings
- `POST /api/settings` - Update application settings

## Database Schema

The application uses SQLite with the following main tables:

- **users** - Application users with authentication
- **Nobetciler** - Duty officers
- **kredi_kurallari** - Credit rules
- **nobet_kredileri** - Time-based credits
- **takvim_aciklamalari** - Calendar remarks and overrides
- **uygulama_ayarlari** - Application settings

## Security Features

- **Rate Limiting** - Prevents abuse with configurable limits
- **Input Validation** - Comprehensive validation using express-validator
- **SQL Injection Protection** - Parameterized queries
- **XSS Protection** - Input sanitization
- **CSRF Protection** - Security headers with Helmet
- **Password Security** - Bcrypt hashing with configurable rounds
- **JWT Security** - Secure token-based authentication

## Logging

The application uses Winston for structured logging:

- **Error logs** - `logs/error.log`
- **Combined logs** - `logs/combined.log`
- **Console output** - Development mode only

## Monitoring

### Health Check
- Endpoint: `GET /health`
- Returns application status and uptime

### Metrics
- Request logging with response times
- Error tracking and alerting
- Performance monitoring

## Development

### Scripts

```bash
npm run dev      # Start with nodemon
npm start        # Production start
npm test         # Run tests
npm run lint     # ESLint check
npm run lint:fix # Fix ESLint issues
```

### Code Structure

```
├── app.js                 # Main application file
├── db.js                  # Database configuration
├── routes/                # API routes
├── middleware/            # Custom middleware
├── utils/                 # Utility functions
├── public/                # Static files
├── data/                  # Database files
├── logs/                  # Log files
└── tests/                 # Test files
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the logs for error details
- Review the environment configuration

## Changelog

### Version 1.0.0
- Initial release with core functionality
- Security improvements and validation
- Docker support
- Comprehensive logging
- Rate limiting and protection