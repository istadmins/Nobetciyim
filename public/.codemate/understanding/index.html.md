**High-Level Documentation: Nöbetçi Yönetim Sistemi (Duty Management System) Web Page**

---

## Overview

This is a complete HTML page template for a Duty Management System ("Nöbetçi Yönetim Sistemi") intended for managing, scheduling, and crediting individuals ("nöbetçi") assigned for duty shifts. The web application appears to be tailored for Turkish users (e.g., labels are in Turkish).

---

## Main Functional Sections

### 1. Header & Navigation

- Display of system title.
- Navigation links to page sections: Duty List, Add Duty Person, Credit Rules, Time-Based Credits, and Duty Calendar.
- "Çıkış Yap" (Logout) button.

### 2. Duty List ("Nöbetçi Listesi")

- Displays a table containing:
  - Select box, Name, Telegram ID, Phone Number, Credits Earned, Credits Paid, Remaining Credits, and Actions.
- Button to trigger credit distribution ("Başlat").
- Dynamic content for managing and displaying individuals on duty.

### 3. Add New Duty Person ("Yeni Nöbetçi Ekle")

- Form to add a new duty member with:
  - Name, Password, Telegram Chat ID (optional), Phone Number (optional).
- Submit button to add the user.

### 4. Credit Calculation Rules ("Kredi Hesaplama Kuralları")

- Shows a table of credit calculation rules per date, value, and description.
- Allows adding new rules via a form (credit amount, description, date).

### 5. Time-Based Credit Calculation ("Zaman Bazlı Kredi Hesaplama")

- Table for setting up credit-per-minute along with the relevant time intervals.
- Buttons to save changes and to add new time interval rows.

### 6. Duty Calendar ("Nöbet Takvimi")

- Interactive calendar section for visualizing and managing duty schedules.
- Controls for navigating months and rearranging duties ("Nöbetçileri Yeniden Sırala").
- Calendar table with header for week, month, days (Mon-Sun), duty person's name, and comments.

### 7. Footer

- Static copyright.

---

## Scripts and Styles

- **Stylesheets**:
  - Font Awesome for icons.
  - Local CSS ("style.css").

- **JavaScript Files** (likely providing dynamic content and logic for):
  - Authentication ("auth.js").
  - Credit calculation logic ("hesaplama.js").
  - Duty person CRUD operations ("nobetciIslemleri.js").
  - Credit rules operations ("kuralIslemleri.js").
  - Time-based credit management ("zamanKrediIslemleri.js").
  - Interactive calendar features ("calendar.js").
  - Main JS integration/initialization ("main.js").

---

## User Experience Features

- Responsive tables for data listings.
- Forms for CRUD operations on members and rules.
- Calendar navigation and rearrangement.
- Simple and clean UI, intended for clarity and efficiency in managing duty rosters.

---

## Audience

- Intended for teams that assign, rotate, and manage members for duty, likely in a professional, hospital, or organizational environment.
- Turkish-speaking end-users.

---

## Extensibility & Integration

- Modular JS and CSS inclusion allows for easy expansion.
- Optional fields (Telegram, phone) hint at potential notification or communication integrations.
- System likely linked to a backend due to dynamic table bodies and event-driven forms.

---

**Summary:**  
This code forms the client-facing core of a comprehensive Duty Management web application with features for listing, adding, and scheduling duty members, as well as calculating and configuring credit and shift rules. The logic and dynamic operations are delegated to a set of modular JavaScript files.