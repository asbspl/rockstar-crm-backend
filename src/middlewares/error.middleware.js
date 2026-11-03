
function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) && err.statusCode >= 400
      ? err.statusCode
      : Number.isInteger(err.status) && err.status >= 400
        ? err.status
        : 500;

  const message =
    statusCode >= 500
      ? "An internal server error occurred"
      : err.message || "Request failed";

  if (statusCode >= 500) {
    console.error("API Error:", {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      operation: err.operation || "request",
      message: err.message || message,
      code: err.code || undefined,
      detail: err.detail || undefined,
      hint: err.hint || undefined,
      table: err.table || undefined,
      column: err.column || undefined,
      constraint: err.constraint || undefined,
      stack: err.stack,
    });
  } else {
    console.error("API Error:", {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      message,
    });
  }

  return res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = errorMiddleware;
