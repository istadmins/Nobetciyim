```markdown
# Security Vulnerabilities Report

## File: `Nobetciyim/telegram_bot_handler.js`

This report analyzes the given Node.js Telegram bot handler for **security vulnerabilities only**. Findings reference the specific sections of code with recommended remediations.

---

## 1. **Sensitive Information in Environment Variables**

**Usage:**
```js
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;
```
**Potential Risks:**
- Failure to set these variables will log errors, but if the server environment is misconfigured or .env files are exposed, tokens could be leaked.
- Leakage of `INTERNAL_API_TOKEN` or `TELEGRAM_BOT_TOKEN` could allow attackers to control the Telegram bot or make authenticated local API calls as an internal user.

**Recommendation:**
- Ensure all `.env` or configuration files are NOT accessible publicly or via static hosting.
- Log redacted information or generic errors, never actual tokens, to logs.

---

## 2. **Hard-Coded and Exposed Local API URLs**

**Usage:**
```js
const localApiBaseUrl = `http://localhost:${process.env.PORT || 80}/api`;
```
**Risks:**
- The bot uses `localhost`. If executed on a misconfigured server or inside certain containers, `localhost` may be exposed if forwarded with misconfigured proxies, exposing APIs protected only by the `INTERNAL_API_TOKEN`.

**Recommendation:**
- Clearly document the expectation that the API is **never** exposed externally.
- Enforce firewall restrictions preventing external access to internal APIs.
- Prefer using unix domain sockets for local-only communications where possible.

---

## 3. **API Authorization Token Exposure in Client-Side/Logs**

**Usage:**
```js
await axios.post('...', {}, { headers: { 'Authorization': `Bearer ${INTERNAL_API_TOKEN}` } });
```
and error logging:
```js
console.error("[/nobet_al] Hata:", error.response ? error.response.data : error.message, error.stack);
```

**Risks:**
- If error objects or request/response info are logged with headers, tokens may leak to logs.
- If errors are inadvertently sent to users (happens repeatedly), info about internals may be disclosed.

**Recommendation:**
- Never log full error objects from Axios without sanitizing/removing headers/tokens.
- Only log sanitized error data, avoid sending internal error messages or stack traces to Telegram users.
- Use generic error messages in all user-facing APIs.

---

## 4. **Insecure Use of Markdown Formatting in sendMessage**

**Usage:**
```js
botInstance.sendMessage(chatId, mesaj, { parse_mode: 'Markdown' });
```
**Risks:**
- unescaped user-controlled or database-controlled values (e.g., `${nobetci.name}`) are interpolated into Markdown messages.
- This exposes to [Telegram Markdown injection attacks](https://core.telegram.org/bots/api#markdownv2-style), which can break formatting, cause confusing UIs, or, in some edge clients, cause issues. Also, inserting backticks, asterisks, underscores, and other Markdown characters from DB or user input can mess up the display or even create clickable links.
- The `/sifre_sifirla` command sends a new password as Markdown backticks. If the password contains Markdown-sensitive characters, it could be misformatted or become clickable.

**Recommendation:**
- Escape all interpolated user/database values (`name`, passwords, etc.) using a proper Markdown-escaping utility before sending.
- Consider switching to the [`parse_mode: 'MarkdownV2'`](https://core.telegram.org/bots/api#markdownv2-style) and always escape special characters. Or, use `'HTML'` if you can ensure no XSS/HTML-injection from data sources (if not, avoid and always escape).

---

## 5. **Timing Attacks / Enumeration via Authorization Checks**

**Usage:**
```js
const nobetci = await getAuthorizedNobetciByTelegramId(chatId);
if (!nobetci) { botInstance.sendMessage(chatId, "❌ Bu komutu kullanma yetkiniz yok."); return; }
```
**Risks:**
- Different response times could allow an attacker to enumerate valid Telegram IDs.
- Repeated attempts can allow an attacker to brute force/scan Telegram IDs to find valid users in the system.

**Recommendation:**
- Always use a constant response time for failed authorizations.
- Consider not revealing if the Telegram ID is valid or not in error messages.
- Optionally, rate-limit failed attempts.

---

## 6. **Sensitive Operations Without Additional User Verification**

**Usage:**
- `/sifre_sifirla` (Password Reset) is performed via the Telegram user alone.
- Attackers with access to someone's Telegram account can reset local passwords without any additional verification.

**Risks:**
- If a user’s Telegram is compromised, their password/account can also be reset instantly.

**Recommendation:**
- For sensitive actions (like password reset), require an additional verification step such as a code sent via out-of-band means (SMS, email), or at least confirm with current password or a secondary code.
- Log all sensitive actions and alert users by other means if possible.

---

## 7. **Stateful In-Memory Pending Transfer Structure**

**Usage:**
```js
const pendingTransferRequests = {};
```
**Risks:**
- If the bot restarts/updates, all pending transfer requests are lost. Attackers could try to induce restarts to mess with the bot state or force failed duty transfers, resulting in DoS for requests requiring approval.

**Recommendation:**
- While not a direct security risk unless bot process is controlled by an attacker, persistent state or recovery mechanisms are preferable for critical operations.

---

## 8. **Insufficient User Input Sanitization**

**Usage:**
- User data (names, telegram_id, etc.) are interpolated into bot messages and used as parameters in SQL queries.
- There is parameterization in SQLite queries, but outputs are not sanitized before being shown to other users.

**Risks:**
- Outputting attacker-supplied values to Telegram without escaping may cause formatting breaks, partial spoofing, or confusion.

**Recommendation:**
- Sanitize/escape all user/output values before sending to clients.
- Ensure all responses are free from spoofable data, especially when referencing other users or sensitive operations.

---

## 9. **Possible Information Disclosure in Error Handling**

**Usage:**
```js
botInstance.sendMessage(chatId, `❌ Şifre sıfırlanırken hata: ${error.response ? error.response.data.error : error.message});
```
and similar throughout.

**Risks:**
- Axios and other error objects can contain internal details (like stack trace, invalid queries, etc.), which may leak secrets, table names, data structure, or other sensitive info.
- Also, full error messages may expose internal logic to attackers.

**Recommendation:**
- Never pass raw error messages to users. Use user-neutral error texts.
- Exception: allow generic error strings such as "Beklenmedik bir hata oluştu, daha sonra tekrar deneyin."

---

## 10. **Insufficient Rate Limiting and Abuse Prevention**

**Usage:**
- No rate limiting on any commands (`/nobet_al`, `/sifre_sifirla`, etc.).

**Risks:**
- Abusers may spam commands, attempt brute-force, or cause denial-of-service.

**Recommendation:**
- Implement in-memory or persistent per-user (Telegram ID) rate limits and temporary blocks after repeated failures.

---

## 11. **SQL Database Handling**

**Usage:**
- Queries use parameterization (good).
- However, the result data is output verbatim into UI, which can cause injection-like issues for Markdown (see above).

**Risks:**
- Less likely for classic SQL injection, but possible for indirect social engineering or information leaks.

**Recommendation:**
- Maintain parameterized statements and always escape output before use.

---

# Summary Table

| Issue # | Description                                                         | Severity   | Recommendation                      |
|---------|---------------------------------------------------------------------|------------|-------------------------------------|
| 1       | Sensitive environment variables exposure                            | Critical   | Secure .env, never log full tokens  |
| 2       | Internal API can be externally accessible if misconfigured          | High       | Enforce firewalls, local-only APIs  |
| 3       | Token leakage in logs or errors                                     | High       | Sanitize errors/log messages        |
| 4       | Markdown injection                                                  | Medium/High| Escape all output, sanitize         |
| 5       | User enumeration/timing attacks                                     | Medium     | Constant time, rate limiting        |
| 6       | Inadequate verification on sensitive actions (reset password)       | High       | Add verification step               |
| 7       | In-memory pending requests lost on crash/restart (DoS risk)         | Medium     | Use persistent state or alerts      |
| 8       | Insufficient output sanitization                                    | Medium     | Escape all output values            |
| 9       | Internal info leakage in error messages                             | Medium     | Use generic error responses         |
| 10      | No rate limiting on commands                                        | Medium     | Implement rate limits               |
| 11      | Database output used verbatim in UI                                 | Low        | Escape/sanitize output              |

---

# General Remediation Plan

- **Implement sanitized error handling** for all user interactions.
- **Escape all database/user data** before inserting into Telegram messages with Markdown or HTML formatting.
- **Rate limit user commands.**
- **Securely store and restrict access to all secrets/configuration files.**
- **Add verification for sensitive operations** such as password reset.
- **Audit infrastructure** to ensure local APIs are not accidentally exposed externally.
- Review logging policies and exclude any sensitive data from logs.
```
