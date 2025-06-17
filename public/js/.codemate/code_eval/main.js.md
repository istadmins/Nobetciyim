# Code Review Report

**File:** `public/js/main.js`  
**Review Focus:** Industry standards, error handling, optimization, code style, robustness

---

## 1. Variable/Function Naming

- [OK] Consistent and descriptive naming conventions.
- [IMPROVEMENT] Prefer using `const` or `let` as appropriate for variable re-assignment reasonability.

---

## 2. Error Handling

- [IMPORTANT] In the `handleApiError` function, `error.status` may not exist if `error` is an ordinary `Error` object.  
- [IMPORTANT] Always check for `response.ok` **before** calling `response.json()` in async API calls, to prevent possible errors when the response is not JSON.

**Suggested Correction:**
```pseudo
if (error && typeof error.status !== 'undefined' && error.status === 401) {
  // ...
}

// In addAktifNobetciChangeListener, refactor error handling:
if (!response.ok) {
  let errorMessage = `Sunucu hatası: ${response.status}`;
  try {
    const data = await response.json();
    errorMessage = data.error || errorMessage;
  } catch(e) { /* response is not JSON, use fallback */ }
  alert(errorMessage);
  if (typeof getNobetciler === 'function') await getNobetciler();
} else {
  // success block
}
```

---

## 3. Unoptimized Code/Resource Management

- [NOTE] `getNobetcilerIntervalId` may result in multiple intervals if `loadInitialDataAndSetupInterval` is called unintentionally twice. Make sure it is called once per page/app life cycle.
- [IMPORTANT] The inline use of `setInterval` is directly tied to the existence of `getNobetciler`; prefer defensive code to prevent memory/resource leaks.

**Suggested Correction:**
```pseudo
// Wrap in a singleton pattern or ensure loadInitialDataAndSetupInterval cannot be called more than once.
if (getNobetcilerIntervalId !== null) return;
```

---

## 4. Notification UI/UX

- [IMPROVEMENT] The notification class uses raw DOM styling in JS, which is brittle and bloats JS size. Prefer CSS classes for appearance settings.

**Suggested Correction:**
```pseudo
// Use CSS classes instead of JS-injected styles; keep only position and content in JS. 
notification.classList.add('notification', `notification-${type}`);
```

---

## 5. Event Handling Cleanliness

- [NOTE] You attach listeners inside `DOMContentLoaded`, which is good.  
- [IMPROVEMENT] Unregister or debounce event handlers if dynamically added/removed.

---

## 6. Security & Sanitization

- [OK] When setting locations or localStorage, you are using the correct APIs.
- [IMPROVEMENT] Validate all data used in requests or updates (e.g., `secilenNobetciId`) before using in fetch URLs or APIs.

**Suggested Correction:**
```pseudo
if (!/^\d+$/.test(secilenNobetciId)) {
  alert('Geçersiz nöbetçi ID');
  return;
}
```

---

## 7. Unhandled Failure Scenarios

- [IMPROVEMENT] If fetch fails and throws, some promises are unhandled.

**Suggested Correction:**
```pseudo
response = await fetch(...);
if (!response.ok) { /* handle as above */ return; }
let data;
try { data = await response.json(); }
catch { data = {}; }
```

---

## 8. Magic Numbers / Configuration

- [IMPROVEMENT] Extract interval values and other magic numbers to named constants at the top for easier configuration.

**Suggested Correction:**
```pseudo
const GUNCELLEME_ARALIGI_MS = 10000;

...

setInterval(..., GUNCELLEME_ARALIGI_MS);
```

---

## 9. General Optimization

- [IMPROVEMENT] Check all selectors (`getElementById`, `querySelector`) for `null`, or use optional chaining or guard clauses.

---

## Summary Table

| **Issue**          | **Severity** | **Recommendation / Correction**                  |
|--------------------|--------------|--------------------------------------------------|
| Error property safe access      | Major        | Check if `error` has required fields safely      |
| Inline style in notification   | Minor        | Prefer CSS classes for styling                   |
| Repeated interval creation     | Major        | Prevent multiple intervals or memory leaks       |
| Magic number intervals         | Minor        | Use named constants                              |
| Data validation on ID usage    | Major        | Regex or type validation for external input      |
| Fetch error handling sequence  | Major        | Use `response.ok` before `.json()`              |

---

## Sample Improved Pseudocode

```pseudo
// Top of file:
const GUNCELLEME_ARALIGI_MS = 10000;

function handleApiError(error, defaultMessage = 'Bir hata oluştu') {
  if (error && typeof error.status !== 'undefined' && error.status === 401) {
    // ...
  }
  // ... rest unchanged
}
```

```pseudo
async function loadInitialDataAndSetupInterval() {
  if (getNobetcilerIntervalId !== null) return;
  // ... rest unchanged
}
```

```pseudo
// In addAktifNobetciChangeListener:
if (!/^\d+$/.test(secilenNobetciId)) {
  alert('Geçersiz nöbetçi ID');
  return;
}
```

---

## Final Notes

This review covered robustness, code clarity, baseline security, and maintainability. Please refactor as above, and consider centralizing configuration and CSS for further maintainability.