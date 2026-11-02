
const express = require("express");

const router = express.Router();

const activityController = require("../controllers/activity.controller");

// IMPORTANT:
// Attach your existing authentication middleware here.
// Attach your existing RBAC permission middleware here.
//
// Required permission: activity.read
//
// Example integration:
// router.use(yourExistingAuthMiddleware);
// router.use(yourExistingPermissionMiddleware("activity.read"));

router.get("/", activityController.getActivities);

router.get("/summary", activityController.getActivitySummary);

router.get("/filters", activityController.getActivityFilters);

router.get("/:id", activityController.getActivityDetails);

module.exports = router;
