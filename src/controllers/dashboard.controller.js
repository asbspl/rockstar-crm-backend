const ApiResponse = require("../utils/ApiResponse");

function createDashboardController(dashboardService) {
  return {
    async summary(req, res) {
      const data = await dashboardService.getSummary();
      res.json(new ApiResponse("Dashboard summary retrieved successfully", data));
    },
  };
}

module.exports = createDashboardController;