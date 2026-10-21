const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const { getConfig } = require("./config/env");
const config = getConfig();
const pool = require("./config/db");
const createApiRoutes = require("./routes");
const ApiResponse = require("./utils/ApiResponse");
const notFoundMiddleware = require("./middlewares/not-found.middleware");
const errorMiddleware = require("./middlewares/error.middleware");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        config.frontendUrl,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]
        .filter(Boolean)
        .map((value) => value.replace(/\/+$/, ""));
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS policy"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);


app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"))
);

app.get("/", (req, res) => {
  res.json(new ApiResponse("Rockstar CRM API is running", {}));
});

app.get("/api/health/db", async (req, res) => {
  await pool.query("SELECT 1");
  res.json(new ApiResponse("Database connection is healthy", { status: "ok" }));
});

const employeesRoutes = require("./routes/employees.routes");

// After app is created:
app.use("/uploads", express.static("uploads"));
app.use("/api/employees", employeesRoutes);

app.use("/api", createApiRoutes(config));
app.use(notFoundMiddleware);
app.use(errorMiddleware);

async function start() {
  await pool.query("SELECT 1");
  const server = app.listen(config.port, () => {
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  start().catch(async (error) => {
    console.error("Application startup failed: PostgreSQL connectivity check did not pass", {
      code: error.code || "unknown",
    });
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = app;