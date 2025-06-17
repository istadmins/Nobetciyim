# High-Level Documentation of `Nobetciyim/db.js`

## Overview

This module manages the SQLite database setup and operations for the "Nobetciyim" application, which appears to be a duty/shift tracking and management system. The module ensures the database and its schema are ready, provides helper functions for essential database operations, and exposes a single shared database object with custom methods.

## Key Responsibilities

1. **Database Initialization**
    - Resolves and ensures the existence of the data directory.
    - Connects to an SQLite database file (path configurable via `DB_PATH` environment variable).
    - Enables foreign key constraints in SQLite.
    - On first run or startup, sets up the necessary tables and indexes using SQL definitions.

2. **Schema Definition**
    - Tables for core concepts:
        - `Nobetciler`: Duty officers/members.
        - `kredi_kurallari`: Credit rules for shifts.
        - `nobet_kredileri`: Credits per time range (shift minutes, start and end times).
        - `users`: Application user accounts with roles.
        - `takvim_aciklamalari`: Calendar entries and overrides for which duty officer is to be assigned in a specific week.
        - `uygulama_ayarlari`: Key-value application settings.
    - Also creates relevant indexes for fast querying.

3. **Logging**
    - Basic logger methods (`info`, `error`, `warn`, `debug`) for internal logging and error tracking.

4. **Database Operations (Custom Methods)**
    - **Schema-related**
        - `initializeSchema()`: Creates tables and indexes if they don't exist.
    - **Shift Management**
        - `getShiftTimeRanges()`: Retrieves definitions of all duty/shift time slots.
        - `setAktifNobetci(nobetciId)`: Safely set a specific duty officer as active (or deactivate all if `null`). Uses SQLite transactions.
        - `getAktifNobetci()`: Gets the currently active duty officer.
    - **Duty Officer Management**
        - `getNobetciById(id)`: Fetches details about a specific duty officer.
        - `getAllNobetcilerWithTelegramId()`: Returns all duty officers registered with a Telegram ID.
        - `updateNobetciKredi(nobetciId, yeniKredi)`: Updates a duty officer's credit value.
    - **Duty Rule Management**
        - `getAllKrediKurallari()`: Retrieves all credit rules.
    - **Calendar Override**
        - `getDutyOverride(yil, hafta)`: For a given week and year, checks if there is a calendar-based override for which duty officer is assigned.
   
5. **Error Handling**
    - All DB operations log and propagate errors.
    - `setAktifNobetci` uses transaction management and partial rollback on errors for reliability.

6. **Export**
    - The module exports the extended database object (`db`), so that other parts of the application can invoke these custom methods or make raw SQL queries as needed.

## Design Philosophy

- **Atomic & Safe Updates**: Transactional updates for critical state changes (e.g., setting or clearing an active duty officer).
- **Extensibility**: By adding methods directly to the `db` object, it is easy to extend with additional data-access methods.
- **Environment Awareness**: Configurable database location with safe defaults.
- **Separation of Concerns**: Schema definition and data logic are together but would be straightforward to refactor for more separation if needed.

## Suitable Use Cases

- Duty/shift scheduling applications needing reliable, auditable recordkeeping with user and role management.
- Central script/starter for ensuring a Node.js SQLite application is always ready to handle core business logic out of the box.

---

**Note:** This documentation describes the intent and high-level structure, not line-by-line code logic. It is suitable for developers wanting to know what the database module does, what its main interfaces are, and where to look for primary logic around duty/shift officer management.