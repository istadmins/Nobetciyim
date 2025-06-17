# Security Vulnerability Report for `nobetciIslemleri.js`

## Overview

This report focuses **exclusively** on security vulnerabilities present in the provided JavaScript code. This is a client-side script interacting with a backend through various endpoints, handling sensitive operations such as user creation, credential handling, password resets, and the editing of personally identifiable information.

---

## Summary Table

| Vulnerability              | Description                                                      | Severity | Recommendations                       |
|----------------------------|------------------------------------------------------------------|----------|---------------------------------------|
| Insecure Storage           | JWT tokens in `localStorage`.                                   | High     | Move to `httpOnly` cookies.           |
| Sensitive Data in DOM      | Password and tokens possibly exposed in DOM or logs.             | High     | Minimize log output and DOM exposure. |
| Sensitive Data in URL      | User IDs and sensitive params in URLs.                           | Medium   | Use POST data when possible.          |
| XSS via DOM Injection      | Unescaped user data injected into DOM using `innerHTML`.         | High     | Use textContent/set safe encoders.    |
| No Rate Limiting           | Password reset and account deletion initiated via JS.            | Medium   | Enforce backend rate limits/audit.    |
| Weak Prompt-based Entry    | User editing of phone numbers and Telegram IDs via `prompt`.     | Medium   | Use validated forms.                  |
| Lack of Input Validation   | Minimal or no sanitization on user input before sending to API.  | Medium   | Validate/sanitize input client-side.  |
| Error Leaks                | Possible verbose error messages shown to user.                   | Low      | Sanitize errors, show generic alerts. |

---

## Detailed Findings

### 1. Insecure Storage of Authentication Tokens

**Issue:**  
Token is read from `localStorage` and added to the `Authorization` header in multiple places (e.g., `Authorization: 'Bearer ' + localStorage.getItem('token')`).

**Implications:**  
- Tokens in `localStorage` are accessible via **any JavaScript executing in the page context**, allowing XSS exploits to steal tokens.
- Exposes the system to session hijacking and privilege escalation upon successful XSS.

**Recommendation:**  
- Store tokens in **httpOnly cookies** set by the server, which are inaccessible to JavaScript.
- If not possible, mitigate XSS risk as much as possible (see sections on DOM injection below).

---

### 2. Sensitive Data Handling: Passwords and JWT

**Issue:**  
- Passwords handled in the DOM (`document.getElementById('password')`) and sent to the backend in clear JSON.
- New passwords returned in plaintext in an alert (`alert('Yeni şifre: ' + data.newPassword ...)`).

**Implications:**  
- Potential attackers inspecting the JS or DOM can grab passwords.
- Plaintext passwords are leaked to anyone able to perform XSS or intercept browser state.
- Displaying plaintext new passwords in alerts exposes them to shoulder surfing or logs.

**Recommendation:**  
- Never transmit plaintext passwords outside secure, rate-limited channels.
- For password reset, send emails, not plaintext in the front-end.
- Mask password displays and avoid outputting sensitive data in browser alerts.

---

### 3. User Data Injection into the DOM

**Issue:**  
- User data (name, Telegram ID, phone number) is injected into DOM using `innerHTML` in the following block:
  ```js
  tr.innerHTML = `
      ...
      <td>${nobetci.name}</td>
      <td class="telegram-id-cell" data-nobetci-id="${nobetci.id}">${telegramId}</td>
      <td class="telefon-no-cell" data-nobetci-id="${nobetci.id}">${telefonNo}</td>
      ...
  `;
  ```

**Implications:**  
- If the backend does not properly sanitize/store user-supplied data, **reflected or persistent XSS** is possible by injecting HTML or script tags into these fields.

**Recommendation:**  
- Replace innerHTML with building individual DOM elements (using `textContent` for inserting untrusted data).
- Sanitize all user fields on both client and server.

---

### 4. Sensitive IDs and Parameters in URLs

**Issue:**  
- Many API endpoints directly embed regular user/account IDs as path parameters in the URL (e.g., `/api/nobetci/${id}`, `/api/nobetci/reset-password/${id}`).

**Implications:**  
- User IDs and possibly sensitive tokens can leak through logs, browser history, or referer headers.
- Endpoint protection relies totally on authentication/authorization, which is vulnerable to ID enumeration unless the backend applies strict access controls.

**Recommendation:**  
- Always verify authorization server-side.
- Consider using opaque identifiers or keeping sensitive changes in POST bodies.
- Avoid transmitting extra-sensitive data in URLs.

---

### 5. User Input via Prompt Boxes

**Issue:**  
- Edits to Telegram ID and phone number are made using unvalidated `prompt` dialogs. Input is sent directly to the backend API.

**Implications:**  
- Prompt input can include invalid or malicious data (even scripts if the server reflects them in responses).
- Poor UX leads users to enter unpredictable data.

**Recommendation:**  
- Replace with **form-based modals** with input validation (regex checks for phone numbers, etc.).
- Validate both client-side and server-side.

---

### 6. Minimal Client-Side Validation/Sanitization

**Issue:**  
- Only rudimentary validation is performed, e.g., `nameInput.value.trim()` checked only for non-emptiness. No checks for string length, character set, format, etc.

**Implications:**  
- Potential for malformed or malicious payloads to reach backend.
- Increased risk of XSS/persistence if backend is not protected.

**Recommendation:**  
- Add format validation for all user-supplied data client-side.
- Always perform full validation/sanitization server-side.

---

### 7. Possible Exposure of Error Details

**Issue:**  
- Error messages from `fetch` responses and caught exceptions are sometimes directly displayed to users.

**Implications:**  
- May reveal internal information (error strings, stack traces, etc.) useful to attackers.

**Recommendation:**  
- Show only generic error messages to non-admin users.
- Log detailed errors server-side only.

---

### 8. Rate Limiting/Abuse Prevention Not Visible in JS

**Issue:**  
- Operations like password reset and deletion can be called (with valid credentials) as many times as desired from the UI.

**Implications:**  
- With compromised credentials, attackers can spam account deletions or password resets.

**Recommendation:**  
- Backend MUST implement rate limiting, logging, and potentially require extra confirmation for sensitive operations.

---

## Conclusion

**The most critical issues are:**
- Insecure use of `localStorage` for tokens (susceptible to XSS-based token theft)
- User data insertion via `innerHTML` (potential for XSS)
- Weak authentication flows (password resets showing new password in browser alert)
- Insufficient input validation and use of raw prompts for user data changes

**General actions:**
1. **Move tokens to httpOnly, secure cookies.**
2. **Always use `textContent` or proper encoding libraries for mixing user data with HTML.**
3. **Strong client- and server-side input validation and sanitization.**
4. **Implement and require rate limiting on sensitive operations.**
5. **Never expose sensitive responses (like new passwords) in plain browser alerts.**

If these weaknesses are not addressed, the entire system is vulnerable to privilege escalation, session hijacking, XSS, and potential user data leaks.

---

## References

- [OWASP XSS](https://owasp.org/www-community/attacks/xss/)
- [LocalStorage Security Risks](https://auth0.com/docs/secure/tokens/storage)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [Secure Password Reset Practices](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

---

**This report covers code-side security concerns; backend implementation and API logic must also be carefully reviewed.**