const express = require("express");
const createAuthController = require("../controllers/auth.controller");
const createAuthService = require("../services/auth.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { loginSchema } = require("../validators/auth.validator");

function createAuthRoutes(config) {
  const router = express.Router();
  const controller = createAuthController(createAuthService(config));
  const authenticate = createAuthMiddleware(config);

  router.post("/login", validate(loginSchema), controller.login);
  router.get("/me", authenticate, controller.me);
  return router;
}

module.exports = createAuthRoutes;