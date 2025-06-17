# Critical Code Review Report  
**File: `Nobetciyim/telegram_bot_handler.js`**  
_This report highlights problems, anti-patterns, and non-optimized segments in the code as per industry standards. It suggests corrections using pseudo code style._

---

## General Observations

- **Separation of Concerns (SoC):**  
  The file mixes bot initialization, command registration, utility functions, and business logic. For scalability and maintainability, these should be separated into modules.

- **Error handling:**  
  Some catch/resolve/reject paths do not call `return` after handling, possibly leading to unintended side effects.

- **Promises and Async/Await:**  
  There is redundant wrapping of functions in new `Promise`, especially since SQLite3 already supports callbacks. Consider promisifying db access separately.

- **Security Risks:**  
  - Sensitive tokens are taken from `process.env` but not validated robustly.
  - Error messages from APIs are returned directly to user in some places (can leak info).

- **Unoptimized Data Handling:**  
  Data is sometimes manipulated in JS which could be handled more efficiently in SQL, especially credit comparison loops.

- **Logging:**  
  `console.error` is used; in production, use a robust logger (e.g. Winston, Bunyan).

---

## Detailed Findings & Suggestions

### 1. **Promise wrapping with callbacks**

**Found code:**
```javascript
async function getAuthorizedNobetciByTelegramId(telegramId) {
    return new Promise((resolve) => {
        db.get(..., (err, row) => { ... });
    });
}
```
**Problem:**  
Using Promises to wrap callback-style DB access increases boilerplate and hinders readability.

**Suggestion:**
```pseudocode
// Use util.promisify for DB methods at initialization:
// const util = require('util');
// db.getAsync = util.promisify(db.get);

// Then:
// let row = await db.getAsync(...);
```

---

### 2. **Error/Promise Handling**

**Found code:**
```javascript
        if (err) { 
            console.error("Takvim açıklaması alınırken hata:", err.message); 
            resolve(null); 
        } else {
            resolve(row ? row.aciklama : null);
        }
```
**Problem:**  
After catching an error and resolving `null`, the function still continues. Could lead to multiple resolve calls in rare cases.

**Suggestion:**
```pseudocode
if (err) { 
    log_error(...); 
    resolve(null); 
    return; 
}
resolve(row ? row.aciklama : null);
```

---

### 3. **Timezone Handling**

**Found code:**
```javascript
const today = new Date();
const nextWeek = new Date(today);
nextWeek.setDate(today.getDate() + 7);
```
**Problem:**  
`Date` without timezone management will give unreliable results across locales.

**Suggestion:**
```pseudocode
// Use a library like dayjs or moment and always set explicit timezones.
const today = dayjs().tz('Europe/Istanbul');
const nextWeek = today.add(7, 'day');
```

---

### 4. **Week Number Calculation (ISO 8601 standard)**

**Found code:**
```javascript
function getWeekInfo(date) {
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startDate) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil(days / 7);
    return { year: date.getFullYear(), week: weekNumber };
}
```
**Problem:**  
This logic is not ISO-compliant (weeks start on Monday).

**Suggestion:**
```pseudocode
function getWeekInfo(date) {
    // Using dayjs ISOWeek
    weekNumber = dayjs(date).isoWeek();
    year = dayjs(date).isoWeekYear();
    return { year, week: weekNumber };
}
```

---

### 5. **Kredi Calculation Loop Inefficiency**

**Found code:**
```javascript
for (const mevcutNobetci of nobetcilerFullData) {
  for (const digerNobetci of nobetcilerFullData) {
    if (mevcutNobetci.kredi > digerNobetci.kredi) { ... }
  }
}
```
**Problem:**  
O(n²) complexity, unnecessary recalculation; credit difference/position can be handled in SQL or by pre-sorting once.

**Suggestion:**
```pseudocode
// After sorting, one loop to compare current candidate only with those with less credit:
sort(nobetcilerFullData, (a, b) => b.kredi - a.kredi);
for i = 0 to length-1:
    for j = i+1 to length-1:
        // Compare mevcutNobetci[i] with [j], since i has more credit than j, only in one direction.
```

---

### 6. **Sensitive Information Leakage**

**Found code:**
```javascript
botInstance.sendMessage(chatId, `❌ Şifre sıfırlanırken hata: ${error.response ? error.response.data.error : error.message}`);
```
**Problem:**  
Returning raw error messages may disclose sensitive details.

**Suggestion:**
```pseudocode
botInstance.sendMessage(chatId, "❌ Şifre sıfırlanırken bir hata oluştu. Lütfen tekrar deneyin veya yöneticinize başvurun.");
// Log actual error on server.
```

