const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");

function logAuthenticationDenial(req, reason, nodeEnv) {
  if (nodeEnv === "production") return;
  console.warn("Authentication denied", {
    method: req.method,
    path: req.originalUrl,
    reason,
  });
}

function logAuthorizationDenial(req, permissionKey) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("Authorization denied", {
    method: req.method,
    path: req.originalUrl,
    requiredPermission: permissionKey,
  });
}

function classifyJwtFailure(error) {
  if (error.name === "TokenExpiredError") return "expired_token";
  if (error.name === "NotBeforeError") return "not_yet_valid_token";

  const message = String(error.message || "").toLowerCase();
  if (message.includes("signature")) return "signature_mismatch";
  if (message.includes("audience")) return "audience_mismatch";
  if (message.includes("issuer")) return "issuer_mismatch";
  return "malformed_or_invalid_token";
}

function createAuthMiddleware(config) {
  return async function authMiddleware(req, res, next) {
    const authorization = req.get("authorization");
    const [scheme, token] = authorization ? authorization.split(" ") : [];

    if (scheme !== "Bearer" || !token) {
      logAuthenticationDenial(req, "missing_bearer_token", config.nodeEnv);
      return next(new ApiError(401, "Authentication is required"));
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      });
    } catch (error) {
      logAuthenticationDenial(req, classifyJwtFailure(error), config.nodeEnv);
      return next(new ApiError(401, "Invalid or expired authentication token"));
    }

    if (!payload || typeof payload === "string" || !payload.sub) {
      logAuthenticationDenial(req, "invalid_token_payload", config.nodeEnv);
      return next(new ApiError(401, "Invalid or expired authentication token"));
    }

    let user;
    try {
      user = await userModel.findById(payload.sub);
    } catch (error) {
      return next(error);
    }

    if (!user || user.status !== "active") {
      logAuthenticationDenial(req, "missing_or_inactive_user", config.nodeEnv);
      return next(new ApiError(401, "Account is disabled or inactive"));
    }

    const normalizedAccountStatus = String(user.account_status || "").trim().toLowerCase();
    const allowedStatuses = ["", "approved", "pending", "under_review"];
    if (!allowedStatuses.includes(normalizedAccountStatus)) {
      const messageMap = {
        rejected: "Account has been rejected",
        suspended: "Account is suspended",
      };
      logAuthenticationDenial(req, `account_status_${normalizedAccountStatus}`, config.nodeEnv);
      return next(new ApiError(401, messageMap[normalizedAccountStatus] || "Account is not active"));
    }

    try {
      const roles = await userModel.getRolesForUser(user.id);
      const permissions = await userModel.getPermissionsForUser(user.id);

      req.auth = {
        userId: String(user.id),
        user,
        roles,
        permissions,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function authorizePermission(permissionKey) {
  return function permissionMiddleware(req, res, next) {
    if (!req.auth || !req.auth.permissions || !req.auth.permissions.includes(permissionKey)) {
      logAuthorizationDenial(req, permissionKey);
      return next(new ApiError(403, "You do not have permission to access this resource"));
    }
    return next();
  };
}

function authorizeAnyPermission(permissionKeys) {
  return function permissionMiddleware(req, res, next) {
    const permissions = req.auth?.permissions || [];
    if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) {
      logAuthorizationDenial(req, "invalid_permission_configuration");
      return next(new ApiError(403, "Permission check is misconfigured"));
    }
    if (!permissionKeys.some((permissionKey) => permissions.includes(permissionKey))) {
      logAuthorizationDenial(req, permissionKeys.join(","));
      return next(new ApiError(403, "You do not have permission to access this resource"));
    }
    return next();
  };
}

module.exports = createAuthMiddleware;
module.exports.authorizePermission = authorizePermission;
module.exports.authorizeAnyPermission = authorizeAnyPermission;