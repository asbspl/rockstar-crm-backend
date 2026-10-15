const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

const SUMMARY_METRICS = [
  { key: "companies", table: "companies" },
  { key: "employees", table: "employees" },
  { key: "drivers", table: "drivers" },
  { key: "contractors", table: "contractors" },
  { key: "clients", table: "clients" },
  { key: "customers", table: "customers" },
  { key: "sites", table: "sites" },
  { key: "quotations", table: "quotations" },
  { key: "orders", table: "orders" },
  { key: "visits", table: "visits" },
  { key: "queries", table: "queries" },
];

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function getSummary(config) {
  const metricNames = SUMMARY_METRICS.map((metric) => metric.table);
  const existingTablesResult = await pool.query(
    "SELECT lower(table_name) AS table_name FROM information_schema.tables WHERE table_schema = $1 AND lower(table_name) = ANY($2)",
    ["public", metricNames]
  );
  const existingTables = new Set(existingTablesResult.rows.map((row) => row.table_name));
  const missingTables = SUMMARY_METRICS.filter((metric) => !existingTables.has(metric.table.toLowerCase()))
    .map((metric) => `public.${metric.table}`);

  if (missingTables.length) {
    throw new ApiError(
      503,
      `Dashboard data is unavailable because the required table(s) are missing: ${missingTables.join(", ")}`
    );
  }

  try {
    const aggregateSql = SUMMARY_METRICS.map(
      ({ key, table }) => `SELECT '${key}' AS metric, COUNT(*)::int AS total FROM ${quoteIdentifier("public")}.${quoteIdentifier(table)}`
    ).join(" UNION ALL ");
    const result = await pool.query(aggregateSql);
    return Object.fromEntries(result.rows.map((row) => [row.metric, Number(row.total || 0)]));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, `Dashboard summary could not be generated: ${error.message}`);
  }
}

module.exports = { getSummary };