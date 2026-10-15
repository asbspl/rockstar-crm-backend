const express = require("express");
const createDashboardController = require("../controllers/dashboard.controller");
const createDashboardService = require("../services/dashboard.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const { authorizeAnyPermission } = require("../middlewares/auth.middleware");

function createDashboardRoutes(config) {
  const router = express.Router();
  const controller = createDashboardController(createDashboardService(config));

  router.get(
    "/summary",
    createAuthMiddleware(config),
    authorizeAnyPermission(["dashboard.read"]),
    controller.summary,
  );
  return router;
}

module.exports = createDashboardRoutes;