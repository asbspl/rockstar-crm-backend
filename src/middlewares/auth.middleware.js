const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

function createAuthMiddleware(config) {
  return function authMiddleware(req, res, next) {
    const authorization = req.get("authorization");
    const [scheme, token] = authorization ? authorization.split(" ") : [];

    if (scheme !== "Bearer" || !token) {
      return next(new ApiError(401, "Authentication is required"));
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (!payload || typeof payload === "string" || !payload.sub) {
        throw new Error("Invalid token payload");
      }
      req.auth = { userId: String(payload.sub) };
      return next();
    } catch {
      return next(new ApiError(401, "Invalid or expired authentication token"));
    }
  };
}

module.exports = createAuthMiddleware;