
const activityModel = require("../models/activity.model");
const { logActivity } = require("../services/activity.service");
const { enrichActivities } = require("../services/activity-presentation.service");

function validDate(value) {
    if (value === undefined || value === null || value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function validBigintId(value) {
    const text = String(value);
    if (!/^\d{1,19}$/.test(text)) return false;
    const parsed = BigInt(text);
    return parsed > 0n && parsed <= 9223372036854775807n;
}

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
        const userId = req.query.user_id ?? req.query.userId;
        const startDate = req.query.start_date ?? req.query.fromDate;
        const endDate = req.query.end_date ?? req.query.toDate;

        if (
            userId &&
            !validBigintId(userId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID filter",
            });
        }

        if (!validDate(startDate) || !validDate(endDate)) {
            return res.status(400).json({
                success: false,
                message: "Dates must be valid YYYY-MM-DD values",
            });
        }

        const result = await activityModel.getActivities({
            page,
            limit,
            search: String(req.query.search || "").trim(),
            user_id: userId || undefined,
            action: req.query.action || undefined,
            module: req.query.module || undefined,
            status: req.query.status || undefined,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
            entity_id: req.query.entity_id || req.query.entityId || undefined,
        });
        const activities = await enrichActivities(result.rows);

        res.status(200).json({
            success: true,
            message: "Activities fetched successfully",
            data: {
                activities,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getActivityDetails = async (req, res, next) => {
    try {
        const id = String(req.params.id);

        if (!validBigintId(id)) {
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
            data: await enrichActivities(activity),
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

const recordActivityExport = async (req, res, next) => {
    try {
        const userName =
            req.auth.user?.full_name || req.auth.user?.email || "User";
        await logActivity({
            req,
            action: "EXPORT",
            module: "Activity History",
            entity_type: "AuditLog",
            description: `${userName} exported activity history`,
            new_values: { format: "CSV" },
        });

        res.status(201).json({
            success: true,
            message: "Activity export recorded",
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
    recordActivityExport,
};