---

### 7. **Telegram Command / Message Handler: Async Error Handling**

**Found code:**
```javascript
botInstance.onText(/^\/aktif_nobetci$/, async (msg) => { ... });
```
**Problem:**  
If handler throws, it may not be reported/logged.

**Suggestion:**
```pseudocode
botInstance.onText(/^\/aktif_nobetci$/, (msg) => {
    (async () => {
        try {
            // ...code...
        } catch(e) {
            // Log error
        }
    })();
});
```

---

### 8. **Bot Initialization and Environment Variables Validation**

**Found code:**
```javascript
const botToken = process.env.TELEGRAM_BOT_TOKEN;
// ...later...
if (!botToken) { ... }
```
**Problem:**  
Bot token, API token, PORT, etc. Are loosely validated. Only botToken is checked stop-initialization. Others, if missing, might break application later.

**Suggestion:**
```pseudocode
// At the very top of initBot():
requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'INTERNAL_API_TOKEN', 'PORT'];
for each v in requiredEnvVars:
    if not process.env[v]: log_error(...); exit/init fail;
```

---

### 9. **Callback Query Data Validation (Security)**

**Found code:**
```javascript
const parts = data.split('_');
if (parts.length < 4 || parts[0] !== 'nobet' || parts[1] !== 'onay') { ... }
```
**Problem:**  
String split parsing is brittle; maliciously crafted callback data could trick logic.

**Suggestion:**
```pseudocode
// Use more robust, e.g. JSON.stringify for callback_data, then parse with try/catch
callback_data = JSON.stringify({ t: 'nobet_onay', action: 'evet', requestId });
```

---

### 10. **Uncaught Errors in Awaited Calls**

**Found code:**
```javascript
await botInstance.sendMessage(...);
```
**Problem:**  
If sendMessage throws (rate limit, network), could crash/leave in undefined state.

**Suggestion:**
```pseudocode
try {
    await botInstance.sendMessage(...);
} catch (e) {
    log_error(...);
}
```

---

## **Summary Table of Key Problem Areas**

| Issue        | Line(s) | Suggested Correction | Risk      |
|--------------|---------|---------------------|-----------|
| DB Promise Wrapping   | Many    | Use util.promisify or DB subclass | Efficiency, readability |
| Error returns leaking | `/sifre_sifirla`, etc. | Use generic error to client | Security, Info leak |
| ISO Week calculation  | getWeekInfo | Use dayjs/moment ISOWeek | Incorrect week, logic error |
| O(n^2) kredi loop     | kredi_durum loop | O(n log n) or SQL | Perf, scalability |
| Unsafe callback parsing| callback_query | Use JSON data | Security, correctness |
| Date/timezone         | All dates | Use timezone-aware date lib | Data correctness |
| Async handler errors  | All onText | Provide global error handler | Stability |

---

## **Suggested Pseudo Code Summaries**

#### Promisify DB at Init:

```pseudocode
import util
db.getAsync = util.promisify(db.get)
// Usage:
let user = await db.getAsync(SQL, params)
```

#### Week Calculation (ISO 8601):

```pseudocode
import dayjs
import dayjs/plugin/isoWeek
dayjs.extend(isoWeek)
let weekInfo = { year: dayjs(date).isoWeekYear(), week: dayjs(date).isoWeek() }
```

#### Credit Diff Loop Optimization:

```pseudocode
sort(users, (a, b) => b.kredi - a.kredi)
for i from 0 to N-1:
    for j from i+1 to N-1:
        fark = users[i].kredi - users[j].kredi
        ...
```

#### Secure Callback Data:

```pseudocode
// Instead of 'nobet_onay_evet_<id>'
callback_data = JSON.stringify({ type: "nobet_onay", action: "evet", reqId })
```

#### Secure Error Messaging:

```pseudocode
on error:
    log(error)
    sendUser("❌ Beklenmeyen bir hata oluştu, lütfen tekrar deneyin.")
```

---

## **Recommendations**

- **Refactor**: Split command handlers, database access, and notification utilities into individual files.
- **Promisify** DB access globally at load/init time.
- **Use** reliable date/time libraries (dayjs w/ tz, ISO week plugins).
- **Validate** all input and output that crosses trust boundaries (user, Telegram, API).
- **Robust logging** and do not leak internals to users.
- **Refactor inner loops and sort logic** for scalability.
- **Implement async error catches globally** for command handlers.

---

_End of Review_