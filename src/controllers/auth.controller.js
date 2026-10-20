
const ApiResponse = require("../utils/ApiResponse");

const REFRESH_COOKIE_NAME = "rockstar_refresh_token";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function createAuthController(authService) {
  return {
    // REGISTER
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

    // LOGIN
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

        if (!data?.accessToken || !data?.refreshToken) {
          const error = new Error(
            "Login did not return the required authentication tokens."
          );
          error.statusCode = 500;
          return next(error);
        }

        // Store the refresh token in an HttpOnly cookie.
        res.cookie(
          REFRESH_COOKIE_NAME,
          data.refreshToken,
          refreshCookieOptions
        );

        // Return the access token to the frontend.
        // Do not expose the refresh token in the JSON response.
        const responseData = { ...data };
        delete responseData.refreshToken;

        return res
          .status(200)
          .json(
            new ApiResponse("Login successful", responseData)
          );
      } catch (error) {
        return next(error);
      }
    },

    // LOGOUT
    async logout(req, res, next) {
      try {
        const refreshToken =
          req.cookies?.[REFRESH_COOKIE_NAME] ||
          req.body?.refreshToken;

        const data = await authService.logout({
          userId: req.auth.userId,
          refreshToken,
        });

        res.clearCookie(REFRESH_COOKIE_NAME, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/api/auth",
        });

        return res
          .status(200)
          .json(
            new ApiResponse("Logged out successfully", data)
          );
      } catch (error) {
        return next(error);
      }
    },

    // CURRENT USER
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

    // REGISTRATION STATUS
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

    // REFRESH ACCESS TOKEN
    async refresh(req, res, next) {
      try {
        const refreshToken =
          req.cookies?.[REFRESH_COOKIE_NAME] ||
          req.body?.refreshToken;

        if (!refreshToken) {
          const error = new Error(
            "Refresh token is missing. Please log in again."
          );
          error.statusCode = 401;
          return next(error);
        }

        const data = await authService.refreshAccessToken(
          refreshToken,
          {
            ipAddress: req.ip,
            userAgent: req.get("user-agent") || "unknown",
          }
        );

        if (!data?.accessToken || !data?.refreshToken) {
          const error = new Error(
            "Refresh service did not return the required tokens."
          );
          error.statusCode = 500;
          return next(error);
        }

        // Replace the old refresh cookie with the rotated token.
        res.cookie(
          REFRESH_COOKIE_NAME,
          data.refreshToken,
          refreshCookieOptions
        );

        // The refresh token stays in the HttpOnly cookie.
        const responseData = { ...data };
        delete responseData.refreshToken;
        delete responseData.token;

        return res
          .status(200)
          .json(
            new ApiResponse(
              "Token refreshed successfully",
              responseData
            )
          );
      } catch (error) {
        return next(error);
      }
    },

    // CHANGE PASSWORD
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

    // REQUEST PASSWORD RESET
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

        const result = await authService.requestPasswordReset(email);

        if (!result || typeof result !== "object") {
          const error = new Error(
            "The password reset service returned an invalid response."
          );
          error.statusCode = 500;
          return next(error);
        }

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

    // VERIFY PASSWORD RESET TOKEN
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

    // RESET PASSWORD
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
