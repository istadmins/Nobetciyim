# High-Level Documentation: `nobetciIslemleri.js`

This JavaScript file manages the client-side operations for "nöbetçi" (on-duty/shift personnel) management in a web-based administrative application. The core functionalities include listing, adding, updating, and removing duty personnel, as well as managing their related attributes such as credits, Telegram IDs, and phone numbers.

---

## Main Functionalities

### 1. Credit Reset and Update
**Function:** `sifirlaVeKazanilanKredileriGuncelle()`

- **Purpose:** Resets and updates the credits ("kredi") earned by all duty personnel, shifting the base so the lowest credit becomes zero for everyone.
- **How it works:**
  - Collects all rows representing duty personnel.
  - Determines the minimum earned credit.
  - Calculates and submits the new credits for each duty personnel (original minus minimum).
  - Sends this data to the server via a PUT request.

---

### 2. Adding New Duty Personnel
**Function:** `handleNobetciEkle(e)`

- **Purpose:** Handles the form submission for adding a new duty person.
- **How it works:**
  - Retrieves input values (name, password, Telegram ID, phone number) from the form.
  - Validates required fields.
  - Sends a POST request to add the new duty person to the backend.
  - On success, refreshes the duty personnel list and optionally updates credit calculations and the calendar view.

---

### 3. Listing and Rendering Duty Personnel
**Function:** `getNobetciler()`

- **Purpose:** Fetches and displays the current list of all duty personnel in a table.
- **How it works:**
  - Fetches data from the server.
  - Updates the table HTML dynamically, including user info, credits, and action buttons.
  - Handles empty/error states.
  - Considers which duty personnel is "active" and highlights them.

---

### 4. Editing Telegram ID & Phone Number
**Functions:**
- `window.editTelegramIdPrompt(nobetciId, mevcutTelegramId)`
- `window.editTelefonNoPrompt(nobetciId, mevcutTelefonNo)`

- **Purpose:** Allows editing the Telegram ID and phone number of a duty person.
- **How it works:**
  - Prompts the user for a new value.
  - Sends an update request to the backend.
  - On success, refreshes the personnel list to reflect the change.

---

### 5. Removing Duty Personnel
**Function:** `window.nobetciSil(id)`

- **Purpose:** Deletes a duty personnel record after confirmation.
- **How it works:**
  - Asks for user confirmation.
  - Sends a DELETE request to the backend.
  - On success, refreshes the personnel list and updates related UI components.

---

### 6. Resetting Passwords
**Function:** `window.sifreSifirla(id)`

- **Purpose:** Resets the password for a duty person and displays the new one.
- **How it works:**
  - Asks for user confirmation.
  - Sends a password reset request.
  - Alerts the user with the new password.

---

## Additional Notes

- **Table Columns:** The code adapts to changes in the table structure, notably when new columns (like phone number) are added.
- **UI Integration:** Designed for use with a specific HTML structure, interacts extensively via DOM selectors and dynamically generated HTML.
- **API Interaction:** All critical actions (add, update, remove, reset password, update credits) communicate with a RESTful backend, protected by a Bearer token from Local Storage.
- **Error Handling:** Provides user feedback via alerts and logs more detailed errors to the console.
- **Modularity:** Update functions are globally accessible (assigned to `window`) for use as button click handlers.

---

## Typical UI Workflow

1. **Admin** views the list of personnel, their contact info, and credit status.
2. **Admin** can add, edit, or remove personnel records.
3. **Admin** can update personnel's Telegram ID or phone number via interactive prompts.
4. **Crediting system** allows normalization/resetting of “earned credits.”
5. **Admin** can reset a user’s password and receive the new one as feedback.

---

## Intended Audience
This code is geared toward developers and maintainers of a shift/duty management platform, particularly those responsible for the administrative interface and system integrations with a REST API backend.