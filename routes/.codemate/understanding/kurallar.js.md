# High-Level Documentation: Kredi Kuralları API Router

## Overview

This code defines an Express.js router for managing "kredi kuralları" (credit rules) using a SQLite database. It provides RESTful endpoints to list, add, update, and delete rules, with specific business logic (e.g., preventing deletion of fixed rules).

---

## Endpoints Summary

### 1. List All Rules

- **Route:** `GET /`
- **Description:** Retrieves and returns all credit rules from the database.
- **Response:** Array of rule objects.

---

### 2. Add a New Rule

- **Route:** `POST /`
- **Description:** Inserts a new credit rule into the database with given name, credit value, and date.
- **Request Body:** `{ kredi, kural_adi, tarih }`
- **Response:** The created rule (including assigned ID).
- **Error Handling:** Returns an error if the rule already exists.

---

### 3. Delete a Rule

- **Route:** `DELETE /:id`
- **Description:** Deletes the rule with the given ID **unless** it is marked as a fixed rule (`sabit_kural`).
- **Logic:** 
  - First checks if the rule is fixed.
  - If so, denies deletion.
  - Otherwise, deletes the rule.
- **Response:** Success message on deletion; error if trying to delete a fixed rule.

---

### 4. Update a Rule

- **Route:** `PUT /`
- **Description:** Updates the credit value (`kredi`) of a rule identified by its name (`kural_adi`).
- **Request Body:** `{ kural_adi, kredi }`
- **Response:** Success message after update.

---

## Key Points

- Uses SQLite as the data storage via the `db` module.
- Prevents deletion of rules marked as "fixed" (`sabit_kural`).
- Returns errors for duplicate creation, deletion of fixed rules, and database issues.
- Implements basic CRUD (Create, Read, Update, Delete), except update is by rule name, and deletion by ID.

---

## Usage Context

This router can be mounted under a path like `/api/kurallar` in a larger Express app, providing backend support for managing credit rule entities.