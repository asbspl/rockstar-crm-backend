const express = require("express");
const createRolesController = require("../controllers/roles.controller");
const createUserService = require("../services/user.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const { authorizeAnyPermission } = require("../middlewares/auth.middleware");

function createPermissionsRoutes(config) {
  const router = express.Router();
  const controller = createRolesController(createUserService(config));
  const authenticate = createAuthMiddleware(config);

  router.get("/", authenticate, authorizeAnyPermission(["users.read", "permissions.read", "settings.read"]), controller.listPermissions);
  return router;
}

module.exports = createPermissionsRoutes;
