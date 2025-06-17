# High-Level Documentation: GitHub Actions Workflow - Fly Deploy

## Overview

This GitHub Actions workflow automates the deployment of an application to the Fly.io platform whenever code is pushed to the main branch of your repository.

## Trigger

- **Event:** `push`
- **Branch:** Only runs when a commit is pushed to the `main` branch.

## Jobs

### deploy

- **Name:** Deploy app
- **Runs on:** Latest Ubuntu runner (`ubuntu-latest`)
- **Concurrency:** Uses `deploy-group` for job concurrency, ensuring only one deployment runs at a time (avoids overlapping deployments).

#### Steps:

1. **Checkout Repository**
   - Uses the `actions/checkout@v4` action.
   - Downloads the latest code from the repository to the runner.

2. **Setup Flyctl**
   - Uses the `superfly/flyctl-actions/setup-flyctl@master` action.
   - Installs the Fly.io command-line tool (`flyctl`) needed for deployment.

3. **Deploy to Fly.io**
   - Runs the `flyctl deploy --remote-only` command.
   - Uses the `FLY_API_TOKEN` from the repository secrets for authentication.
   - Deploys the latest changes to the Fly.io platform.

## Secrets Required

- **FLY_API_TOKEN**
  - Must be added under repository secrets for authentication with Fly.io.

## Usage

- Add this workflow to the `.github/workflows/` directory in your repository.
- Ensure the `FLY_API_TOKEN` secret is configured in the GitHub repository settings.
- On every push to `main`, GitHub Actions will build and deploy your app via Fly.io.