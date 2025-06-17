# High-Level Documentation: routes/takvim_remarks.js

## Overview

This module implements an Express router for managing calendar remarks ("takvim açıklamaları") and manual duty assignments in a duty roster system. It provides endpoints for retrieving and updating weekly remarks, and for overriding the assigned duty person ("nöbetçi") with real-time notifications if the active duty changes.

---

## Endpoints

### 1. `GET /`
- **Purpose**: Retrieve all remarks and override assignments for a specified year.
- **Query Parameters**:
  - `yil`: The year to filter remarks (required).
- **Actions**:
  - Fetches calendar remarks, associated week numbers, remarks text, and optionally the manually overridden duty person.
  - Joins to return the overridden duty person's name if present.
  - Responds with a list of matching records or an error.
- **Error Handling**:
  - Missing `yil` parameter returns HTTP 400.
  - Database errors return HTTP 500.

---

### 2. `POST /`
- **Purpose**: Create or update a remark and optional manual override for a specific week and year, and trigger notifications if current duty is affected.
- **Request Body**:
  - `yil`: Year (required).
  - `hafta`: Week number (required).
  - `aciklama`: Optional remark text.
  - `nobetci_id_override`: Optional user ID to override the duty for that week.
- **Actions**:
  - Inserts a new remark or updates an existing one for the given week/year.
  - If the overridden duty applies to the current week, and the actual duty person changes:
    - Updates the active duty in the system.
    - Sends notifications via Telegram bot to all users.
- **Error Handling**:
  - All exceptions return HTTP 500 with a generic error message.

---

## Internal Functions

- **getWeekOfYear(date)**: Computes the ISO week number for a given date.

---

## Side Effects & Integrations

- **Database**: Reads and writes to the `takvim_aciklamalari` and `Nobetciler` tables; maintains data integrity with conflict resolution on year and week.
- **Telegram Bot**: Integrates with a notification system to alert users when a manual override changes the currently active duty person.

---

## Usage Context

Used in systems where weekly duties/rotas require exceptional overrides and clear audit/communication of such changes (e.g., hospital/shared office on-call rosters).

---