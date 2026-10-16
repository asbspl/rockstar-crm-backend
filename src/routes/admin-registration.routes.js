
const express = require("express");

const createAdminRegistrationController = require(
  "../controllers/admin-registration.controller"
);

const createAuthMiddleware = require("../middlewares/auth.middleware");

const {
  authorizePermission,
} = require("../middlewares/auth.middleware");

function createAdminRegistrationRoutes(config) {
  const router = express.Router();
  const controller = createAdminRegistrationController();

  // Initialize the existing authentication middleware.
  const authenticate = createAuthMiddleware(config);

  // Use the permission codes that exist in your database.
  const canReadRegistrations = authorizePermission("registrations.read");
  const canReviewRegistrations = authorizePermission("registrations.review");

  router.get(
    "/meta/roles",
    authenticate,
    canReadRegistrations,
    controller.listRoles
  );

  router.get(
    "/meta/permissions",
    authenticate,
    canReadRegistrations,
    controller.listPermissions
  );

  router.get(
    "/",
    authenticate,
    canReadRegistrations,
    controller.listRegistrations
  );

  router.get(
    "/:id",
    authenticate,
    canReadRegistrations,
    controller.getRegistration
  );

  router.patch(
    "/:id/review",
    authenticate,
    canReviewRegistrations,
    controller.reviewRegistration
  );

  return router;
}

module.exports = createAdminRegistrationRoutes;
