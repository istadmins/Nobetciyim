# Code Review Report for `public/js/calendar.js`

This report reviews the provided code for common **industry standards**, checks for **obvious errors**, and identifies **unoptimized areas**. Suggestions and corrections are provided as **pseudo code snippets**. **Only lines or sections with issues or improvement potential are shown for brevity.** 

---

## 1. General Observations

- The code is modular and appears to be well-structured.
- Async/await and promises are properly used for API calls.
- Turkish language usage in variable names and comments is clear for the target audience but may hinder maintainability if project scales internationally.
- There is a mix of logic and UI manipulation, making it less reusable/testable (recommend: extract business logic functions for unit testing).

---

## 2. Critical Issues & Suggestions

### 2.1. Potential Data Race/Double async Initialization

**Issue:**  
At the end, some global variables are assigned as `await fetchNobetciler()` etc. in parallel, but they might have dependencies (e.g., `nobetciler` before calendar draws).  
**Impact:** Rendering with incorrect/empty data during first load.

**Suggested Correction:**  
Wrap the entire startup sequence inside a single async IIFE or initialization function and ensure data dependencies are respected.

> ```pseudo
> async function initApp() {
>     nobetciler = await fetchNobetciler();
>     nobetSiralamaAyarlari = await fetchResortConfig();
>     await combineAndSetOzelGunler(currentYearForData);
>     takvimVerileri = await fetchTakvimVerileri(currentYearForData);
>     initButtons();
>     await loadCalendar();
> }
> initApp();
> ```

---

### 2.2. Hardcoded Holiday Data for Years

**Issue:**  
Holiday calculation for national/religious holidays is hard-coded only for 2024/2025.

**Impact:**  
Future years will miss holiday data silently, which is not scalable or robust.

**Suggestion:**  
Add dynamic (calculation or API fetch) for recurring holidays, or at least an explicit TODO/exception if `year` is not handled.

> ```pseudo
> if (!(year === 2024 || year === 2025)) {
>     // TODO: Extend holidays for other years or fetch dynamically
>     // throw new Error("Holiday calculation not implemented for this year!");
> }
> ```

---

### 2.3. `.forEach` vs Standard `for` for Early Exit

**Issue:**  
In `turkishHolidays.forEach`, `.forEach` with push for unique-ness is less efficient than a `for` loop with early exit.

**Suggestion:**  
If performance becomes an issue, refactor to use a lookup table or standard `for` with `break` for better control.

> ```pseudo
> for th in turkishHolidays
>     if (userDefined.contains(udg => udg.tarih === th.tarih)) continue
>     combined.push(th)
> ```

---

### 2.4. Manual String Splitting for Month/Year Extraction

**Issue:**  
In `adjustRowSpansAndMonthNames`, month and year are parsed by splitting `currentMonthYearDisplay.innerText`.

**Impact:**  
Fragile if date format/localization changes.

**Suggestion:**  
Store month/year as explicit variables when setting `currentMonthYearDisplay`.

> ```pseudo
> // When updating currentMonthYearDisplay:
> state.displayedMonthIndex = month
> state.displayedYear = year
>
> // In adjustRowSpansAndMonthNames, use:
> const displayedMonthIndex = state.displayedMonthIndex
> const displayedYear = state.displayedYear
> ```

---

### 2.5. Inefficient Event Listeners (Per Cell)

**Issue:**  
`remarkCell.addEventListener('blur', ...)` is attached for every cell on each calendar load.

**Impact:**  
Can cause **memory leaks** and significant performance degredation when navigating months.

**Correction:**  
Remove all old listeners or use event delegation.

> ```pseudo
> // Option A: Remove old listeners before rebuilding table.
> // Option B: Use event delegation:
> calendarBody.addEventListener('blur', (e) => {
>   if (e.target && e.target.classList.contains('remark-cell')) {
>     // handle save
>   }
> }, true)
> ```

---

### 2.6. Global Variable Pollution (draggedItemPayload & window.refreshCalendarData)

**Issue:**  
`draggedItemPayload` and `window.refreshCalendarData` globals might get overwritten or cause issues if this script is included multiple times or in SPA contexts.

**Suggestion:**  
Encapsulate in a closure/module pattern, or at least namespace the global functions.

> ```pseudo
> window.appCalendar = window.appCalendar || {};
> window.appCalendar.refreshCalendarData = async () => { ... }
> ```

---

### 2.7. Input Validation: Prompt for Index

**Issue:**  
`parseInt(kullaniciSecimiStr)` with no radix; may parse string with non-numeric input unexpectedly.

**Correction:**  
Always pass radix.

> ```pseudo
> const secilenIndexNum = parseInt(kullaniciSecimiStr, 10);
> ```

---

### 2.8. Defensive Checks on DOM Access

**Issue:**  
No defensive checks for element existence: `calendarBody`, `currentMonthYearDisplay`, etc.

**Suggestion:**  
Check and fail gracefully in production code.

> ```pseudo
> if (!calendarBody || !currentMonthYearDisplay) {
>     throw new Error("Takvim gövdesi veya başlık yok!")
> }
> ```

---

### 2.9. Unhandled Errors on API Calls

**Issue:**  
Some `fetch` error paths do `alert()` + log, but more robust error handling/reporting would be ideal in production.

**Suggestion:**  
Create a generic notification/handling mechanism.

> ```pseudo
> function showError(msg) {
>     // Could log, send analytics, and show UI message
>     alert(msg)
> }
> // Then call: showError("Takvim verisi kaydedilemedi.")
> ```

---

## 3. Minor Optimizations

### 3.1. Use `const`/`let` Correctly

Some variables are always re-assigned, some could easily be `const` (especially inside scopes/loops).

### 3.2. Magic Numbers

`42` used for day cells in month (magic number for max: 6 weeks x 7 days). A named constant improves clarity.

> ```pseudo
> const MAX_CALENDAR_DAYS = 42
> for (let i = 0; i < MAX_CALENDAR_DAYS; i++)
> ```

---

## 4. Miscellaneous Points

- **Date Construction**:  
  Building dates with `new Date(year, month, day - 6)` – consider using utility functions for date arithmetic for readability and correctness.

- **Accessibility**:  
  No ARIA roles or assistive markup: consider for production.

---

# Summary of Main Fixes

- **Initialization:**  
  ```
  async function initApp() { ... }
  initApp();
  ```

- **Safeguards:**  
  ```
  if (!calendarBody || !currentMonthYearDisplay) { throw new Error(...); }
  ```

- **Event Delegation for Remarks:**  
  ```
  calendarBody.addEventListener('blur', handler, true)
  ```

- **ParseInt with Radix:**  
  ```
  const secilenIndexNum = parseInt(kullaniciSecimiStr, 10);
  ```

- **Holiday Handling Extendability:**  
  ```
  if (!(year === 2024 || year === 2025)) { /* TODO: extend... */ }
  ```

- **Globals Namespaced:**  
  ```
  window.appCalendar = window.appCalendar || {};
  window.appCalendar.refreshCalendarData = ...
  ```

---

**Overall, code quality is above average for a typical production-grade JS file, but several maintainability and scalability tweaks are recommended.**  
**Please address these pseudo-code suggestions directly in your implementation.**