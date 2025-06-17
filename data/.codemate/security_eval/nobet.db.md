# Security Vulnerability Report: SQLite Database Schema

## Overview

This report identifies **security vulnerabilities** in the presented SQLite database structure. The evaluation focuses solely on the schema **(table design, relationships, and column types)** as per the code (a SQLite database/dump with DDL and sample data).

---

## 1. **Plaintext Storage of Sensitive Data**

### Findings

- **User passwords are stored in the tables `Nobetciler`, `Users`, and `nobetci` under the `password` column.**
  - While the example data shows bcrypt hashes (`$2b$10$...`), the schema itself allows storage of plaintext.
- **Token and possibly sensitive reset data (columns like `reset_password_token` and `reset_password_expires` on `Users`) are not restricted in type or secured.**

### Risk

- If passwords are ever inserted as plaintext (by coding error or inconsistency), user accounts are immediately at risk.
- Mishandling or leaking the database file would disclose usernames, tokens, emails, password hashes, and potentially plaintext passwords.

### Recommendations

- **Document and enforce password hashing at the application level**; the schema, as is, cannot enforce hash constraints.
- Add database comments to clarify "password MUST be hashed" for future maintainability.
- Consider limiting excessive PII (e.g., phone, telegram IDs) and encrypting at rest if possible.

---

## 2. **Sensitive Data Exposure**

### Findings

- The tables store sensitive PII such as:
  - Emails (`Users`)
  - Telegram IDs and phone numbers (`Nobetciler`)
- No built-in protection against data leakage (e.g., accidental dumps, backups shared).

### Risk

- Direct database access grants unfettered access to PII.

### Recommendations

- Use strict access control at the application/database file level.
- When exporting or backing up, redact sensitive fields where feasible.
- Apply data minimization: only store required PII.

---

## 3. **No Column Constraints for Data Sensitivity**

### Findings

- `telegram_id`, `telefon_no`, `email`, etc., are assigned as `TEXT` with no format validation (e.g., via CHECK constraints).
- The schema does not leverage field-level `CHECK`s to restrict pattern/length where security could be enhanced.
- For `reset_password_token`, no expiry enforcement or length bounds.

### Risk

- Allows insertion of invalid (or maliciously long input), increasing attack surface (DoS, overflows).

### Recommendations

- Add reasonable maximum lengths (e.g., `email TEXT(255)`).
- Use `CHECK` constraints for `email`, phone, and token formats when possible.

---

## 4. **No Auditing/Logging Fields**

### Findings

- No fields such as `created_at`, `updated_at`, or `last_login` for tracking data changes/actions.

### Risk

- Inability to detect suspicious activity in the database itself (tampering, mass account creation, etc.).

### Recommendations

- For sensitive applications, add auditing fields and/or implement triggers for access logs.

---

## 5. **Account Enumeration via Unique Constraints**

### Findings

- `username` in `Users` is `UNIQUE`.

### Risk

- When used in APIs, it can enable username enumeration (i.e., system reveals whether a user exists).

### Recommendations

- Application logic should handle user existence errors generically.
- Consider security-in-depth: at the database level, this is acceptable but application-level care is required.

---

## 6. **No Field Encryption or Masking**

### Findings

- No encryption for highly sensitive fields (`password`, `reset_password_token`, `email`, phone).

### Risk

- Database compromise yields all sensitive data in clear text or as irreversible hashes only for `password`.

### Recommendations

- Consider field-level encryption for tokens and PII.
- If SQLite is used in production, always use application-level encryption or file system encryption.

---

## 7. **Foreign Key Constraints and Data Integrity**

### Findings

- Foreign keys exist but not strictly enforced:
  - For example, `takvim_aciklamalari.nobetci_id_override` references `Nobetciler(id)` with `ON DELETE SET NULL`.
  - No `ON UPDATE` actions specified.
- Not a security flaw per se, but weak FK constraints can impact integrity and lead to broken access control if not handled consistently.

### Recommendations

- Ensure foreign key enforcement is enabled on the SQLite connection (`PRAGMA foreign_keys = ON;`).
- Review application logic for robust FK integrity.

---

## 8. **Potential Over-Privileged Database File**

### Findings

- No mention of database file access permissions or encryption.

### Risk

- If SQLite file permissions are lax, attackers with local access can trivially view/copy the database and exfiltrate all data.

### Recommendations

- Secure file permissions (`600` or owner-only).
- Deploy disk or DB-layer encryption in production.

---

## 9. **Reset Token Handling Insecurity**

### Findings

- `Users` table:
  - `reset_password_token TEXT`
  - `reset_password_expires INTEGER`

### Risk

- If tokens are reused, predictable, or not securely invalidated, accounts may be hijacked.
- Reset tokens being stored as `TEXT` with no constraints; could be vulnerable if code doesn't sanitize.

### Recommendations

- Enforce token invalidation and expiry strictly.
- Store only strong, random tokens.
- (Application logic, not schema, but worth noting).

---

## 10. **General Exposure of Email Addresses**

### Findings

- There are several email addresses stored which would be disclosed on DB compromise.

### Risk

- Possible phishing, spam, targeted attacks.

### Recommendations

- Mask or hash emails wherever direct lookup/display isn’t needed.

---

## 11. **Lack of Indexing for Security Logging**

### Findings

- No indexes supporting security logs.

### Risk

- If audit tables are ever added, lack of indexes would impede fast incident response.

### Recommendations

- Prepare for logging and auditing in future schema iterations.

---

# Summary Table

| Vulnerability                       | Risk                                             | Recommended Fix                                   |
|--------------------------------------|--------------------------------------------------|---------------------------------------------------|
| Plaintext or unvalidated password    | Credential compromise, data breach               | Always enforce hashing, add schema comments       |
| Sensitive PII exposure               | Identity theft, privacy violation                | Encrypt, restrict access, minimize stored PII     |
| No column validation (TEXT fields)   | Data validity, injection, overflows              | Use CHECKs, length limits                        |
| No auditing/log fields               | Tampering undetected                             | Add created_at/updated_at, consider triggers      |
| Username enumeration                 | Brute-force/targeted attack                      | Application must give generic error messages      |
| No encryption or masking             | Easy data theft if DB leaked                     | Encrypt fields, secure at rest                    |
| FK integrity not enforced everywhere | Broken access control, cascading deletion issues | `PRAGMA foreign_keys = ON;`, review ON DELETE     |
| Permission issues on DB file         | Unauthorized access                              | File permissions, disk encryption                 |
| Password reset token mishandling     | Account hijack                                   | Strong token practice and expiry enforcement      |
| General email exposure               | Phishing, spam                                   | Mask or hash in non-critical contexts             |

---

# Conclusion

The **database schema exposes significant risks if deployed as-is without strong application-layer controls and operational security**. 
While many risks are mitigated at the application level, consider strengthening your schema with:

- Strict format and length constraints
- Comments on sensitive fields
- Preparation for encryption and logging
- Defensive default permissions

**Always secure the database file and all backup copies, as SQLite is file-based and thus especially vulnerable to exfiltration.**

---

For further security, perform a review of:

- Application code (ORM usages, input sanitization, query security)
- Operational/database backup procedures
- Access log pipelines

---

**End of security vulnerabilities report**