const express = require("express");
const createRbacController = require("../controllers/rbac.controller");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const {
  authorizeAnyPermission,
  authorizePermission,
} = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
} = require("../validators/user.validator");

function createRolesRoutes(config) {
  const router = express.Router();
  const controller = createRbacController();
  const authenticate = createAuthMiddleware(config);

  router.get(
    "/",
    authenticate,
    authorizeAnyPermission(["users.read", "roles.read", "settings.read"]),
    controller.listRoles,
  );
  router.post(
    "/",
    authenticate,
    authorizePermission("roles.create"),
    validate(createRoleSchema),
    controller.createRole,
  );
  router.get(
    "/:id/permissions",
    authenticate,
    authorizeAnyPermission(["users.read", "roles.read", "settings.read", "users.assign_permission"]),
    controller.getRolePermissions,
  );
  router.put(
    "/:id/permissions",
    authenticate,
    authorizeAnyPermission(["permissions.assign", "users.assign_permission"]),
    validate(updateRolePermissionsSchema),
    controller.updateRolePermissions,
  );
  router.put(
    "/:id",
    authenticate,
    authorizePermission("roles.update"),
    validate(updateRoleSchema),
    controller.updateRole,
  );
  router.delete(
    "/:id",
    authenticate,
    authorizePermission("roles.delete"),
    controller.deleteRole,
  );

  return router;
}

module.exports = createRolesRoutes;
