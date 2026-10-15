
const express = require("express");
const createAdminRegistrationController = require(
  "../controllers/admin-registration.controller"
);

function createAdminRegistrationRoutes(config) {
  const router = express.Router();
  const controller = createAdminRegistrationController();

  // Register static routes before /:id.
  router.get("/meta/roles", controller.listRoles);
  router.get("/meta/permissions", controller.listPermissions);

  router.get("/", controller.listRegistrations);
  router.get("/:id", controller.getRegistration);
  router.patch("/:id/review", controller.reviewRegistration);

  return router;
}

module.exports = createAdminRegistrationRoutes;
