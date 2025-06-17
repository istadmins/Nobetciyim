# Nobetciyim - Duty Schedule Management System

## Overview

**Nobetciyim** is a Node.js-based Duty Schedule Management System designed to help users manage duty rosters efficiently. It leverages Express.js as its main framework and uses SQLite for data storage. The system includes various utilities and integrations, such as authentication, scheduling, notifications, and security enhancements.

---

## Features

- **User Authentication & Authorization**: Secure user management utilizing JWT (JSON Web Tokens) and password hashing (bcryptjs).
- **Duty Scheduling**: Tools for creating, modifying, and viewing duty schedules.
- **Database**: Uses SQLite3 as a lightweight, file-based database solution.
- **API Development**: RESTful API built on Express.js.
- **Validation & Security**
  - Input validation via express-validator.
  - Security headers and practices (Helmet, rate limiting, CORS).
- **Notifications & Integrations**
  - Email notifications via nodemailer.
  - Telegram bot integration (node-telegram-bot-api) for real-time duty alerts.
- **Scheduled Tasks**: Automated tasks and reminders via cron jobs (node-cron).
- **Logging**: Application and error logging using Winston.
- **Testing & Code Quality**
  - Test suite with Jest.
  - Code linting and formatting with ESLint (Standard style).
  - Dev/prod command scripts with npm and nodemon for hot reloading.

---

## Key Technical Stack

- **Backend**: Node.js (>=18.0.0)
- **Framework**: Express.js
- **Database**: SQLite3
- **Authentication**: JWT & bcryptjs
- **Notifications**: Nodemailer (email), Node-Telegram-Bot-API (Telegram)
- **Scheduling**: node-cron
- **Testing**: Jest
- **Environment Management**: dotenv
- **Security**: helmet, express-rate-limit, cors
- **Input Validation**: express-validator
- **Logging**: winston

---

## Development

- **Start app**: `npm start`
- **Dev mode**: `npm run dev` (with nodemon)
- **Run tests**: `npm test`
- **Linting**: `npm run lint` / `npm run lint:fix`

---

## Additional Information

- Designed for Node.js >= 18 and npm >= 8.
- MIT Licensed.

---

**Keywords**: duty, schedule, management, nodejs, express, sqlite

---

This documentation provides a high-level overview based solely on the provided `package.json` file. For deeper knowledge, see the implementation files (e.g., `app.js`).