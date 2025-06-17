# High-Level Documentation: Nobetciyim/cron-jobs.js

## Overview

This module orchestrates and schedules several automated tasks (cron jobs) for duty management in a system called "Nobetciyim." The main responsibilities are:

- **Credit Management:** Continuously update and track the "credits" (kredi) allocated to active duty personnel ("nöbetçi") based on time, rules, and shift schedules.
- **Weekly Dispatcher Assignment:** Automatically assign the main weekly duty at a scheduled time.
- **Evening Shift Changes:** Manage duty changes at the start of the evening shift.
- **Notifications:** Communicate duty changes and assignments via Telegram.

All cron jobs operate on the Europe/Istanbul time zone.

---

## Key Functionalities

### 1. **Credit Update Every Minute**

- **Schedule:** Every minute (`* * * * *`)
- **Purpose:** Increment the duty credit for the currently active nöbetçi.
- **Logic:**  
  - Determines applicable credit based on:
    - Special days (e.g., holidays).
    - Weekends.
    - Current shift's credit rule.
    - Defaults to a base value.
  - Updates the database accordingly.
  - Logs credit changes (in non-production environments).

---

### 2. **Weekly Duty Assignment**

- **Schedule:** Every Monday at 09:00 (`0 9 * * 1`)
- **Purpose:** Assigns the weekly principal duty personnel.
- **Logic:**  
  - Identifies and sets the main nöbetçi for the week.
  - Notifies all registered personnel via Telegram.

---

### 3. **Evening Shift Duty Switch**

- **Schedule:** Dynamically determined, based on second entry in shift time settings.
- **Purpose:** Assigns/reset the main nöbetçi at the start of the evening shift, unless a special day or weekend.
- **Logic:**  
  - Cross-checks if it's a working day.
  - Sets the active nöbetçi if necessary.
  - Sends Telegram notifications regarding the shift.

---

### 4. **Utility & Logging Functions**

- **Custom Logging:**  
  - Conditional debug logging (controlled via environment variable).
  - Credit update logs, omitted in production.

- **Credit Calculation Helpers:**  
  - Helper functions determine instantaneously applicable credit based on date and rule definitions (special day, weekends, shift hours).

---

## Integration Points

- **Database:** All duty assignments and credit updates interact with a dedicated database module.
- **Utility Functions:** Used to determine the main weekly duty and other calendar-related logic.
- **Telegram Bot Handler:** All messaging goes through a Telegram bot integration for group/user notifications.

---

## Initialization

- At module load, all cron jobs are scheduled.
- A dynamic cron job is set up for the evening shift based on configuration from the database.
- Console logs confirm initialization.

---

## Configuration & Environment

- Requires proper database access.
- Uses environment variables for debug and production/logging behaviors.
- Timezone: Europe/Istanbul.

---

## Intended Use Cases

- **Automated credit management** for duty personnel.
- **Transparent and automated assignment** of weekly and shift duties.
- **Real-time notifications** of duty changes.
- **Rule-based customization** for credits, holidays, and shift timings.

---

This module is central to ensuring fairness, communication, and automation in the duty roster system.