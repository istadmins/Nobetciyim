# Security Vulnerability Report for `hesaplama.js`

This report identifies and explains **only security vulnerabilities** found in the provided code. Code quality, logic, and performance issues are not included unless they directly relate to security.

---

## 1. Use of `localStorage` for JWT Token

**Line:**
```js
'Authorization': 'Bearer ' + localStorage.getItem('token')
```

**Vulnerability:**  
**Insecure Storage of Sensitive Data**  
Storing JWT tokens in `localStorage` exposes the application to **XSS (Cross-Site Scripting)** attacks. If any part of the site can be exploited for XSS, an attacker can steal all users' tokens and impersonate them.

**Recommendation:**  
- Consider using **HTTP-only cookies** for sensitive tokens to mitigate XSS stealing.
- Ensure all code paths prevent XSS to minimize risk.

---

## 2. Potential DOM-based XSS via `textContent` and Value Handling

**Lines:**
```js
const krediText = satir.cells[0].textContent;
const aciklamaText = satir.cells[1].textContent; 
const tarihText = satir.cells[2].textContent; 
//...
payEdilenKrediHucresi.textContent = buNobetcininPayi;
```

**Vulnerability:**  
While `textContent` is safer than `innerHTML`, users or attackers may be able to inject malicious input into fields such as credit descriptions (`aciklamaText`) or other text inputs. If this data is later rendered using `innerHTML` elsewhere, this can lead to XSS. There is no input validation or sanitization shown for user-controlled content.

**Recommendation:**  
- Ensure user input used in UI or in calculations is sanitized and validated.
- Avoid using `innerHTML` with user-supplied data unless fully sanitized.

---

## 3. Absence of CSRF Protection

**Context:**  
The code makes a `PUT` request to `/api/nobetci/pay-edilen-kredileri-guncelle` using a bearer token from local storage.

**Vulnerability:**  
- If the API server accepts tokens from `localStorage` (via Authorization header) and the user is tricked into visiting a malicious site (with open CORS or misconfiguration), Cross-Site Request Forgery might be possible in certain scenarios.
- The vulnerability is less pronounced with Authorization headers than cookies, but still, **ensuring correct CORS handling and using SameSite cookies if relevant** are important considerations.

**Recommendation:**  
- Verify server-side that CORS is restrictive and tokens can't be used from 3rd-party origins.
- If cookies are used, ensure they are SameSite and CSRF protected.

---

## 4. Lack of Input Validation / Type Checking on Field Values

**Lines:**
```js
const hafta_sonu_kredi_degeri = haftaSonuKrediInput && haftaSonuKrediInput.value !== "" ? parseInt(haftaSonuKrediInput.value) : 0;
... // Similar uses for other .value fields
const kredi = parseInt(krediInput.value);
...
const kredi = parseInt(krediText);
...
const id = parseInt(satir.dataset.id);
```

**Vulnerability:**  
- There is inconsistent validation for user-supplied numerical inputs. Without strict validation, a malicious user could potentially inject invalid or harmful values.
- Using `parseInt` without enforcing integer and range constraints could lead to overflows, NaN, or unexpected calculations downstream.

**Recommendation:**  
- Use **explicit validation** for all user-input fields (e.g., via HTML5 `type="number"`, or JS checks).
- Validate that IDs and credit values are finite positive integers and in expected ranges before using or sending them to backend.

---

## 5. Untrusted Data via DOM Manipulation

**Lines** (potentially unsafe, if not controlled):
```js
const nobetciSatirlari = document.querySelectorAll('#nobetciTable tbody tr');
```

**Vulnerability:**  
- If the server or another script can insert malicious rows (e.g. with `data-id` or manipulated `class` attributes), calculations may include or update unintended recipients.
- The full attack scenario depends on how DOM is composed and who controls the data.

**Recommendation:**  
- Always sanitize data coming from server or user input before updating the DOM.
- Use strict selectors and never trust `dataset` values without validation.

---

## 6. Error Leakage via `console.error` and `alert`

**Lines:**
```js
console.error("Pay edilen krediler güncellenirken sunucu hatası:", data.error || response.status);
alert("Pay edilen krediler veritabanına kaydedilirken bir hata oluştu.");
```

**Vulnerability:**  
- Error objects and internal details may be exposed via console or (in other code) via `alert`.
- While not a direct security vulnerability on its own, logging error objects received from the server can inadvertently expose sensitive information.

**Recommendation:**  
- Avoid disclosing detailed error messages to the client. Log them securely on the server only.

---

## 7. No Rate Limiting or Abuse Protection on Client-side

**Context:**  
- The function can be called repeatedly to flood server endpoints with requests.

**Vulnerability:**  
- Automated abuse or denial-of-service risk if endpoints are not protected on the server.
- Not a vulnerability in JS directly, but should be considered for endpoints.

**Recommendation:**  
- Implement **server-side** rate limiting and abuse protection.

---

# Summary Table

| Vulnerability                                         | Severity | Recommendation                                    |
|------------------------------------------------------|----------|---------------------------------------------------|
| JWT token in localStorage                            | High     | Use HTTP-only cookies for JWT tokens              |
| XSS and Input Validation issues                      | Medium   | Validate/sanitize all user input                  |
| Potential CSRF or CORS misconfigurations             | Medium   | Restrict CORS, use SameSite cookies, validate origin |
| Use of parseInt without validation                   | Medium   | Explicit type check and value range validation    |
| Trusting DOM data and dataset values                 | Low-Med  | Sanitize data before DOM use                      |
| Error details exposed via console/alerts             | Low      | Limit error info on client                        |
| Lack of client/server-side rate limiting             | Low      | DoS protection implemented server-side            |

---

# Conclusion

The core issues revolve around use of `localStorage` for JWT tokens, potential unvalidated input leading to XSS, and lack of strict input/type validation. Root these out first, then audit any server endpoints and CORS for abuse and data leaks.

---

**Note:**  
Some vulnerabilities may be mitigated by other code or server configurations not provided here, but based solely on the provided file, the above issues should be considered and addressed before production deployment.