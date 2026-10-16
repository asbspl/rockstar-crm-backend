
const ApiResponse = require("../utils/ApiResponse");

function createAuthController(authService) {
  return {
    async register(req, res, next) {
      try {
        const data = await authService.register(req.body, req.files);

        return res
          .status(201)
          .json(
            new ApiResponse(
              "Registration submitted successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
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

        return res
          .status(200)
          .json(new ApiResponse("Login successful", data));
      } catch (error) {
        return next(error);
      }
    },

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

    async me(req, res, next) {
      try {
        const data = await authService.getCurrentUser(
          req.auth.userId
        );

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

    async refresh(req, res, next) {
      try {
        const refreshToken =
          req.body?.refreshToken ||
          req.cookies?.refresh_token;

        const data = await authService.refreshAccessToken(
          refreshToken,
          {
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || "unknown",
          }
        );

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Token refreshed successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },

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
            new ApiResponse(
              "Password changed successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },

    // POST /api/auth/forgot-password
    // POST /api/auth/request-password-reset



async requestPasswordReset(req, res, next) {
  console.log("In req pass services")
  try {
    const data = await authService.requestPasswordReset(
      req.body?.email
    );
    console.log("In requestPasswordReset", data)
    if (!data.emailSent) {
      return res.status(200).json({
        success: true,
        message:
          "If an eligible account exists, a password reset email will be sent.",
        data: {
          requested: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset email sent successfully.",
      data: {
        requested: true,
        emailSent: true,
      },
    });
  } catch (error) {
    console.error("Password reset request failed:", {
      message: error.message,
      code: error.code,
    });

    return next(error);
  }
},




    // GET /api/auth/verify-reset-token?token=...
    async verifyResetToken(req, res, next) {
      try {
        const token = String(req.query?.token || "").trim();
        const data = await authService.verifyPasswordResetToken(
          token
        );

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

    // POST /api/auth/reset-password
    async resetPassword(req, res, next) {
      try {
        const newPassword =
          req.body.password || req.body.newPassword;

        const data = await authService.resetPassword(
          req.body.token,
          newPassword
        );

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Password reset successfully",
              data
            )
          );
      } catch (error) {
        return next(error);
      }
    },
  };
}


const passwordResetService = require('../services/password-reset.service');

exports.forgotPassword = async (req, res, next) => {
  try {
    await passwordResetService.requestReset(req.body.email);
    res.json({ success: true, message: 'Password reset link sent to your email' });
  } catch (e) { next(e); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await passwordResetService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, message: 'Password reset successful. Please log in.' });
  } catch (e) { next(e); }
};
module.exports = createAuthController;
