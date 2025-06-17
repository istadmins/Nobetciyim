High-Level Documentation: Shift Credits API Router

Overview:
This Express.js router manages CRUD operations related to "shift credits" (nöbet kredileri) in a SQLite database. It exposes two main endpoints for listing and saving shift credits.

Endpoints:

1. GET "/"
   - Description: Retrieves all shift credit records from the database.
   - Response: Returns a JSON array containing all records from the nobet_kredileri table.

2. POST "/"
   - Description: Saves (replaces) all shift credit records.
   - Process:
     - Deletes all existing records in the nobet_kredileri table.
     - Inserts new records received in the request body (array of credit entries).
   - Request Body: Array of objects, each containing kredi_dakika, baslangic_saat, and bitis_saat fields.
   - Response: Confirmation message in JSON upon success.

Database Interaction:
- Reads and writes are performed on the nobet_kredileri table.
- Database connection is provided via an imported db module.

Error Handling:
- Returns HTTP 500 with a JSON error message on database errors.

Export:
- The configured router is exported for use in the main application.