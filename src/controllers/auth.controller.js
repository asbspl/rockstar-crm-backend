
const ApiResponse = require("../utils/ApiResponse");

function createAuthController(authService) {
  return {
    async register(req, res, next) {
      try {
        const data = await authService.register(req.body, req.files);
        res
          .status(201)
          .json(
            new ApiResponse("Registration submitted successfully", data)
          );
      } catch (error) {
        next(error);
      }
    },

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

        res.status(200).json(new ApiResponse("Login successful", data));
      } catch (error) {
        next(error);
      }
    },

    async logout(req, res, next) {
      try {
        const data = await authService.logout({
          userId: req.auth.userId,
          refreshToken: req.body?.refreshToken,
        });

        res.status(200).json(new ApiResponse("Logged out successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async me(req, res, next) {
      try {
        const data = await authService.getCurrentUser(req.auth.userId);

        res
          .status(200)
          .json(
            new ApiResponse(
              "Authenticated user retrieved successfully",
              data
            )
          );
      } catch (error) {
        next(error);
      }
    },

    async registrationStatus(req, res, next) {
      try {
        const data = await authService.getRegistrationStatus(req.auth.userId);

        res
          .status(200)
          .json(
            new ApiResponse("Registration status retrieved successfully", data)
          );
      } catch (error) {
        next(error);
      }
    },

    async refresh(req, res, next) {
      try {
        const refreshToken =
          req.body?.refreshToken || req.cookies?.refresh_token;

        const data = await authService.refreshAccessToken(refreshToken, {
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || "unknown",
        });

        res
          .status(200)
          .json(new ApiResponse("Token refreshed successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async changePassword(req, res, next) {
      try {
        const data = await authService.changePassword(
          req.auth.userId,
          req.body.currentPassword,
          req.body.newPassword
        );

        res.status(200).json(new ApiResponse("Password changed successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async requestPasswordReset(req, res, next) {
      try {
        const data = await authService.requestPasswordReset(req.body.email);

        res
          .status(200)
          .json(
            new ApiResponse(
              "If an account exists for this email, a reset link has been prepared",
              data
            )
          );
      } catch (error) {
        next(error);
      }
    },

    async resetPassword(req, res, next) {
      try {
        const data = await authService.resetPassword(
          req.body.token,
          req.body.newPassword
        );

        res
          .status(200)
          .json(new ApiResponse("Password reset successfully", data));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createAuthController;
