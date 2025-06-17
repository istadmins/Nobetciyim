# High-Level Documentation: User Management API Router

This code defines an Express router for user management, primarily intended for administrative operations. The main functionalities include listing all users, adding a new user, and deleting an existing user. The operations interact with a SQL-based database and require appropriate authorization. Below is an outline of the major routes and their purposes:

---

## 1. List All Users

- **Route:** GET `/users`
- **Access Control:** Only accessible by admin users (uses `authorizeAdmin` middleware).
- **Function:** Retrieves all users' IDs and usernames from the database.
- **Response:** Returns an array of user objects or an error message.

---

## 2. Create New User

- **Route:** POST `/users`
- **Access Control:** Only accessible by admin users (uses `authorizeRole('admin')` middleware).
- **Functionality:**
  - Accepts username, password, and (optionally) role in the request body.
  - Hashes the password using bcrypt before storing.
  - Inserts the new user into the database.
- **Response:** On success, returns the newly created user's ID; on error (e.g., duplicate username), returns an error message.

---

## 3. Delete Existing User

- **Route:** DELETE `/users/:id`
- **Access Control:** Only accessible by admin users (uses `authorizeRole('admin')` middleware).
- **Functionality:**
  - Deletes the user by ID from the database.
  - Checks if a user was actually deleted (i.e., exists).
- **Response:** Returns a message indicating the number of deleted users, or an error if the user was not found.

---

## 4. Middleware

- **`authorizeRole('admin')` and `authorizeAdmin`:**
  - Ensure that only authorized admin users can perform these operations.

---

## 5. Summary

This router provides a basic interface for admin-level user management in an application, including viewing all users, creating new users, and deleting existing users, all with secure password handling and access control. 

**All routes require admin authorization and respond with appropriate status codes and error messages.**