FROM node:18-alpine3.18

WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    make \
    gcc \
    g++ \
    python3 \
    sqlite \
    dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install since we don't have package-lock.json yet)
RUN npm install --only=production && \
    npm cache clean --force

# Remove build dependencies to reduce image size
RUN apk del make gcc g++ python3

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data logs

# Set environment variables
ENV NODE_ENV=production
ENV TZ="Europe/Istanbul"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:80/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 80

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]