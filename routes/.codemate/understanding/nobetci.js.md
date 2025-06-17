# routes/nobetci.js — High-Level Documentation

This file defines a set of HTTP API endpoints (routes) for managing "nöbetçi" (duty personnel) in a Node.js Express application. The routes interact with a database containing personnel information, and handle notifications as well as updates related to their duties, credits, and contact details. All relevant actions are logged for auditing and debugging purposes.

## Main Features

### 1. Change Active Duty Personnel and Notify Users
- **POST `/:id/set-aktif`**
  - Sets the specified user as the active duty person.
  - Ensures only one active duty at a time.
  - Triggers notifications to users via Telegram.
  - Handles error cases (e.g., user not found, already active).
  - Action is logged.

### 2. Personnel List and Basic CRUD Operations
- **GET `/`**
  - Lists all duty personnel with details (ID, name, credits, contact info, etc.).
- **POST `/`**
  - Adds a new duty person to the database with given properties (name, password, Telegram ID, phone number).
- **DELETE `/:id`**
  - Removes the duty person with the specified ID from the database.

### 3. Password and Contact Management
- **POST `/reset-password/:id`**
  - Resets the password of the specified user to a random string.
  - Returns the new password.
- **PUT `/:id/telegram-id`**
  - Updates the Telegram ID of the specified user.
- **PUT `/:id/telefon-no`**
  - Updates the phone number of the specified user.

### 4. Credit Management
- **PUT `/kredileri-guncelle`**
  - Bulk updates the credit values (`kredi`) for multiple personnel.
  - Detailed logging for each credit update.
- **PUT `/pay-edilen-kredileri-guncelle`**
  - Bulk updates the "paid credit" values (`pay_edilen_kredi`) for multiple personnel.
  - Detailed logging for each update.

## Technologies Used

- **Express.js** — For route handling.
- **SQLite (via db)** — For data persistence.
- **crypto** — To generate random passwords.
- **Winston Logger** — For action and error logging.
- **Telegram Bot handler** — For sending notifications about duty changes.

## Concerns and Practices

- **Error Handling:** All routes employ basic error handling and return meaningful HTTP status codes/messages.
- **Logging:** Almost every significant action and error is logged for traceability.
- **Bulk Operations:** Credit updates are handled in bulk with per-item logging.
- **Security:** Password reset uses randomly generated values.
- **Notifications:** Telegram notifications are sent when the active duty person changes.

## Intended Use

This API is designed for an application where a group of users take turns as "duty" personnel and need to manage, update, and track their duties, credits, and identification information. The system automates communication (e.g., via Telegram) and supports administrative operations through HTTP requests.