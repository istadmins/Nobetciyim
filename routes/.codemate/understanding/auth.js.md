# High-Level Documentation: `routes/auth.js`

## Overview

This Express router file implements user authentication logic for a Node.js application, including:

- Secure user login with username/password and JWT generation
- Password reset initiation with secure password generation
- Input sanitization and logging for monitoring and debugging

It relies on a SQLite database (using `db`), cryptographic hashing with `bcryptjs`, token generation with `jsonwebtoken`, and some simple logging utilities.

---

## Core Endpoints

### 1. POST `/login`

**Purpose:**  
Authenticates users using their username and password.

**Workflow:**
- Sanitizes and validates input (username and password must be present)
- Looks up the user record in the database using a case-insensitive search
- Compares the provided password (hashed) against the stored hash
- Logs all login attempts (both failed and successful)
- Updates the last login timestamp on success
- Issues a JWT containing user id, username, and role, with a configurable expiration time

**Responses:**
- `200 OK` with JWT and user info on success
- `400 Bad Request` if input is missing
- `401 Unauthorized` if credentials are invalid
- `500 Internal Server Error` on unexpected failures

---

### 2. POST `/initiate-password-reset`

**Purpose:**  
Resets a user’s password to a new, random value (for development: returns it directly; in production, would send by email).

**Workflow:**
- Sanitizes and validates the username input
- Verifies that the user exists and has an email address on record
- Generates a secure, random 12-character password
- Hashes the new password using bcrypt
- Updates the user's password in the database
- Logs password reset attempts
- Returns the new password in the JSON response (for development/testing)

**Responses:**
- `200 OK` with a message and the new password on success
- `400 Bad Request` or `404 Not Found` if input is missing, user doesn't exist, or user is missing an email
- `500 Internal Server Error` on unexpected failures

---

## Utilities

- **Input Sanitization:**  
  Removes leading/trailing whitespace from string inputs to guard against trivial mistakes and injection risks.

- **Logging:**  
  Logs info, warnings, and errors to the console for monitoring authentication actions and tracing security-relevant events.

- **Password Handling:**  
  Uses `bcrypt` for secure password hashing and comparison to protect stored credentials.

- **JWT:**  
  Issues JWTs signed using a secret from the environment, optionally configuring session timeout.

---

## Security & Best Practice Remarks

- Credentials are never logged or output directly
- Passwords are stored and compared securely
- Error messages avoid leaking sensitive information
- Password reset, in a real system, would email the new password; currently, it is returned in the API response for demonstration or internal use

---

## Configuration

- Database access via `db`
- JWT config via `process.env.JWT_SECRET` and `SESSION_TIMEOUT`
- Password hashing cost via `process.env.BCRYPT_ROUNDS` (default: 12)

---

## Exports

Exports the router for use in the main app.

---

**In summary:**  
This file implements essential authentication and password reset features, focusing on secure credential handling, appropriate error feedback, and logging for traceability.