# High-Level Documentation of `public/js/main.js`

## Overview
This JavaScript file provides the main client-side logic for a web application that manages on-call (nöbet) personnel, including notifications, event handlers, network status monitoring, periodic data fetching, and some UI update logic. The code integrates with server-side APIs for user authentication and data management.

---

## Features

### 1. Notifications Utility
- **Function:** `showNotification`
  - Displays styled notification messages of types: "info", "success", "error", and "warning".
  - Appears as a fixed popup in the upper-right, auto-dismissed after 5 seconds.

### 2. API Error Handling
- **Function:** `handleApiError`
  - Handles fetch-related, authentication, and rate-limiting (too many requests) errors with user-facing notifications.
  - Handles 401 (auth) by logging the user out and redirecting to login.
  - Logs errors to the console for debugging.

### 3. Network Status Monitoring
- Listens for online/offline browser events.
- Notifies the user when internet connectivity is lost or restored.

### 4. Initialization and Event Binding
- On document ready:
  - Checks for valid auth tokens.
  - Binds click/submit handlers to UI elements (logout, adding personnel, adding rules, saving credits, adding new time row, starting credit distribution).
  - Loads initial data via API calls.
  - Sets up a periodic (default: every 10 seconds) data refresh for on-call personnel.
  - Attaches event listeners to handle active personnel selection.
  - Notifies the user when the app is loaded successfully.

### 5. Periodic Data Refresh
- **Function:** `loadInitialDataAndSetupInterval`
  - Loads personnel, rules, and credit data from the backend on start.
  - Sets up an interval to periodically refresh the personnel list (and potentially the calendar).
  - Ensures only one interval runs at a time.

### 6. Change Active On-call Personnel
- **Function:** `addAktifNobetciChangeListener`
  - Listens for radio button changes in the personnel list table.
  - When a new person is selected as active, sends this update to the server.
  - On success, optionally refreshes the calendar.
  - On failure, alerts and reloads the personnel list for consistency.

---

## Integration Points

- **Token Authorization**: Uses `localStorage.getItem('token')` for auth with API requests.
- **API Endpoints**: Calls endpoints (like `/api/nobetci/...`) for data updates.
- **Global Functions**: Expects certain global functions (`getNobetciler`, `kurallariYukle`, `zamanKrediTablosunuDoldur`, `window.refreshCalendarData`, etc.) to be defined elsewhere.

---

## User Experience Considerations

- The UI is kept in sync with server data via periodic polling and immediate updates on key actions.
- The application is robust to errors and network status, providing timely feedback to the user.
- Uses clear, color-coded notifications for various application and error states.

---

## Extensibility

- The polling interval and other settings can be easily changed for performance tuning.
- Designed to gracefully handle missing or undefined handler functions.
- Modular structure for easy addition of new event handlers or UI actions.

---

## Summary

This file acts as the main controller for client-side interaction in a personnel scheduling system. Its responsibilities include UI notification, error handling, polling for current data, graceful handling of connectivity issues, and wiring UI controls to business logic via event listeners and API calls.