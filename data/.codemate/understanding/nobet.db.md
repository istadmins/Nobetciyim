# High-Level Documentation

## Overview

This code represents the schema and some sample data for an application database, likely a **duty (nöbet) scheduling and management system** for an organization, possibly used in healthcare or a similar field. The database is implemented using **SQLite** and contains tables for users, duty personnel, holidays, rules for credit/kudos assignment, duty scheduling, calendar explanations, application settings, and network information.

## Database Structure

### Main Entities

1. **Nobetciler** (Duty Personnel)
   - Stores personnel who can be scheduled for duties.
   - Fields: ID, name, password, credit, activity status, paid credits, Telegram & phone info, etc.

2. **Users**
   - Application users (may overlap with personnel; includes admins).
   - Fields: ID, username, password, email, role, password reset info, etc.

3. **Takvim** (Duty Calendar)
   - Weekly schedule showing which personnel is on duty which week.
   - Fields: Week number, personnel ID (foreign key).

4. **Takvim_Aciklamalari** (Calendar Explanations)
   - Additional calendar remarks per week (e.g. holidays).
   - Fields: ID, year, week, explanation, optional override-duty-personnel.
   - Uniqueness enforced on (year, week).

5. **Kredi_Kurallari** (Credit Rules)
   - Rules determining how credits are awarded for duties.
   - Fields: Rule name, amount, whether it's a fixed rule, date, etc.

6. **Nobet_Kredileri** (Duty Credit Time Ranges)
   - Time intervals and credit values for different duty segments.
   - Fields: Minutes, start time, end time.

7. **Uygulama_Ayarlari** (Application Settings)
   - Arbitrary configuration key-value store.
   - Fields: Key, value.

8. **Nobetci** (Alternate or Legacy Duty Personnel Table)
   - Simple personnel table with name and password.

### Special Data

- **Holidays & Explanations**: The calendar explanations table contains rows for holidays, special events (like "Atatürkü Anma ve Gençlik Spor Bayramı"), or test entries, mapped to specific weeks or dates.
- **Sample Users**: Includes admin credentials and some hashed passwords, demo personnel, and their communication info.
- **Schedule Settings**: There are parameters indicating Telegram group settings, whether integrations/features are active, and scheduling start points.
- **Network Information**: Possibly IP addresses/mappings linked to workstation IDs or network devices.

## Key Application Features Supported

- Scheduling personnel for weekly or daily duties/rotas.
- Accounting/allocating credits for duty performed based on configurable rules and time ranges.
- Overriding default duty assignments for special cases (e.g. holidays).
- Supporting user management with roles (e.g., admin/user) and password resets.
- Annotating the schedule/calendar with remarks, holidays, or leave info.
- Telegram integration for group notifications or activity toggling.
- General application-wide configuration via key-value pairs.
- Tracking and handling network-related data for what's likely physical terminals or stations.

## Constraints & Data Integrity

- Unique constraints on usernames, rule names, and calendar week/year.
- Foreign keys to maintain relationships between personnel, schedule, and explanations.
- CHECK constraints on status fields for binary values (e.g., active/inactive).

## Intended Usage

This schema is designed for an application that manages duty schedules, tracks personnel credits/incentives, supports user/admin separation, and maintains an annotated calendar with both routine and exception management (like holidays or personnel leave).

---

**Note:** The above is a structural and functional overview, abstracted from the raw SQLite database content. It does not include actual SQL, code listing, or implementation details but aims to give a high-level understanding suitable for a system or solution architect, functional analyst, or onboarding developer.