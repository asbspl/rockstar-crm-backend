const express = require("express");

const createAuthController = require("../controllers/auth.controller");
const createAuthService = require("../services/auth.service");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");

const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  logoutSchema,
} = require("../validators/auth.validator");

function createAuthRoutes(config) {
  const router = express.Router();

  const authService = createAuthService(config);
  const controller = createAuthController(authService);
  const authenticate = createAuthMiddleware(config);

  // Registration and login
  router.post(
    "/register",
    upload.fields([
      { name: "panCard", maxCount: 1 },
      { name: "aadhaarCard", maxCount: 1 },
    ]),
    validate(registerSchema),
    controller.register
  );

  router.post("/login", validate(loginSchema), controller.login);

  // Authenticated account routes
  router.post("/logout", authenticate, validate(logoutSchema), controller.logout);

  router.get("/me", authenticate, controller.me);

  router.get("/registration-status", authenticate, controller.registrationStatus);

  router.post("/refresh", validate(refreshTokenSchema), controller.refresh);

  router.post(
    "/change-password",
    authenticate,
    validate(changePasswordSchema),
    controller.changePassword
  );

  // Forgot password (and legacy alias)
  router.post(
    "/forgot-password",
    validate(requestPasswordResetSchema),
    controller.requestPasswordReset
  );
  console.log("In router")
  router.post(
    "/request-password-reset",
    validate(requestPasswordResetSchema),
    controller.requestPasswordReset
  );

  router.get("/verify-reset-token", controller.verifyResetToken);

  // Reset password using the token from the email link
  router.post(
    "/reset-password",
    validate(resetPasswordSchema),
    controller.resetPassword
  );

  return router;
}

module.exports = createAuthRoutes;