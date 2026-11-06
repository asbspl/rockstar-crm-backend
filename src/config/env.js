const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function getDatabaseConfig() {
  const database = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
  const missing = Object.entries(database)
    .filter(([key, value]) => key !== "port" && !value)
    .map(([key]) => `DB_${key.toUpperCase()}`);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if (!Number.isInteger(database.port) || database.port < 1 || database.port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port");
  }
  if (Buffer.byteLength(database.name, "utf8") > 63 || database.name.includes("\0")) {
    throw new Error("DB_NAME must be a valid PostgreSQL database name of at most 63 bytes");
  }
  return database;
}

function getConfig() {
  const config = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3000),

frontendUrl:
  process.env.FRONTEND_URL || "http://localhost:5173",

    corsOrigins: (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean),

    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtIssuer: process.env.JWT_ISSUER || "rockstar-crm",
    jwtAudience: process.env.JWT_AUDIENCE || "rockstar-crm-users",
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",

    refreshCookieName:
      process.env.REFRESH_COOKIE_NAME || "rockstar_refresh_token",

    refreshCookieSecure: process.env.NODE_ENV === "production",
    refreshCookieSameSite: "lax",

    passwordResetExpiresIn:
      process.env.PASSWORD_RESET_EXPIRES_IN || "1h",

    passwordResetExpiryMinutes: Number(
      process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15
    ),

    database: getDatabaseConfig(),

    authUser: {
      table: process.env.AUTH_USER_TABLE || "users",
      idColumn: process.env.AUTH_USER_ID_COLUMN || "id",
      emailColumn: process.env.AUTH_USER_EMAIL_COLUMN || "email",
      passwordColumn:
        process.env.AUTH_USER_PASSWORD_COLUMN || "password_hash",
    },

    leads: {
      table: process.env.LEADS_TABLE || "leads",
      statusColumn: process.env.LEADS_STATUS_COLUMN || "status",
    },
  };

  const missing = [];

  if (!config.jwtSecret) missing.push("JWT_SECRET");
  if (!config.jwtRefreshSecret) missing.push("JWT_REFRESH_SECRET");

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  if (config.jwtRefreshSecret.length < 32) {
    throw new Error("JWT_REFRESH_SECRET must contain at least 32 characters");
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  if (
    !Number.isInteger(config.passwordResetExpiryMinutes) ||
    config.passwordResetExpiryMinutes < 1
  ) {
    throw new Error("PASSWORD_RESET_EXPIRY_MINUTES must be positive");
  }

  const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  for (const identifier of [
    config.authUser.table,
    config.authUser.idColumn,
    config.authUser.emailColumn,
    config.authUser.passwordColumn,
    config.leads.table,
    config.leads.statusColumn,
  ]) {
    if (!identifierPattern.test(identifier)) {
      throw new Error(
        "Database table and column names must be valid SQL identifiers"
      );
    }
  }

  return config;
}

module.exports = { getConfig, getDatabaseConfig };