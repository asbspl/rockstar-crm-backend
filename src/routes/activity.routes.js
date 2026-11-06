
const express = require("express");
const activityController = require("../controllers/activity.controller");
const createAuthMiddleware = require("../middlewares/auth.middleware");
const {
    authorizePermission,
} = require("../middlewares/auth.middleware");

function createActivityRoutes(config) {
    const router = express.Router();
    const authenticate = createAuthMiddleware(config);

    router.use(authenticate, authorizePermission("audit_logs.read"));

    router.get("/", activityController.getActivities);

    router.get("/summary", activityController.getActivitySummary);

    router.get("/filters", activityController.getActivityFilters);

    router.post(
        "/export",
        authorizePermission("reports.export"),
        activityController.recordActivityExport
    );

    router.get("/:id", activityController.getActivityDetails);

    return router;
}

module.exports = createActivityRoutes;
