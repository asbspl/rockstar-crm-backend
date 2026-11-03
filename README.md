# Rockstar CRM Backend

Express API using PostgreSQL, JWT authentication, and a Route → Controller → Service → Model request flow.

## Configuration

The application loads the root `.env` file. Preserve the existing `DB_*` settings and add a `JWT_SECRET` containing at least 32 random characters. `.env.example` lists the supported variables; copy only the relevant placeholder keys into the local file without replacing existing database settings. `.env` is excluded from Git.

The API expects existing user credentials to be stored as bcrypt hashes. Set `AUTH_USER_TABLE`, `AUTH_USER_ID_COLUMN`, `AUTH_USER_EMAIL_COLUMN`, and `AUTH_USER_PASSWORD_COLUMN` to match the existing public-schema user table. No user, lead, or other tables are created by this application.

Run `npm run build` to syntax-check the API and migration entry points. Start production mode with `npm start` or development mode with `npm run start:dev` (`npm run dev` remains available as an alias). Startup verifies PostgreSQL connectivity before opening the HTTP port. The database must already exist and be reachable using the configured `DB_*` values.

## Client Table Migration

Run `npm run migration` to create the database named by `DB_NAME` if it does not exist, apply the core schema and RBAC migrations, and ensure the `audit_logs` table and indexes exist. The audit migration is safe to rerun and preserves existing activity records. Database creation requires the configured PostgreSQL role to have `CREATEDB` permission.

If a legacy core-table schema check blocks the full migration, apply only the independent audit schema with `npm run migration:audit`. This command runs the audit DDL in its own transaction and does not skip or weaken the core schema checks.

In PowerShell, load the existing `.env` values and run the migration and schema verification with:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] } }
npm.cmd run migration
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c '\d+ public.clients'
```

The migration command creates the configured database automatically if needed. If the PostgreSQL role cannot create databases, create it manually only when absent with `createdb -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER $env:DB_NAME`, then rerun `npm.cmd run migration`.

## Centralized User Activity History

The authenticated `/api/activity` endpoints use the existing `audit_logs.read` permission. Audit capture is installed on the shared PostgreSQL pool and observes successful `INSERT`, `UPDATE`, and `DELETE` statements after execution. Creates store their resulting values, updates store before-and-after snapshots, and deletes store the removed values as the previous state with no new state. Statements in an explicit transaction are recorded only after commit; rolled-back or failed writes are recorded as failed. Use the configured `src/config/db.js` pool for application database access so new modules receive the same automatic tracking.

For a future module, register its API under `/api/<module>` and use the shared database pool for writes. Mutation SQL should target one table directly (`INSERT INTO`, `UPDATE`, or `DELETE FROM`); use `RETURNING` when the operation can return an entity ID and updated row. Existing row reads in the same request are used as the prior-value snapshot. Keep secrets out of request bodies and mutation results; the audit sanitizer also redacts common credential, bank, identity, and document fields. Do not write to or expose mutation endpoints for `audit_logs`; the history is read-only to application users.

Activity API responses also include `resolved_old_values` and `resolved_new_values`, where recognizable foreign keys are replaced with related names. Missing related names are presented as unavailable rather than exposing database IDs. The frontend formats field labels and values centrally, compares snapshots to show only actual changes, structures nested records, and supports module-specific label, date, currency, and lookup overrides. The stored audit schema and original `old_values`/`new_values` fields remain unchanged.

History endpoints are:

- `GET /api/activity?page=1&limit=25&search=&module=&action=&status=&user_id=&start_date=&end_date=&entity_id=`
- `GET /api/activity/summary`
- `GET /api/activity/filters`
- `GET /api/activity/:id`
- `POST /api/activity/export` records a CSV export event (requires `audit_logs.read`).

All require a valid session and `audit_logs.read`.

For non-CRUD operations that do not execute an application-table mutation (for example, generating an export), call the shared `logActivity` service after the operation succeeds. Do not accept the audit actor ID from a client.

## API

- `POST /api/auth/login` accepts `{ "email": "...", "password": "..." }` and returns a JWT plus the user ID and email.
- `GET /api/auth/me` returns the authenticated user's ID and email.
- `GET /api/dashboard/summary` requires `Authorization: Bearer <token>` and returns the lead count and, when the configured status column exists, counts grouped by the actual stored status values.
- `GET /api/health/db` checks database connectivity without returning database identifiers.

Dashboard metrics are limited to the existing `leads` table. If that table is missing, the endpoint returns `503`; if its configured status column is missing, only the total lead count is returned. Contact, deal, revenue, and conversion metrics are not reported because this project has not established corresponding schemas.
