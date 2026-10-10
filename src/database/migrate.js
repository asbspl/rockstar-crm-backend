const fs = require("fs");
const path = require("path");
const { getDatabaseConfig } = require("../config/env");
const databasePool = require("../config/db");

const migrationPath = path.join(__dirname, "migrations", "001_create_clients.sql");
const locationMigrationPath = path.join(__dirname, "migrations", "002_client_location.sql");
const expectedColumns = {
  id: { type: "bigint", nullable: "NO", identity: "YES", identityGeneration: "BY DEFAULT" },
  client_name: { type: "text", nullable: "NO" },
  phone: { type: "text", nullable: "YES" },
  email: { type: "text", nullable: "YES" },
  address_line1: { type: "text", nullable: "YES" },
  address_line2: { type: "text", nullable: "YES" },
  country: { type: "text", nullable: "YES" },
  state: { type: "text", nullable: "YES" },
  city: { type: "text", nullable: "YES" },
  pin_code: { type: "text", nullable: "YES" },
  location: { type: "text", nullable: "YES" },
  addition_date: { type: "date", nullable: "NO", default: "current_date" },
  gstin: { type: "text", nullable: "YES" },
  contact_person: { type: "text", nullable: "YES" },
  status: { type: "text", nullable: "NO", default: "'active'::text" },
  credit_days: { type: "integer", nullable: "NO", default: "0" },
  assigned_employee: { type: "text", nullable: "YES" },
  delivery_challan_provided: { type: "boolean", nullable: "NO", default: "false" },
  gst_document_path: { type: "text", nullable: "YES" },
  created_at: { type: "timestamp with time zone", nullable: "NO", default: "CURRENT_TIMESTAMP" },
  updated_at: { type: "timestamp with time zone", nullable: "NO", default: "CURRENT_TIMESTAMP" },
};
const expectedChecks = {
  clients_client_name_nonempty: "btrim(client_name)<>''",
  clients_email_format: "emailisnulloremail~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'",
  clients_status_nonempty: "btrim(status)<>''",
  clients_credit_days_nonnegative: "credit_days>=0",
};
const expectedLocationColumns = {
  id: { type: "bigint", nullable: "NO", identity: "YES", identityGeneration: "BY DEFAULT" },
  location_name: { type: "text", nullable: "NO" },
  created_at: { type: "timestamp with time zone", nullable: "NO", default: "CURRENT_TIMESTAMP" },
  updated_at: { type: "timestamp with time zone", nullable: "NO", default: "CURRENT_TIMESTAMP" },
};

function normalizeExpression(expression) {
  return expression
    .toLowerCase()
    .replace(/::(?:text|character varying)/g, "")
    .replace(/[()\s]/g, "");
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function verifyLocationSchema(client) {
  const columnsResult = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default, is_identity, identity_generation FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    ["public", "locations"]
  );
  const actualColumns = Object.fromEntries(columnsResult.rows.map((column) => [column.column_name, column]));
  const actualNames = Object.keys(actualColumns).sort();
  const expectedNames = Object.keys(expectedLocationColumns).sort();

  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Existing public.locations table has missing or unexpected columns");
  }

  for (const [name, expected] of Object.entries(expectedLocationColumns)) {
    const actual = actualColumns[name];
    if (
      actual.data_type !== expected.type ||
      actual.is_nullable !== expected.nullable ||
      (expected.identity && actual.is_identity !== expected.identity) ||
      (expected.identityGeneration && actual.identity_generation !== expected.identityGeneration) ||
      (expected.default && normalizeExpression(actual.column_default || "") !== normalizeExpression(expected.default))
    ) {
      throw new Error(`Existing public.locations column ${name} is incompatible with the migration`);
    }
  }

  const result = await client.query(
    "SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.locations'::regclass AND contype <> 'n'"
  );
  const constraints = Object.fromEntries(result.rows.map((constraint) => [constraint.conname, constraint]));
  const expectedConstraints = ["locations_pkey", "locations_location_name_nonempty"].sort();
  if (JSON.stringify(Object.keys(constraints).sort()) !== JSON.stringify(expectedConstraints)) {
    throw new Error("Existing public.locations table has missing or unexpected constraints");
  }
  if (constraints.locations_pkey?.contype !== "p" || constraints.locations_pkey.definition !== "PRIMARY KEY (id)") {
    throw new Error("Existing public.locations table does not have the expected primary key");
  }
  if (
    constraints.locations_location_name_nonempty?.contype !== "c" ||
    normalizeExpression(constraints.locations_location_name_nonempty.definition.replace(/^CHECK\s*/i, "")) !==
      normalizeExpression("btrim(location_name) <> ''")
  ) {
    throw new Error("Existing public.locations table has an incompatible location name constraint");
  }
}

