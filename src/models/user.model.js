const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

async function getColumns(config) {
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
    ["public", config.authUser.table]
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  const required = [config.authUser.idColumn, config.authUser.emailColumn, config.authUser.passwordColumn];

  if (required.some((column) => !columns.has(column))) {
    throw new ApiError(503, "Authentication is not configured for the existing user schema");
  }
}

async function findByEmail(email, config) {
  await getColumns(config);
  const { table, idColumn, emailColumn, passwordColumn } = config.authUser;
  const result = await pool.query(
    `SELECT "${idColumn}" AS id, "${emailColumn}" AS email, "${passwordColumn}" AS password_hash FROM "public"."${table}" WHERE LOWER("${emailColumn}"::text) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id, config) {
  await getColumns(config);
  const { table, idColumn, emailColumn } = config.authUser;
  const result = await pool.query(
    `SELECT "${idColumn}" AS id, "${emailColumn}" AS email FROM "public"."${table}" WHERE "${idColumn}"::text = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { findByEmail, findById };