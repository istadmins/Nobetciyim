# `calendar.js` - High-Level Documentation

This script is a **client-side JavaScript module** that powers an interactive duty shift calendar (nöbet takvimi) application. It handles data retrieval, UI rendering, user interactions (including drag-and-drop shift swapping), and synchronization with a backend API.

---

## **1. Main Functional Responsibilities**

### **A. Calendar Rendering and Navigation**
- **Displays a monthly grid** of days, including leading/trailing days of adjacent months.
- **Annotates weeks** with corresponding Turkish week numbers.
- **Highlights**:
  - Current day.
  - Weekends.
  - Special days (both official Turkish holidays and user-defined).
- **Navigation**:
  - Users can move backward/forward by months.
  - The current month and year are shown and updated on navigation.

### **B. Data Synchronization**
- On page load and navigation, the calendar loads:
  - List of duty officers (nöbetçiler).
  - All duty and remark data for the currently displayed year.
  - Official Turkish holidays and user-defined special days.
  - Shift rotation (scheduling) configuration, including any manual overrides.

- Data is managed through **AJAX (fetch API) requests** with JWT authentication.

### **C. Duty Officer Assignment & Rotation**
- **Automatic shift rotation**:
  - Calculates weekly assignment of officers according to a defined rotation.
  - Allows admin to reset rotation to start from a particular officer for a given week.
- **Manual overrides**:
  - Shift assignments can be manually adjusted or swapped via drag-and-drop.
  - All changes are synchronized with the server for persistence.

### **D. In-Calendar Editing**
- Allows direct editing of weekly remarks/notes in the calendar table.
- Edits are saved to the server after the blur event.

### **E. Drag-and-Drop Shift Swapping**
- **Duty officer assignments** (for current and future weeks) can be swapped between weeks using drag-and-drop.
- Handles edge cases (e.g., dropping onto self, disallowing drag for past weeks, etc).
- After each interaction, UI and data are refreshed to reflect changes.

---

## **2. Notable Internal Mechanisms**

### **A. Data Structures & Caching**
- Caches loaded data (duty officers, remarks, special days, config) for client-side performance and reduced API chatter.

### **B. Special Day Calculation**
- Contains hard-coded logic for Turkish public/religious holidays by year, supporting both fixed and variable-date holidays.
- User-defined special days are merged for display and conflict management.

### **C. Week and Date Calculations**
- Implements ISO week-numbering for Turkey.
- Logic to determine current, previous, next months/days/weeks based on current navigation and date context.

### **D. Advanced Table Cell Manipulation**
- Adjusts row/column spans within the table for proper month labeling.
- Ensures correct visual grouping and presentation of weeks/months in the calendar grid.

---

## **3. User Interactions**

- **Month navigation** (`prevMonthBtn`, `nextMonthBtn`)
- **Remark/duty officer editing** (via in-table editing or drag-and-drop)
- **Shift rotation reset** (`yenidenSiralaBtn`): trigger and confirm a new rotation starting from a selected duty officer and week.
- **Tooltip overlays** for special days, indication of official/user-defined holidays.
- **Visual feedback** for drag-and-drop actions (highlights, cursor feedback).

---

## **4. API Endpoints Utilized**
- `/api/nobetci`: Get duty officers.
- `/api/kurallar`: Get user-defined special days.
- `/api/settings/resort-config`: Get/set shift rotation configuration.
- `/api/remarks`: Get/set weekly remarks and manual officer overrides.
- (All requests require JWT token in headers.)

---

## **5. Initialization & Global Exposure**
- On document load, the code initializes all UI controls, fetches initial data, and renders the calendar.
- Exposes a global `refreshCalendarData` function to trigger a full calendar data reload and re-render (used after mutations).

---

## **6. Error Handling & Warnings**
- Includes user alerts and console warnings for common error conditions (invalid server response, drag-and-drop misuse, invalid user choices, etc).
- Ensures that invalid or failed operations do not corrupt UI or client caches.

---

## **7. Customization and Localization**
- Turkish language (TR) names, UI, data formats, and culture-specific date handling throughout.
- Built for the domain of Turkish duty shift planning.

---

### **In summary:**
This script provides a rich, interactive, and dynamic calendar for managing and visualizing duty shift assignments, integrated with backend data, supporting both automated scheduling and manual management, tailored for Turkish organizations.