async function createDatabaseIfMissing(config) {
  const adminPool = databasePool.createPool("postgres");
  try {
    const exists = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [config.name]
    );
    if (exists.rowCount) return false;

    try {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(config.name)}`);
      console.log("Configured PostgreSQL database created.");
      return true;
    } catch (error) {
      if (error.code === "42P04") return false;
      throw error;
    }
  } finally {
    await adminPool.end();
  }
}

async function verifySchema(client) {
  const columnsResult = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default, is_identity, identity_generation FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    ["public", "clients"]
  );
  const actualColumns = Object.fromEntries(columnsResult.rows.map((column) => [column.column_name, column]));
  const actualNames = Object.keys(actualColumns).sort();
  const expectedNames = Object.keys(expectedColumns).sort();

  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Existing public.clients table has missing or unexpected columns");
  }

  for (const [name, expected] of Object.entries(expectedColumns)) {
    const actual = actualColumns[name];
    if (
      actual.data_type !== expected.type ||
      actual.is_nullable !== expected.nullable ||
      (expected.identity && actual.is_identity !== expected.identity) ||
      (expected.identityGeneration && actual.identity_generation !== expected.identityGeneration) ||
      (expected.default && normalizeExpression(actual.column_default || "") !== normalizeExpression(expected.default))
    ) {
      throw new Error(`Existing public.clients column ${name} is incompatible with the migration`);
    }
  }

  const constraintsResult = await client.query(
    "SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.clients'::regclass AND contype <> 'n'"
  );
  const constraints = Object.fromEntries(constraintsResult.rows.map((constraint) => [constraint.conname, constraint]));
  const expectedConstraintNames = ["clients_pkey", ...Object.keys(expectedChecks)].sort();
  if (JSON.stringify(Object.keys(constraints).sort()) !== JSON.stringify(expectedConstraintNames)) {
    throw new Error("Existing public.clients table has missing or unexpected constraints");
  }
  if (constraints.clients_pkey?.contype !== "p" || constraints.clients_pkey.definition !== "PRIMARY KEY (id)") {
    throw new Error("Existing public.clients table does not have the expected primary key");
  }

  for (const [name, expectedExpression] of Object.entries(expectedChecks)) {
    const constraint = constraints[name];
    if (
      constraint?.contype !== "c" ||
      normalizeExpression(constraint.definition.replace(/^CHECK\s*/i, "")) !== normalizeExpression(expectedExpression)
    ) {
      throw new Error(`Existing public.clients constraint ${name} is missing or incompatible`);
    }
  }
}

async function runMigration() {
  const config = getDatabaseConfig();
  let targetPool = databasePool.createPool(config.name);
  let createdDatabase = false;

  try {
    try {
      await targetPool.query("SELECT 1");
    } catch (error) {
      if (error.code !== "3D000") throw error;
      await targetPool.end();
      targetPool = null;
      createdDatabase = await createDatabaseIfMissing(config);
      targetPool = databasePool.createPool(config.name);
      await targetPool.query("SELECT 1");
    }

    const client = await targetPool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT to_regclass('public.clients') AS clients_table, to_regclass('public.locations') AS locations_table"
      );
      await client.query(fs.readFileSync(migrationPath, "utf8"));
      await verifySchema(client);
      await client.query(fs.readFileSync(locationMigrationPath, "utf8"));
      await verifyLocationSchema(client);
      await client.query("COMMIT");
      console.log(
        `Migrations verified: ${existing.rows[0].clients_table ? "clients existed" : "clients created"}; ${existing.rows[0].locations_table ? "locations existed" : "locations created"}.`
      );
      if (createdDatabase) console.log("The database was created from DB_NAME in .env.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    if (targetPool) await targetPool.end();
    await databasePool.end();
  }
}

runMigration().catch((error) => {
  console.error("Migration failed:", error.message, error.code ? `(PostgreSQL ${error.code})` : "");
  process.exitCode = 1;
});