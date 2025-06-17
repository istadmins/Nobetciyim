# High-Level Documentation for Dockerfile

## Overview
This Dockerfile defines the steps to build a production-ready Docker image for a Node.js application. It is optimized for lightweight, secure, and reliable deployment, using Alpine Linux as a base and including best practices for Node.js in containers.

---

## Major Steps

1. **Base Image**
   - Uses `node:18-alpine3.18` for a minimal, efficient environment.

2. **Set Working Directory**
   - The working directory inside the container is `/app`.

3. **Install System Dependencies**
   - Installs essential build tools (make, gcc, g++, python3) and system libraries (`sqlite`, `dumb-init`) needed for compiling and running native Node.js modules.

4. **Dependency Management**
   - Copies only package manifests (`package.json`, optionally `package-lock.json`) and runs `npm install` in production mode to keep the image small.
   - Cleans the npm cache.
   - Removes build tools after dependencies are installed to reduce image size.

5. **Copy Application Code**
   - Copies the rest of the application source code into the image.

6. **Create Application Directories**
   - Ensures that `data` and `logs` directories exist for proper file storage and logging.

7. **Environment Configuration**
   - Sets `NODE_ENV` to production for optimizations.
   - Sets the timezone (`Europe/Istanbul`).

8. **Health Check**
   - Adds a health check that polls the `/health` endpoint of the application on port 80 to ensure the service is responsive.

9. **Expose Port**
   - Exposes port `80` for external access.

10. **Signal Handling and Application Start**
    - Uses `dumb-init` as PID 1 to handle Unix signals properly (preventing zombie processes).
    - Default entrypoint and command run the application using `node app.js`.

---

## Intended Usage
This image is tailored for deployment of Node.js applications in production environments (e.g., cloud services, Docker Swarm, Kubernetes) with reliability, resource efficiency, and observability in mind.