# High-Level Documentation: Login Page Functionality

This code defines a user login web page with associated functionality. Below is a high-level summary of its features and structure.

---

## Features

### 1. **User Interface (UI)**
- **Form Elements:**  
  - Username input field  
  - Password input field  
  - Submit/login button  
- **Feedback Area:**  
  - An area to dynamically display success or error messages after actions.
- **Extra Links:**  
  - A "Şifre Sıfırla" (Reset Password) link, enabling users to initiate a password reset process.

### 2. **Styling**
- Uses Roboto font from Google Fonts.
- Additional CSS included via an external stylesheet (`login-style.css`).
- The visual structure includes centered containers and form boxes for a clean, accessible appearance.

### 3. **Login Functionality (with JavaScript)**
- **AJAX/Fetch API:**  
  - On form submission, sends a POST request to `/api/auth/login` with entered username and password as JSON.
- **Response Handling:**  
  - If login is successful (response contains a token):  
    - Stores the token in `localStorage`.  
    - Redirects the user to `index.html`.  
  - If unsuccessful:  
    - Displays an error message in the feedback area.
- **Error Handling:**  
  - Catches and displays network or unexpected errors.

### 4. **Password Reset Functionality**
- **Reset Trigger:**  
  - Clicking the "Şifre Sıfırla" link starts the process.
- **Confirmation Dialog:**  
  - Users are asked to confirm their intention before proceeding.
- **Reset Request:**  
  - Sends a POST request to `/api/auth/initiate-password-reset`, with a hardcoded username (`admin`).
- **Feedback:**  
  - Displays a success message if the server confirms email dispatch.
  - Displays an error message on failure or network error.
- **Note:**  
  - There's a TODO in the comments suggesting future improvement: Allowing users to enter their own username/email for password reset.

### 5. **Security & Usability**
- **Token Storage:**  
  - Uses `localStorage` for JWT token persistence after successful login.
- **Progressive Enhancement:**  
  - Page is functional even if JavaScript is disabled, but AJAX login and password reset will not work without JS.

### 6. **Localization**
- All static texts, placeholders, and messages are in Turkish—tailored for Turkish-speaking users.

---

## Summary Table

| Area                      | Purpose                                                   |
|---------------------------|-----------------------------------------------------------|
| Form                      | User input: username & password, login submission         |
| Message Area              | Display dynamic feedback messages                         |
| Login Script              | Handles login POST, token storage, redirects, errors      |
| Password Reset Script     | Initiates password reset, feedback to user, confirmation  |
| Styling                   | Clean modern UI with an external stylesheet and web fonts |
| Localization              | Turkish text and labels throughout the interface          |

---

## Intended Workflow

1. User visits the page, enters login credentials, and submits.
2. Credentials are sent via JavaScript to the backend for authentication.
3. Feedback (success/failure) is communicated directly in the page.
4. Password reset can be requested (currently for a fixed user) with user confirmation.
5. All interactions are seamless and performed without a page reload.

---