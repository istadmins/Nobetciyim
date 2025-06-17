**High-Level Documentation: Nobetciyim/utils/calendarUtils.js**

This module provides core utility functions for duty (shift) assignment operations in the "Nobetciyim" system. It combines calendar calculations with database queries to support determination and retrieval of weekly duty assignments and related configurations. The functions are mainly intended to help determine which person is on duty for a given week, supporting both standard cycles and manually overridden or reconfigured assignments.

---

### Main Functionalities

1. **Week Calculation**
   - **getWeekOfYear(date):**
     - Returns the week number for a provided date, following the ISO 8601 standard (weeks start on Monday, the first week contains the year's first Thursday).
     - Used to consistently determine duty weeks across the year.

2. **Fetching Duty Personnel (Nöbetçi)**
   - **getAllNobetcilerFromDB():**
     - Retrieves a list of all duty personnel from the database, ordered by their IDs.
     - Returns each person's ID, name, and Telegram ID.

3. **Duty Reconfiguration Settings**
   - **getResortConfigFromDB():**
     - Fetches "resort" (reshuffle/reconfiguration) settings from the database, which may alter the usual duty person rotation.
     - Returns these settings as an object, or default values if not set or on error.

4. **Main Duty Calculation Logic**
   - **getAsilHaftalikNobetci(date):**
     - Determines the main duty person for a specific week (or any day within that week):
       - First checks if there is a manual override for the week in the calendar.
       - If not, computes the duty person using standard rotation or considering "reshuffle" configuration, if active.
     - Pulls required data from the database (overrides, personnel list, reconfiguration settings) and returns the relevant duty person info (ID, name, Telegram ID).

---

### Use Cases

- **Telegram Bot Integration:** Used to inform users about current or upcoming duty personnel.
- **Admin Operations:** Supports dynamic updates—manual overrides and configuration changes are reflected immediately in duty calculations.
- **Reporting/UI:** Enables display of reliable, calendar-consistent weekly assignments.

---

### Implementation Notes

- The module relies on a database interface (db) for all persistent operations (fetching personnel, settings, and overrides).
- Week computation is consistent with European/international standards, minimizing errors in cross-year transitions.
- All queries and calculations are wrapped to handle errors gracefully and provide default values where appropriate.
- Code is asynchronous (Promise-based) to fit into larger event-driven (Node.js/Express/Telegram bot) applications.

---

### Exported Functions

- `getWeekOfYear`
- `getAsilHaftalikNobetci`
- `getAllNobetcilerFromDB`

These utilities allow other parts of the application to interact with the system's duty rotation logic in a clean and encapsulated way.