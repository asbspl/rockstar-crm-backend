const ApiResponse = require("../utils/ApiResponse");

function createDashboardController(dashboardService) {
  return {
    async summary(req, res, next) {
      try {
        const data = await dashboardService.getSummary();
        res.status(200).json(new ApiResponse("Dashboard summary fetched successfully", data));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createDashboardController;