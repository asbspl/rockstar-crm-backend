const ApiError = require("../utils/ApiError");

function validate(schema) {
  return function validationMiddleware(req, res, next) {
    const result = schema.safeParse(req.body);
  if (!result.success) {
  // Log field names and validation messages only.
  // Never log the submitted values because registration
  // contains sensitive KYC and banking information.
  if (process.env.NODE_ENV !== "production") {
    console.warn("Request validation failed", {
      method: req.method,
      path: req.originalUrl,
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  return res.status(400).json({
    success: false,
    message: "Invalid request data",
    ...(process.env.NODE_ENV !== "production" && {
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    }),
  });
}

req.body = result.data;
return next();
  };
}

module.exports = validate;