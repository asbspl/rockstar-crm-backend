const dashboardModel = require("../models/dashboard.model");

function createDashboardService(config) {
  return {
    async getSummary() {
      const summary = await dashboardModel.getSummary(config);
      return {
        companies: Number(summary.companies ?? 0),
        employees: Number(summary.employees ?? 0),
        drivers: Number(summary.drivers ?? 0),
        contractors: Number(summary.contractors ?? 0),
        clients: Number(summary.clients ?? 0),
        customers: Number(summary.customers ?? 0),
        sites: Number(summary.sites ?? 0),
        quotations: Number(summary.quotations ?? 0),
        orders: Number(summary.orders ?? 0),
        visits: Number(summary.visits ?? 0),
        queries: Number(summary.queries ?? 0),
      };
    },
  };
}

module.exports = createDashboardService;