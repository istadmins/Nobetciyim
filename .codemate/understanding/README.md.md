# Nobetciyim - High-Level Documentation

**Nobetciyim** is a comprehensive Duty Schedule Management System designed for organizations needing to manage shifts, credits, and notifications for employees (duty officers). The system is built with Node.js, Express, and SQLite, and is ready for production with Docker support. Below is a high-level overview of its architecture, features, and main components.

---

## System Overview

- **Purpose:** Assign and manage duty schedules, handle user roles and permissions, track scheduling credits, and automate notifications.
- **Tech Stack:** Node.js, Express, SQLite for persistent storage, Docker for containerization, and integrations with Telegram and Amazon SES for notifications.

---

## Main Features

1. **Authentication & User Management**
   - Secure JWT-based authentication.
   - Passwords hashed using bcrypt.
   - User roles: Admin and User, each with specific privileges and access controls.

2. **Duty Scheduling**
   - Assign, update, and manage duty officers.
   - Supports dynamic scheduling with a credit (points) system to manage fairness and time-off.
   - Rules can be defined and customized for schedule handling.

3. **Notification Integrations**
   - Automated Telegram bot notifications to keep users informed of schedule changes.
   - Email notifications for password resets through Amazon SES SMTP.

4. **Security Measures**
   - Rate limiting to prevent excessive requests.
   - Input validation and sanitization; protection against SQL injection and XSS.
   - Uses Helmet for enhanced HTTP header security.

5. **Logging & Monitoring**
   - Structured logging using Winston: both general and error logs are maintained.
   - Health check endpoint and performance metrics included for monitoring and alerting.

6. **API & Extensibility**
   - RESTful API endpoints for authentication, users, scheduling, rules, credits, calendar remarks, and settings.
   - Modular structure allows easy addition of new features.

7. **Production-Ready**
   - Simple Docker and Docker Compose integration for deployment.
   - Environment variables for configuration management.
   - Healthcheck for automated uptime monitoring.

---

## Core Components

- **API Endpoints:** Cover all major functionality:
  - Authentication (/api/auth)
  - Duty management (/api/nobetci)
  - Rules (/api/kurallar)
  - Credits (/api/nobet-kredileri)
  - Calendar remarks (/api/remarks)
  - Settings & health check
  
- **Database Schema:** (on SQLite, see details above)
  - `users` — user accounts and roles.
  - `Nobetciler` — duty officer records.
  - `kredi_kurallari` — rules for credit assignment.
  - `nobet_kredileri` — individual credit balances by user.
  - `takvim_aciklamalari` — calendar event overrides and related metadata.
  - `uygulama_ayarlari` — system/application configuration settings.

- **Middleware & Utilities:**
  - Custom Express middleware for authentication, authorization, rate limiting, request validation, etc.
  - Utility modules for notification delivery, logging, cron jobs, etc.

---

## Security Practices

- **Authentication:** JWT tokens with secure storage of user secrets.
- **Password Handling:** Bcrypt with configurable work factor.
- **Rate Limiting/Abuse Protection:** Configurable thresholds prevent misuse.
- **Input Validation:** express-validator for all user-facing endpoints.
- **SQL Security:** Only parameterized queries; no direct raw SQL input.
- **HTTP Security:** Helmet to enforce best practices on HTTP headers.

---

## Deployment

- **Local:** 
  - Simple npm scripts for dev/test/prod runs.
  - `.env` file for all sensitive configuration.

- **Docker:** 
  - Dockerfile and docker-compose.yml included.
  - Supports persistent data and logs via Docker volume mounts.
  - Healthcheck for orchestration tools.

---

## Monitoring & Logging

- **Health Check:** `/health` endpoint for liveness and uptime stats.
- **Logging:** Centralized and file-based logging for audits and troubleshooting.
- **Performance:** Response time tracking for all requests.

---

## Project Structure

- `app.js`: Entry point and server setup.
- `db.js`: Handles database connection and queries.
- `routes/`: All REST API endpoint definitions.
- `middleware/`: Auth, error, logging, etc.
- `utils/`: Notifications, helpers, and shared functionality.
- `public/`: Static assets.
- `data/`: Database files.
- `logs/`: Log files.
- `tests/`: Automated tests.

---

## Contribution & Support

- Fork, branch, PR workflow.
- MIT licensed.
- Raise issues or PRs as needed.
- See changelog and documentation for update tracking.

---

## Summary

**Nobetciyim** is a full-featured, secure, and extensible scheduling system with multi-channel notification capability, strong role-based access control, robust logging and monitoring, and production-grade deployability. It is easy to set up, provides a RESTful interface, and comes with built-in best practices for security and maintainability.