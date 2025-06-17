# Security Vulnerability Report for `public/js/main.js`

This report analyzes solely **security vulnerabilities** that may exist in the provided JavaScript code. No other aspects (maintainability, performance, etc.) are considered.

---

## Table of Contents

- [1. Token Handling in Local Storage](#1-token-handling-in-local-storage)
- [2. Excessive Logging of Sensitive Information](#2-excessive-logging-of-sensitive-information)
- [3. Exposed Internal Errors](#3-exposed-internal-errors)
- [4. Insufficient Input Sanitization](#4-insufficient-input-sanitization)
- [5. Insufficient Error Handling in Fetch Requests](#5-insufficient-error-handling-in-fetch-requests)
- [6. Lack of CSRF Protection](#6-lack-of-csrf-protection)

---

## 1. Token Handling in Local Storage

**Issue:**  
The code accesses the JWT token directly from `localStorage` to set the `Authorization` header in `fetch` requests:

```js
'Authorization': 'Bearer ' + localStorage.getItem('token')
```

**Security Risk:**  
- Storing sensitive tokens in `localStorage` is susceptible to **XSS attacks**: if any malicious JavaScript comes to run on the page (e.g., via a script injection), it can read and exfiltrate the user's token.
- Local storage is accessible from any JavaScript running on the origin.

**Recommendation:**  
- Prefer using **httpOnly cookies** for sensitive tokens, as they are inaccessible to JavaScript.
- Review the codebase for possible XSS vectors.

---

## 2. Excessive Logging of Sensitive Information

**Issue:**  
The code uses `console.log` and `console.error` with potentially sensitive internal errors and responses:

```js
console.error('API Error:', error);
console.error('Initialization error:', error);
console.log(data.message || `Nöbetçi ID ${secilenNobetciId} aktif olarak ayarlandı.`);
```

**Security Risk:**  
- Logs may reveal sensitive implementation details or user information, which can leak if the browser controls are accessed maliciously or if the logs are shipped to external tools.
- In production, error details should be minimized, especially if they could contain sensitive server responses.

**Recommendation:**  
- Sanitize what is logged to the console.
- Minimize logging of sensitive or detailed internal errors in production environments.

---

## 3. Exposed Internal Errors

**Issue:**  
Error messages are sometimes shown to users, for example:

```js
const message = error.message || defaultMessage;
showNotification(message, 'error');
```

and

```js
alert(data.error || `Sunucu hatası: ${response.status}`);
```

**Security Risk:**  
- Displaying raw error messages to users may expose sensitive server/internal details (stack traces, paths, etc.) that can assist an attacker in probing for vulnerabilities.

**Recommendation:**  
- Only display user-friendly error messages (avoid exposing internal exception information).

---

## 4. Insufficient Input Sanitization

**Issue:**  
- User-provided content (such as error messages, or any data fetched from the server and displayed, e.g., via `showNotification`) is directly inserted into the DOM as `textContent` in notifications.

**Current status:**
```js
notification.textContent = message;
```

- Using `textContent` (not `innerHTML`) is a **good practice** against XSS when setting notification content.
- However, this **assumes all other DOM insertions** also use safe methods, and it is not verified if any user-controlled input is inserted through other means elsewhere in the codebase.

**Security Risk:**  
- The risk is minimal in this snippet for notifications, but any future migration to `innerHTML` or interpolation might open an XSS vector.

**Recommendation:**  
- Carefully audit all instances where user/remote data is inserted into the DOM.
- Continue to use `textContent` or equivalent safe APIs.

---

## 5. Insufficient Error Handling in Fetch Requests

**Issue:**  
Error handling in fetch requests and server responses is mainly based on the returned HTTP status. If the backend does not implement strict authorization, rate limiting, or input validation, clients may inadvertently expose themselves to vulnerabilities (e.g., unauthorized access). The JavaScript frontend does not enforce security—it must be enforced on the backend.

**Security Risk:**  
- Relying on client-side checks (such as proper status codes, or removal of tokens in 401) does **not** prevent API misuse or data leakage, if the backend is not robustly secured.

**Recommendation:**  
- Ensure strict authentication/authorization on the backend – **never trust client-side checks**.
- The frontend can only reinforce UX, not security boundaries.

---

## 6. Lack of CSRF Protection

**Issue:**  
The fetch requests (e.g. for `set-aktif`) are protected using an Authorization: Bearer token header sent from localStorage, but are **not protected** against CSRF if the token leaks or if the user is tricked into reusing a token in a malicious context.

**Security Risk:**  
- Using Bearer tokens in JavaScript-accessible storage (as discussed) makes them vulnerable to XSS and CSRF-like attacks if any browser bug or user behavior causes the token to leak.

**Recommendation:**  
- If possible, implement CSRF protection server-side (e.g., double submit cookie technique, or using same-site cookie attributes if sessions are used instead of tokens).
- Restrict token usage by IP or user agent if applicable.

---

## Summary Table

| Issue                                        | Risk Level | Recommendation                                                |
|----------------------------------------------|------------|---------------------------------------------------------------|
| Token in Local Storage                       | High       | Use httpOnly/session cookies or review/token access policies  |
| Console Logging of Internal Errors           | Medium     | Sanitize logs, err on side of not exposing details            |
| User-facing Internal Errors                  | Medium     | Show only generic errors to users                             |
| Input Sanitization for Notifications         | Low-Med    | Continue to use `textContent`; audit other insertions         |
| Relying on Client-side Error Handling        | High       | Enforce all security on backend                               |
| Possible Lack of CSRF Protection             | High       | Use CSRF tokens or secure cookies if possible                 |


---

# Recommendations (Action Items)

1. **Move JWT token to HttpOnly cookies** if possible.  
2. **Review all console logs and user error messages** for sensitive/internal information—display only generic messages.
3. **Audit all DOM insertions** for XSS risks; stick with `.textContent` over `.innerHTML`.
4. **Enforce authentication, authorization, and rate limiting** on the backend, not just in frontend checks.
5. **Evaluate need for CSRF mitigation** appropriate to token mechanism; consider alternative auth strategies.

---

> **Note:** This report is based only on the provided `public/js/main.js` file and does not cover other parts of the application or server-side code. For a robust security posture, a full application security review is recommended.

---