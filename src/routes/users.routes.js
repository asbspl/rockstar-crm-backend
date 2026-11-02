const express = require("express");
const createUsersController = require("../controllers/users.controller");
const createRbacController = require("../controllers/rbac.controller");
const createUserService = require("../services/user.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const {
  authorizePermission,
  authorizeAnyPermission,
  authorizeAllPermissions,
} = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  requestCorrectionsSchema,
  assignUserRolesSchema,
  updateRolePermissionsSchema,
  updateUserAccessSchema,
  updateUserPermissionOverridesSchema,
} = require("../validators/user.validator");

function createUserRoutes(config) {
  const router = express.Router();
  const controller = createUsersController(createUserService(config));
  const rbacController = createRbacController();
  const authenticate = createAuthMiddleware(config);

  router.get("/", authenticate, authorizePermission("users.read"), controller.listUsers);
  router.post("/", authenticate, authorizePermission("users.create"), validate(createUserSchema), controller.createUser);
  router.get("/applications", authenticate, authorizeAnyPermission(["users.read", "users.approve", "kyc.read"]), controller.listApplications);
  router.get("/applications/:id", authenticate, authorizeAnyPermission(["users.read", "users.approve", "kyc.read"]), controller.getApplication);
  router.post("/applications/:id/approve", authenticate, authorizePermission("users.approve"), validate(approveApplicationSchema), controller.approveApplication);
  router.post("/applications/:id/reject", authenticate, authorizePermission("users.reject"), validate(rejectApplicationSchema), controller.rejectApplication);
  router.post("/applications/:id/request-corrections", authenticate, authorizeAnyPermission(["users.approve", "users.reject"]), validate(requestCorrectionsSchema), controller.requestCorrections);
  router.get("/:id/roles", authenticate, authorizeAnyPermission(["users.read", "users.assign_role"]), controller.getUserRoles);
  router.put("/:id/roles", authenticate, authorizePermission("users.assign_role"), validate(assignUserRolesSchema), controller.assignUserRoles);
  router.get(
    "/:id/access",
    authenticate,
    authorizeAnyPermission(["users.permissions.read", "users.read"]),
    rbacController.getUserAccess,
  );
  router.put(
    "/:id/access",
    authenticate,
    authorizeAllPermissions(["users.assign_role", "users.permissions.update"]),
    validate(updateUserAccessSchema),
    rbacController.updateUserAccess,
  );
  router.get(
    "/:id/permissions",
    authenticate,
    authorizeAnyPermission(["users.permissions.read", "users.read"]),
    rbacController.getUserAccess,
  );
  router.put(
    "/:id/permissions",
    authenticate,
    authorizePermission("users.permissions.update"),
    validate(updateUserPermissionOverridesSchema),
    rbacController.updateUserPermissionOverrides,
  );
  router.get(
    "/:id/effective-permissions",
    authenticate,
    authorizeAnyPermission(["users.permissions.read", "users.read"]),
    rbacController.getEffectivePermissions,
  );
  router.get("/:id", authenticate, authorizePermission("users.read"), controller.getUser);
  router.patch("/:id", authenticate, authorizePermission("users.update"), validate(updateUserSchema), controller.updateUser);
  router.patch(
    "/:id/status",
    authenticate,
    authorizeAnyPermission(["users.suspend", "users.deactivate"]),
    validate(updateUserStatusSchema),
    controller.updateStatus,
  );

  return router;
}

module.exports = createUserRoutes;
