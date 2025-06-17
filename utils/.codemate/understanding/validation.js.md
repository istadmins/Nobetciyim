# High-Level Documentation

## Overview
This module provides a comprehensive set of input validation and sanitization utilities for use in Express.js applications (Node.js). It leverages the `express-validator` package to define reusable validation rules for various types of input data and supplies middleware for request validation and data sanitization.

---

## Components

### 1. **Validation Rules Object (`validationRules`)**

A centralized collection of input validation rules covering the following:

- **User Data**
  - `username`: Checks for length, allowed characters, and trims whitespace.
  - `password`: Ensures minimum and maximum password length.
  - `email`: Optionally validates and normalizes an email address.

- **Nobetci Data**
  - `nobetciName`: Checks for valid name format and length.
  - `kredi`: Optionally validates an integer range.
  - `telegramId`: Optionally enforces maximum length.
  - `telefonNo`: Optionally checks for valid phone number pattern.

- **General**
  - `id`: Ensures route parameter is a positive integer.
  - `time`: Validates time fields (start and end) in `HH:MM` format.
  - `date`: Optionally validates ISO8601 date format.
  - `kuralAdi`: Ensures rule names are within a valid length.
  - `yil` and `hafta`: Validates both body and query parameters for correct year (2020-2050) and week (1-53) ranges.

**Purpose:**  
Allows easy import and reuse of validation logic across your API routes.

---

### 2. **Validation Middleware (`validate`)**

- Extracts and checks validation errors after applying validation rules in a route.
- On validation failure: Responds with HTTP 400 and an error structure listing the invalid fields, messages, and values.
- On success: Passes control to the next middleware.

**Purpose:**  
Uniformly enforce input validation and provide user-friendly error feedback.

---

### 3. **Input Sanitization Function (`sanitizeInput`)**

- Accepts any data type (string or nested objects).
- For strings: Trims whitespace and removes angle brackets (`<`, `>`) to help prevent basic script injection.
- For objects: Recursively sanitizes each property.
- Non-object, non-string types are returned unchanged.

**Purpose:**  
Defends against simple injection/XSS attacks and cleans user input.

---

## Usage

- Import the module in route/controller files.
- Apply relevant `validationRules` in Express route definitions.
- Use the `validate` middleware right after validation rules.
- Use `sanitizeInput` to cleanse incoming data as needed before processing/storing it.

---

## Exported API

- `validationRules`: The full set of rules for readily attaching to routes.
- `validate`: The validation checking middleware for Express.
- `sanitizeInput`: Utility for cleaning input data.

---

## Example Integration:

```js
const { validationRules, validate, sanitizeInput } = require('./validation');

router.post(
  '/users',
  [validationRules.username, validationRules.password, validationRules.email],
  validate,
  (req, res) => {
    const sanitizedData = sanitizeInput(req.body);
    // Proceed with sanitized, validated data...
  }
);
```

---

## Internationalization

- Error messages are provided in Turkish.

---

**Summary:**  
This code module provides modular, reusable, and extensible input validation and sanitization for typical REST API needs in an Express.js application.