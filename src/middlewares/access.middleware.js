const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function authenticateToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      `SELECT id, email, full_name, status, account_status, is_deleted
       FROM public.users
       WHERE id = $1`,
      [decoded.sub || decoded.id]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    const user = result.rows[0];

    if (user.is_deleted || user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    if (user.account_status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Your registration has not been approved.",
        accountStatus: user.account_status,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    next(error);
  }
}

function requirePermission(...requiredCodes) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
        });
      }

      const result = await pool.query(
        `SELECT DISTINCT p.code
         FROM public.permissions p
         WHERE p.code IN (
           SELECT p2.code
           FROM public.role_permissions rp
           JOIN public.permissions p2 ON p2.id = rp.permission_id
           JOIN public.user_roles ur ON ur.role_id = rp.role_id
           WHERE ur.user_id = $1

           UNION

           SELECT p3.code
           FROM public.user_permissions up
           JOIN public.permissions p3 ON p3.id = up.permission_id
           WHERE up.user_id = $1
         )`,
        [req.user.id]
      );

      const actual = new Set(result.rows.map((row) => row.code));
      const allowed = requiredCodes.every((code) => actual.has(code));

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action.",
          requiredPermissions: requiredCodes,
        });
      }

      req.user.permissions = [...actual];
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  authenticateToken,
  requirePermission,
};