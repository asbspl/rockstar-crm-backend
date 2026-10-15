const express = require("express");
const createAuthRoutes = require("./auth.routes");
const createDashboardRoutes = require("./dashboard.routes");
const createUserRoutes = require("./users.routes");
const createRolesRoutes = require("./roles.routes");
const createPermissionsRoutes = require("./permissions.routes");
const createAdminRegistrationRoutes = require(
  "./admin-registration.routes"
);


function createApiRoutes(config) {
  const router = express.Router();

  router.use("/auth", createAuthRoutes(config));
  router.use("/users", createUserRoutes(config));
  router.use("/roles", createRolesRoutes(config));
  router.use("/permissions", createPermissionsRoutes(config));
  router.use("/dashboard", createDashboardRoutes(config));

  // New registration review endpoints:
router.use(
  "/admin/registrations",
  createAdminRegistrationRoutes(config)
);

  return router;
}

module.exports = createApiRoutes;