const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

async function getSummary(config) {
  const { table, statusColumn } = config.leads;
  const metadata = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
    ["public", table]
  );
  const columns = new Set(metadata.rows.map((row) => row.column_name));

  if (!columns.size) {
    throw new ApiError(503, "Lead dashboard data is unavailable because the leads table was not found");
  }

  if (!columns.has(statusColumn)) {
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM "public"."${table}"`);
    return { leads: { total: result.rows[0].total, statuses: [] } };
  }

  const result = await pool.query(
    `WITH status_counts AS (SELECT "${statusColumn}"::text AS status, COUNT(*)::int AS total FROM "public"."${table}" GROUP BY "${statusColumn}") SELECT (SELECT COUNT(*)::int FROM "public"."${table}") AS total, COALESCE((SELECT json_agg(json_build_object('status', status, 'total', total) ORDER BY status) FROM status_counts), '[]'::json) AS statuses`
  );
  return { leads: result.rows[0] };
}

module.exports = { getSummary };