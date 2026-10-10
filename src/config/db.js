
const { Pool } = require("pg");
const { getDatabaseConfig } = require("./env");

const databaseConfig = getDatabaseConfig();

function createPool(database = databaseConfig.name) {
  const pool = new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database,
    user: databaseConfig.user,
    password: databaseConfig.password,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.code || "unknown error");
  });
  return pool;
}

const pool = createPool();
pool.createPool = createPool;
module.exports = pool;
