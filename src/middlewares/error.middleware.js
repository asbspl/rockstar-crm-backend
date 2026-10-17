
function errorMiddleware(err, req, res, next) {
  console.error("API Error:", {
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    code: err.code,
    detail: err.detail,
    stack: err.stack,
  });

  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) && err.statusCode >= 400
      ? err.statusCode
      : Number.isInteger(err.status) && err.status >= 400
        ? err.status
        : 500;

return res.status(statusCode).json({
  success: false,
  message:
    statusCode >= 500
      ? "An internal server error occurred"
      : err.message || "Request failed",
  // TEMPORARY, remove after debugging
  debug: { message: err.message, code: err.code, stack: err.stack?.split("\n").slice(0, 5) },
});
}

module.exports = errorMiddleware;
