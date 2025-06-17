# Critical Code Review (calendarUtils.js)

This review addresses code standards, optimizations, robustness, and possible errors or improvements as per industry standards.

---

## 1. General Observations
- Code is documented well in Turkish.
- Functions are asynchronous where necessary.
- Use of Promises is correct.
- Direct use of raw SQL is seen (usually OK but always sanitize inputs).
- Date manipulations can be tricky; needs thorough attention.

---

## 2. Function-Specific Feedback

### getWeekOfYear(date)

#### Issues found:

1. **Date Manipulation without Timezone Handling**
   - Using `new Date()` and manipulating it may yield unreliable results near year boundaries, especially in different timezones.
2. **ISO 8601 Calculation May Drift**
   - Calculation for start of the week is manually constructed. Could be simplified and more robust using standard libraries or stricter algorithms.
3. **Leap Year and Corner Case Test Needed**
   - Test for Dec 31 edge cases.

#### Suggested (Pseudocode) Correction:
```pseudocode
// Consider using a library like date-fns/getISOWeek if available
// Otherwise, add strict input validation and clarify the UTC context
if not (date is a valid Date instance):
    throw new Error('Invalid date passed to getWeekOfYear')
// (optionally: ensure input date is in UTC, if wanted consistency)
```

---

### getAllNobetcilerFromDB()

#### Issues found:

- Function is clean. Error handling and Promise logic OK.
- **SQL Injection: low risk here as there is no user input, but prefer parameterized statements always for future maintainability.**

---

### getResortConfigFromDB()

#### Issues found:

- **Default Object Instantiation Inside Callback**
    - Defining `defaultConfig` inside the callback causes unnecessary allocation every call.
- **(Minor) Error Logging**
    - Potential information leakage; add levels (e.g., error, warn).
- **Promote Use of `db.getSettings()`**
    - If available, provide consistency and DRY for db settings.

#### Suggested Correction (Pseudocode):
```pseudocode
// Move defaultConfig outside the function to avoid reallocation, e.g.
const defaultConfig = { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };

// Inside getResortConfigFromDB:
resolve(row && row.ayar_value ? JSON.parse(row.ayar_value) : defaultConfig)
catch JSONParseError:
    log error as error-level, not generic console.error
    resolve(defaultConfig)
```

---

### getAsilHaftalikNobetci(date)

#### Issues found:

1. **Input Validation**
    - Date argument should be validated before use.
2. **Potential for Infinite Waits/Unhandled Rejection**
    - If db layer hangs, the function could stall indefinitely. Consider adding a timeout wrapper around Promises returned here.
3. **Inefficient Multiple DB Queries**
    - If `override` exists, fetches `getNobetciById()` for the same data. Ideally, the override query should already join Nobetciler to get all needed columns (see comment in code).
4. **Week Offset Calculation**
    - The fallback yearStartDateForWeekCalc and its use in modulo arithmetic might misbehave with negative numbers (JS `%` can yield negative)! Should ensure always non-negative index.
5. **Error Handling**
    - Logging error.stack may leak stack information; use consistent error formatting, consider logging only the message unless debugging.

#### Suggested Correction (Pseudocode):

```pseudocode
if not (date is valid Date instance):
    throw Error('Invalid date passed to getAsilHaftalikNobetci')

// Fix week index modulo math to always yield non-negative index
nobetciSiraIndex = ((haftaNo - weeksOffset) % nobetciler.length + nobetciler.length) % nobetciler.length

// If override query is changed, make sure it returns telegram_id as well, avoiding an extra query
```

---

## 3. General Code Quality Suggestions

- **Import order:** Place all external library imports first.
- **Async/Await Consistency:** Where possible, use `await`/Promise-based db interfaces instead of callbacks.
- **Magic Numbers:** For week/day numbers, consider defining constants for clarity.
- **Timezones:** Clarify timezone logic—document that calculations are local or UTC and why.
- **Tests:** No actual test code present. Date handling (esp. weeks) needs explicit boundary testing.
- **TypeChecking:** Add parameter checks at function entry points.
- **Error Handling:** Prefer logging via structured logger and avoid leaking stack traces unless debugging.

---

## 4. Summary Table of Key Fixes

| Area                            | Type          | Issue/Suggestion                                                       | Pseudocode Correction (Add only these lines)                                       |
|----------------------------------|--------------|-----------------------------------------------------------------------|------------------------------------------------------------------------------------|
| getWeekOfYear(date)              | Bug Risk     | Input type safety                                                      | `if not (date is Date): throw Error('Invalid date')`                               |
| getResortConfigFromDB            | Optimization | Move defaultConfig outside function                                    | `const defaultConfig = {...};` (globals)                                           |
| getAsilHaftalikNobetci           | Bug Risk     | Week index modulo might go negative                                    | `nobetciSiraIndex = ((haftaNo - weeksOffset) % len + len) % len`                   |
| getAsilHaftalikNobetci           | Optimization | Query joins for override (avoid extra DB hit)                          | `Include telegram_id in override query`                                             |
| All functions                    | Robustness   | Input validation                                                       | `if invalid param: throw Error('...')`                                             |
| All functions                    | Logging      | Structured error logging                                               | `logger.error('[msg]', err.message)`                                               |
| All date calculations            | Documentation| Clarify time zone (local vs UTC) in doc                                | `// All dates in local time (or UTC).`                                             |

---

## 5. Example Corrected Lines (Pseudo-code Only)

```pseudocode
// Before any date ops:
if not (date is a Date object): throw Error('Invalid date')

// Move to file head:
const defaultConfig = { aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 };

// When calculating indices:
nobetciSiraIndex = ((haftaNo - weeksOffset) % nobetciler.length + nobetciler.length) % nobetciler.length

// In logging:
logger.error('[getAsilHaftalikNobetci]', error.message/*, optionally error.stack for debugging only*/)
```

---

## 6. Conclusion

The code is overall clean and achieves its intended logic. However, input validation, modulo arithmetic, error logging, and (minor) optimization in database querying should be addressed to ensure maintainability and robustness in a production environment. Date logic should be tested against edge cases, especially year transitions.

**Add the above pseudocode lines in the appropriate places for improved safety and clarity.**