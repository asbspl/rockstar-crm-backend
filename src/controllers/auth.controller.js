
const ApiResponse = require("../utils/ApiResponse");

function createAuthController(authService) {
  return {
    // ========================================================
    // REGISTER
    // ========================================================
    async register(req, res, next) {
      try {
        const data = await authService.register(req.body, req.files);

        return res
          .status(201)
          .json(
            new ApiResponse("Registration submitted successfully", data)
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // LOGIN
    // ========================================================
    async login(req, res, next) {
      try {
        const data = await authService.login(
          req.body.email,
          req.body.password,
          {
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || "unknown",
          }
        );

        return res
          .status(200)
          .json(new ApiResponse("Login successful", data));
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // LOGOUT
    // ========================================================
    async logout(req, res, next) {
      try {
        const data = await authService.logout({
          userId: req.auth.userId,
          refreshToken: req.body?.refreshToken,
        });

        return res
          .status(200)
          .json(new ApiResponse("Logged out successfully", data));
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // CURRENT USER
    // ========================================================
    async me(req, res, next) {
      try {
        const data = await authService.getCurrentUser(req.auth.userId);

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Authenticated user retrieved successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // REGISTRATION STATUS
    // ========================================================
    async registrationStatus(req, res, next) {
      try {
        const data = await authService.getRegistrationStatus(
          req.auth.userId
        );

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Registration status retrieved successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // REFRESH ACCESS TOKEN
    // ========================================================
    async refresh(req, res, next) {
      try {
        const refreshToken =
          req.body?.refreshToken || req.cookies?.refresh_token;

        const data = await authService.refreshAccessToken(refreshToken, {
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || "unknown",
        });

        return res
          .status(200)
          .json(
            new ApiResponse("Token refreshed successfully", data)
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // CHANGE PASSWORD
    // ========================================================
    async changePassword(req, res, next) {
      try {
        const data = await authService.changePassword(
          req.auth.userId,
          req.body.currentPassword,
          req.body.newPassword
        );

        return res
          .status(200)
          .json(
            new ApiResponse("Password changed successfully", data)
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // REQUEST PASSWORD RESET
    // POST /api/auth/forgot-password
    // POST /api/auth/request-password-reset
    // ========================================================
    async requestPasswordReset(req, res, next) {
      try {
        const email = String(req.body?.email || "")
          .trim()
          .toLowerCase();

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Please enter your email address.",
            data: {
              requested: false,
              emailSent: false,
            },
          });
        }

        // The service performs account eligibility checks,
        // creates the token, stores it, and sends the email.
        const result = await authService.requestPasswordReset(email);

        // The service must return a valid result.
        if (!result || typeof result !== "object") {
          const error = new Error(
            "The password reset service returned an invalid response."
          );
          error.statusCode = 500;
          return next(error);
        }

        // Never report success if the email utility indicates failure.
        if (result.emailSent !== true) {
          const error = new Error(
            result.message ||
              "Unable to send the password reset email. Please try again later."
          );
          error.statusCode = 502;
          return next(error);
        }

        return res.status(200).json({
          success: true,
          message:
            result.message ||
            "Password reset email sent successfully. Please check your inbox.",
          data: {
            requested: true,
            emailSent: true,
          },
        });
      } catch (error) {
        console.error("Password reset request failed:", {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
        });

        return next(error);
      }
    },

    // ========================================================
    // VERIFY PASSWORD RESET TOKEN
    // GET /api/auth/verify-reset-token?token=...
    // ========================================================
    async verifyResetToken(req, res, next) {
      try {
        const token = String(req.query?.token || "").trim();

        const data = await authService.verifyPasswordResetToken(token);

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Password reset token status retrieved successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },

    // ========================================================
    // RESET PASSWORD
    // POST /api/auth/reset-password
    // ========================================================
    async resetPassword(req, res, next) {
      try {
        const newPassword =
          req.body?.password || req.body?.newPassword;

        const data = await authService.resetPassword(
          req.body?.token,
          newPassword
        );

        return res
          .status(200)
          .json(
            new ApiResponse("Password reset successfully", data)
          );
      } catch (error) {
        return next(error);
      }
    },
  };
}

module.exports = createAuthController;
