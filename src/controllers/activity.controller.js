
const activityModel = require("../models/activity.model");

const getActivities = async (req, res, next) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(req.query.limit, 10) || 25
            )
        );

        const result = await activityModel.getActivities({
            page,
            limit,
            search: String(req.query.search || "").trim(),
            user_id: req.query.user_id || undefined,
            action: req.query.action || undefined,
            module: req.query.module || undefined,
            status: req.query.status || undefined,
            start_date: req.query.start_date || undefined,
            end_date: req.query.end_date || undefined,
        });

        res.status(200).json({
            success: true,
            message: "Activities fetched successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getActivityDetails = async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid activity ID",
            });
        }

        const activity = await activityModel.getActivityById(id);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: "Activity not found",
            });
        }

        res.status(200).json({
            success: true,
            data: activity,
        });
    } catch (error) {
        next(error);
    }
};

const getActivitySummary = async (req, res, next) => {
    try {
        const summary = await activityModel.getActivitySummary();

        res.status(200).json({
            success: true,
            data: summary,
        });
    } catch (error) {
        next(error);
    }
};

const getActivityFilters = async (req, res, next) => {
    try {
        const filters = await activityModel.getAvailableFilters();

        res.status(200).json({
            success: true,
            data: filters,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActivities,
    getActivityDetails,
    getActivitySummary,
    getActivityFilters,
};
