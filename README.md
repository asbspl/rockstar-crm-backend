# Rockstar CRM Backend

Express API using PostgreSQL, JWT authentication, and a Route → Controller → Service → Model request flow.

## Configuration

The application loads the root `.env` file. Preserve the existing `DB_*` settings and add a `JWT_SECRET` containing at least 32 random characters. `.env.example` lists the supported variables; copy only the relevant placeholder keys into the local file without replacing existing database settings. `.env` is excluded from Git.

The API expects existing user credentials to be stored as bcrypt hashes. Set `AUTH_USER_TABLE`, `AUTH_USER_ID_COLUMN`, `AUTH_USER_EMAIL_COLUMN`, and `AUTH_USER_PASSWORD_COLUMN` to match the existing public-schema user table. No user, lead, or other tables are created by this application.

Run `npm run build` to syntax-check the API and migration entry points. Start production mode with `npm start` or development mode with `npm run start:dev` (`npm run dev` remains available as an alias). Startup verifies PostgreSQL connectivity before opening the HTTP port. The database must already exist and be reachable using the configured `DB_*` values.

## Client Table Migration

Run `npm run migration` to create the database named by `DB_NAME` if it does not exist, then apply and verify `src/database/migrations/001_create_clients.sql` and `src/database/migrations/002_client_location.sql`. Database creation requires the configured PostgreSQL role to have `CREATEDB` permission. The migrations are safe to rerun and fail if an existing `public.clients` or `public.locations` table does not exactly match its expected columns, types, defaults, identity primary key, and validation constraints. The location screen's visible name field is stored in `public.locations.location_name`; no other tables are created.

In PowerShell, load the existing `.env` values and run the migration and schema verification with:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] } }
npm.cmd run migration
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c '\d+ public.clients'
```

The migration command creates the configured database automatically if needed. If the PostgreSQL role cannot create databases, create it manually only when absent with `createdb -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER $env:DB_NAME`, then rerun `npm.cmd run migration`.

## API

- `POST /api/auth/login` accepts `{ "email": "...", "password": "..." }` and returns a JWT plus the user ID and email.
- `GET /api/auth/me` returns the authenticated user's ID and email.
- `GET /api/dashboard/summary` requires `Authorization: Bearer <token>` and returns the lead count and, when the configured status column exists, counts grouped by the actual stored status values.
- `GET /api/health/db` checks database connectivity without returning database identifiers.

Dashboard metrics are limited to the existing `leads` table. If that table is missing, the endpoint returns `503`; if its configured status column is missing, only the total lead count is returned. Contact, deal, revenue, and conversion metrics are not reported because this project has not established corresponding schemas.
