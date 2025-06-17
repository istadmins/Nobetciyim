High-Level Documentation: Custom Winston Logger Configuration

Overview:
This module provides a pre-configured logger using the Winston logging library for a Node.js application. It standardizes how log messages are formatted, where they're stored, and how they're output depending on the environment (production or development).

Key Features:

1. Logs Directory Management:
- Ensures that a /logs directory exists at the project root for storing log files. Creates the directory if it does not already exist.

2. Log Formatting:
- All logs include timestamps (formatted as YYYY-MM-DD HH:mm:ss).
- Errors include stack traces.
- Log entries are output using JSON formatting for file transports.

3. Logging Levels and Metadata:
- In production, the logger only outputs logs at 'info' and 'error' levels.
- In development, it outputs more verbose 'debug' logs.
- Each log entry includes default metadata identifying the service as nobetciyim.

4. File Transports (Logs to Disk):
- error.log: Stores all logs at the 'error' level, with log file rotation (max 5 files, 5MB each).
- combined.log: Stores all logs at 'info' level and below, with similar rotation.
- Log files are stored in the /logs directory.

5. Console Transport (Dev Only):
- In non-production environments, logs are also output to the console, using colorized, simple formatting for easier readability during development/debugging.

Usage:
- The logger instance is exported and can be required and used in other parts of the application to log messages.
- The logger supports standard log levels like logger.error, logger.info, logger.debug, etc.

Customization:
- The log level can be adjusted via the NODE_ENV environment variable.
- Log file paths, sizes, and retention are easily configurable within the transport setup.

Intended Use:
- For robust, structured application logging with automatic file management and environment-aware outputs. Suitable for both development and production deployments.