const ApiResponse = require("../utils/ApiResponse");

function createAuthController(authService) {
  return {
    async login(req, res) {
      const data = await authService.login(req.body.email, req.body.password);
      res.json(new ApiResponse("Login successful", data));
    },

    async me(req, res) {
      const data = await authService.getCurrentUser(req.auth.userId);
      res.json(new ApiResponse("Authenticated user retrieved successfully", data));
    },
  };
}

module.exports = createAuthController;