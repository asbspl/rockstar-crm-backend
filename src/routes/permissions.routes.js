const express = require("express");
const createRbacController = require("../controllers/rbac.controller");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const {
  authorizeAnyPermission,
  authorizePermission,
} = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createModuleSchema,
  updateModuleSchema,
  createPermissionSchema,
  updatePermissionSchema,
} = require("../validators/user.validator");

function createPermissionsRoutes(config) {
  const router = express.Router();
  const controller = createRbacController();
  const authenticate = createAuthMiddleware(config);

  router.get(
    "/modules",
    authenticate,
    authorizeAnyPermission(["permissions.read", "users.read", "settings.read"]),
    controller.listModules,
  );
  router.post(
    "/modules",
    authenticate,
    authorizePermission("modules.manage"),
    validate(createModuleSchema),
    controller.createModule,
  );
  router.put(
    "/modules/:id",
    authenticate,
    authorizePermission("modules.manage"),
    validate(updateModuleSchema),
    controller.updateModule,
  );
  router.delete(
    "/modules/:id",
    authenticate,
    authorizePermission("modules.manage"),
    controller.deleteModule,
  );
  router.get(
    "/",
    authenticate,
    authorizeAnyPermission(["users.read", "permissions.read", "settings.read"]),
    controller.listPermissions,
  );
  router.post(
    "/",
    authenticate,
    authorizePermission("permissions.create"),
    validate(createPermissionSchema),
    controller.createPermission,
  );
  router.put(
    "/:id",
    authenticate,
    authorizePermission("permissions.update"),
    validate(updatePermissionSchema),
    controller.updatePermission,
  );

  return router;
}

module.exports = createPermissionsRoutes;
