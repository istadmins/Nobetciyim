## High-Level Documentation

This code module provides a set of security-related middlewares for an Express.js application in Node.js, focusing on rate limiting, authentication, authorization, logging, and error handling.

### 1. **Rate Limiting**
- **Purpose:** To prevent abuse and brute-force attacks by limiting the number of requests from a particular IP address.
- **Components:**
  - **`generalLimiter`**: Global rate limit configurable via environment variables (defaults: 100 requests per 15 minutes).
  - **`authLimiter`**: Strict limiter for authentication endpoints (5 tries per 15 minutes).
  - **`passwordResetLimiter`**: Very strict limiter for password reset endpoints (3 requests per hour).
- **Behavior:** If limits are exceeded, a warning is logged and a `429 Too Many Requests` response with a custom error message is sent.

### 2. **Authentication Middleware**
- **`authenticateToken`**: Verifies the presence and validity of a JWT token in the Authorization header.
  - If missing, responds with `401 Unauthorized`.
  - If invalid, responds with `403 Forbidden` and logs the attempt.
  - On success, attaches the decoded user object to `req.user`.

### 3. **Authorization Middleware**
- **`requireAdmin`**: Allows access only if the authenticated user has an admin role.
  - Logs unauthorized access attempts.
  - Responds with `403 Forbidden` if not an admin.

### 4. **Security Headers**
- **`securityHeaders`**: Configures HTTP response headers with Helmet for increased security.
  - Sets strict Content Security Policy and other headers to prevent XSS, data leaks, and clickjacking.

### 5. **Logging Middleware**
- **`requestLogger`**: Logs every incoming request with method, URL, status, duration, IP, and user agent.
  - Severity depends on the status code (warn for errors, info for successes).

### 6. **Error Handling Middleware**
- **`errorHandler`**: Catches unhandled errors, logs details, and sends an appropriate JSON error response.
  - In production, hides error message and stack trace to avoid exposing internals.
  - In development, includes error details for easier debugging.

---

These middlewares are exported for use in the main Express application, enabling robust security, monitoring, and error handling.