# High-Level Documentation: Fly.io Configuration for "nobetciyim" Node.js Application

This configuration file (`fly.toml`) defines the deployment settings for the Node.js application called **"nobetciyim"** on the Fly.io platform.

## Key Components

### 1. Application Settings
- **app**: The name of the application (`nobetciyim`).
- **primary_region**: Primary deployment region is set to Frankfurt (`fra`).

### 2. Build Section
- **[build]**: Reserved for build-related configurations (empty in this file).

### 3. Environment Variables
- **PORT**: The application will listen on port 80.
- **NODE_ENV**: Set to `'development'` for the node environment mode.

### 4. HTTP Service Configuration
- **internal_port**: The app serves HTTP traffic on port 80.
- **force_https**: Automatically redirects HTTP to HTTPS (`true`).
- **auto_stop_machines**: Automatic stopping of machines is turned off.
- **auto_start_machines**: Machines auto-start when necessary.
- **min_machines_running**: At least 1 machine will always be running.
- **processes**: Application process named `'app'`.

#### 4.1 Health Check
- Monitors `/health` endpoint every 30 seconds with a 10-second grace period and 5-second timeout, using the GET method.

### 5. Virtual Machine (VM) Settings
- **size**: Uses a shared CPU (1x).
- **memory**: Allocates 512MB RAM to the VM.

### 6. Storage Mounts
- **source**: Persistent volume named `"vnobetci"` is attached.
- **destination**: The volume is mounted inside the app at `/app/data`.

---

**Summary:**  
This configuration ensures that the "nobetciyim" Node.js app runs in a specific Fly.io region, listens on port 80 in development mode, enforces HTTPS, maintains at least one running instance, routinely checks health via `/health`, and uses persistent storage for application data.