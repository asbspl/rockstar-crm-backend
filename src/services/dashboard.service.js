const dashboardModel = require("../models/dashboard.model");

function createDashboardService(config) {
  return {
    getSummary() {
      return dashboardModel.getSummary(config);
    },
  };
}

module.exports = createDashboardService;