const ApiError = require("../utils/ApiError");

function validate(schema) {
  return function validationMiddleware(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new ApiError(400, "Invalid request data"));
    }
    req.body = result.data;
    return next();
  };
}

module.exports = validate;