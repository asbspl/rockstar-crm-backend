
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./config/db");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Rockstar CRM API is running",
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, current_user AS username"
    );

    res.json({
      status: "ok",
      database: result.rows[0].database,
      username: result.rows[0].username,
    });
  } catch (error) {
    console.error("PostgreSQL error code:", error.code);
    console.error("PostgreSQL error message:", error.message);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      code: error.code || "UNKNOWN",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Database configured: ${process.env.DB_NAME}`);
  console.log(`Database host: ${process.env.DB_HOST}`);
});
