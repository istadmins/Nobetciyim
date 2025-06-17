# Telegram Bot Handler - High-Level Documentation

This file implements the logic for a Telegram bot designed to manage an on-call/guard scheduling system for a team. The bot interacts with users via Telegram, interfaces with a local database, and integrates with internal APIs to manage "on-call" (nöbetçi) rotations, credit systems, authentication, and notifications.

---

## Main Functionalities

### 1. **Bot Initialization:**
- Reads the Telegram bot token (and other configuration) from environment variables.
- Sets up the bot to use polling for receiving messages and commands.
- Registers the bot’s available commands for the Telegram UI.

---

### 2. **User Authorization:**
- Before executing key commands, the bot checks if the querying Telegram user is an authorized, registered on-call team member via their Telegram ID.

---

### 3. **Command Handling:**
The bot supports and responds to the following commands (primarily for authorized users):

- **/start or /menu:**  
  Shows general information about the bot, a welcome message, and lists usable commands for the user.

- **/nobet_al:**  
  Allows the current or future on-call team member to take (or "claim") the current on-call duty.  
  - If the user is the "main weekly guard" and not already active, their action triggers a direct switch.
  - If the user is not the designated guard, the current or main guard must approve via an interactive button. The bot manages multi-step conversations and approval logic.

- **/aktif_nobetci:**  
  Displays information about the currently *active* on-call guard (name and credit status).

- **/gelecek_hafta_nobetci:**  
  Provides information on who will be on duty as the main guard for the upcoming week, along with the date range and relevant notes.

- **/nobet_kredi_durum:**  
  Lists all authorized on-call personnel, their credits (accumulated, paid, remaining), the currently active member, and how much each one leads the others (in fractional "days").

- **/sifre_sifirla:**  
  Allows the user to trigger a password reset for their account. The bot returns the new password via a private message.

---

### 4. **Duty Transfer Approval Logic:**
- When a non-main or non-active guard requests to take over, the actual active or main guard receives an approval request via Telegram with inline keyboard buttons ("Yes"/"No").
- The bot handles and records these interactive reply callbacks, performing the switch and notification as appropriate.

---

### 5. **Database and Internal API Integration:**
- The bot interfaces with a SQLite (or similar) database to fetch user, guard, and schedule info.
- Mutations (such as activating or changing the active guard) are handled via HTTP POST to internal backend API endpoints, with internal authentication.

---

### 6. **Notification Utilities:**
- **sendTelegramMessageToGroup:**  
  Exposed utility for sending arbitrary messages to a Telegram group/user. Used externally or for global notifications.

- **notifyAllOfDutyChange:**  
  Notifies all users (with Telegram IDs) of a manual or unexpected duty change, e.g. due to admin intervention.

---

### 7. **Error Handling & Logging:**
- Extensive error handling across all major logic branches (database, API, Telegram).
- Records logs to the console for troubleshooting of both warnings and fatal errors.

---

## Structure/Exported Interface

- **init:**  
  Call to initialize (and singletonize) the bot.

- **sendTelegramMessageToGroup:**  
  Utility to externally push a message to a group/user.

- **notifyAllOfDutyChange:**  
  Broadcast new duty assignment to all team members.

---

## Security/Design Notes

- All sensitive actions require user authorization via Telegram ID.
- API calls from the bot to the internal backend are protected by an authentication token.
- Passwords are only shared via direct messages and users are prompted to change and securely store them.

---

## Modules & Dependencies

- **node-telegram-bot-api**: Telegram integration.
- **axios**: HTTP requests to internal APIs.
- **./db**: Database layer (for user/account lookups).
- **./utils/calendarUtils**: Utility functions for season/week computation and guard assignment logic.

---

In summary, the code provides a robust, secure, and feature-rich Telegram interface for managing and automating an on-call duty scheduling system within an organization, supporting live updates, approvals, credit tracking, and account management.