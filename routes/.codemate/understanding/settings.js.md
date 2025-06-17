# High-Level Documentation: settings.js (routes/settings.js)

## Overview

This code defines an Express router responsible for handling API endpoints related to application settings, specifically a group of configurations referred to as "resort_config". It interacts with a SQLite-based database to get, save, update, or reset configuration values.

## Main Features

- **File Purpose:**  
  Manages API endpoints for getting, updating, and resetting a specific set of application settings stored in a database table called `uygulama_ayarlari`.

- **API Endpoints Provided:**
  1. **GET `/resort-config`**  
     Retrieves the "resort_config" setting from the database, parses it as JSON, and returns it to the client. If not found, returns a default configuration.
  
  2. **POST `/resort-config`**  
     Updates or creates the "resort_config" setting with data sent in the request body, after validating required fields.
  
  3. **DELETE `/resort-config`**  
     Resets the "resort_config" setting in the database to its default values.

## Key Implementation Details

- **Configuration Key:**  
  All operations work with a single setting identified by the key `'resort_config'` in the database.

- **Data Validation:**  
  On POST, checks for the presence of required fields before saving the new settings.

- **Error Handling:**  
  Returns HTTP 500 and error messages in case of database or data parsing errors.

- **Default Behavior:**  
  If the resort_config setting is not present, or is deleted, a default object (`{ aktif: false, baslangicYili: 0, baslangicHaftasi: 0, baslangicNobetciIndex: 0 }`) is used.

- **Database Interaction:**  
  Uses parameterized SQL queries with `db.get()` and `db.run()` to prevent SQL injection.

## Intended Use

- The endpoints are designed for an internal settings/configuration system, likely for a scheduling or calendar feature where "resort_config" holds some parameters used for reordering or scheduling logic.
- The DELETE endpoint is noted as currently unused but kept for possible future needs.

## Export

- The module exports the configured router for inclusion in the main Express application.

---

**In summary:**  
This module is a backend REST API for managing a JSON-encoded configuration value stored in a database, providing endpoints to get, set, and reset it, with robust handling for missing data and errors.