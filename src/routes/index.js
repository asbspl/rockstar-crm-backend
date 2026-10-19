
const express = require("express");

const createAuthRoutes = require("./auth.routes");
const createDashboardRoutes = require("./dashboard.routes");
const createUserRoutes = require("./users.routes");
const createRolesRoutes = require("./roles.routes");
const createPermissionsRoutes = require("./permissions.routes");
const createAdminRegistrationRoutes = require("./admin-registration.routes");
const companiesRoutes = require("./companies.routes");

function createApiRoutes(config) {
  const router = express.Router();

  // Authentication and password reset
  router.use("/auth", createAuthRoutes(config));

  // User management
  router.use("/users", createUserRoutes(config));

  // Role management
  router.use("/roles", createRolesRoutes(config));

  // Permission management
  router.use("/permissions", createPermissionsRoutes(config));

  // Dashboard
  router.use("/dashboard", createDashboardRoutes(config));

  // Admin registration review
  router.use("/admin/registrations", createAdminRegistrationRoutes(config));

  router.use("/companies", companiesRoutes);

  return router;
}

module.exports = createApiRoutes;
