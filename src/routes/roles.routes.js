const express = require("express");
const createRolesController = require("../controllers/roles.controller");
const createUserService = require("../services/user.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const { authorizeAnyPermission, authorizePermission } = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { updateRolePermissionsSchema } = require("../validators/user.validator");

function createRolesRoutes(config) {
  const router = express.Router();
  const controller = createRolesController(createUserService(config));
  const authenticate = createAuthMiddleware(config);

  router.get("/", authenticate, authorizeAnyPermission(["users.read", "roles.read", "settings.read"]), controller.listRoles);
  router.get("/:id/permissions", authenticate, authorizeAnyPermission(["users.read", "roles.read", "settings.read", "users.assign_permission"]), controller.getRolePermissions);
  router.put("/:id/permissions", authenticate, authorizePermission("users.assign_permission"), validate(updateRolePermissionsSchema), controller.updateRolePermissions);

  return router;
}

module.exports = createRolesRoutes;
