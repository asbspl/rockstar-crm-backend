const express = require("express");
const createAuthRoutes = require("./auth.routes");
const createDashboardRoutes = require("./dashboard.routes");

function createApiRoutes(config) {
  const router = express.Router();
  router.use("/auth", createAuthRoutes(config));
  router.use("/dashboard", createDashboardRoutes(config));
  return router;
}

module.exports = createApiRoutes;