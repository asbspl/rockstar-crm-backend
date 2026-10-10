const { ZodError } = require("zod");

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);

  let statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  let message = error.message || "An unexpected error occurred";

  if (error instanceof ZodError) {
    statusCode = 400;
    message = "Invalid request data";
  } else if (statusCode >= 500 && !error.isOperational) {
    message = "An internal server error occurred";
  }

  if (statusCode >= 500) {
    console.error("Request failed", {
      method: req.method,
      path: req.originalUrl,
      name: error.name,
      code: error.code || "unknown",
    });
  }

  res.status(statusCode).json({ success: false, message });
}

module.exports = errorMiddleware;