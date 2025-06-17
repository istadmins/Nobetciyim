# High-Level Documentation

## Purpose
This documentation outlines the process for securely setting up environment variables as secrets on Fly.io before deploying an application. These secrets are essential for authentication, email functionality, security configurations, and optional features such as Telegram notifications and rate limiting.

## Overview

1. **Required Secrets**: Instructions for setting critical environment variables such as `JWT_SECRET`, `INTERNAL_API_TOKEN`, and email/SMTP details for operational security and password reset functionality.
2. **Optional Secrets**: Guidance on configuring features like rate limiting and debug logging.
3. **Verification**: Steps to confirm secrets are correctly set.
4. **Deployment**: Deployment instructions after secret configuration.
5. **Special Notes**: Emphasis on security practices and clarifications regarding optional features and secret generation.

## Key Features

- **JWT and Token Security**: Guidance on generating and setting a strong JWT secret and API token.
- **Email Integration**: Settings to enable password reset and email notifications via SMTP.
- **Optional Integrations and Limits**: Enables selective configuration of Telegram alerts, rate limits, and debug modes.
- **Best Practices**: Encourages the use of secure, random values for secrets, especially for authentication.

## Usage Flow

1. **Set Secrets**: Use `fly secrets set` in the CLI to configure secret values corresponding to your app's needs.
2. **Verify**: Use `fly secrets list` to confirm everything is set up correctly.
3. **Deploy**: Use `fly deploy` to launch/update the application.
4. **Security Guidance**: Instructions for securely generating key secrets (e.g., JWT_SECRET) are provided to maximize safety.

## Intended Audience

Developers or system administrators deploying an application on Fly.io who need to securely manage environment-specific credentials and configuration.

---

**Summary:**  
This documentation ensures that application configuration secrets are securely managed on Fly.io, covering core authentication, integrations, rate limiting, and deployment instructions, alongside best-practice security advice.