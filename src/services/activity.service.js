
const activityModel = require("../models/activity.model");

const sanitizeObject = (value) => {
    if (!value || typeof value !== "object") {
        return value ?? null;
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeObject);
    }

    const sensitiveFields = [
        "password",
        "new_password",
        "current_password",
        "confirm_password",
        "access_token",
        "refresh_token",
        "token",
        "authorization",
        "cookie",
        "secret",
        "api_key",
    ];

    return Object.fromEntries(
        Object.entries(value).map(([key, val]) => {
            if (sensitiveFields.includes(key.toLowerCase())) {
                return [key, "[REDACTED]"];
            }

            return [key, sanitizeObject(val)];
        })
    );
};

const logActivity = async ({
    req,
    action,
    module,
    record_id = null,
    description = "",
    old_values = null,
    new_values = null,
    status = "SUCCESS",
    error_message = null,
}) => {
    try {
        const user = req?.user || {};

        const forwarded = req?.headers?.["x-forwarded-for"];

        const ipAddress = forwarded
            ? String(forwarded).split(",")[0].trim()
            : req?.ip || req?.socket?.remoteAddress || null;

        return await activityModel.createActivity({
            user_id: user.id || user.user_id || null,

            user_name:
                user.full_name ||
                user.name ||
                null,

            user_email: user.email || null,

            action: String(action).toUpperCase(),

            module: String(module).toUpperCase(),

            record_id:
                record_id === null
                    ? null
                    : String(record_id),

            description,

            old_values: sanitizeObject(old_values),

            new_values: sanitizeObject(new_values),

            ip_address: ipAddress,

            user_agent: req?.headers?.["user-agent"] || null,

            request_method: req?.method || null,

            request_url: req?.originalUrl || req?.url || null,

            status: String(status).toUpperCase(),

            error_message: error_message
                ? String(error_message).slice(0, 1000)
                : null,
        });
    } catch (error) {
        // Audit failures must be visible to server operators.
        console.error("AUDIT LOG ERROR:", error);
        throw error;
    }
};

module.exports = {
    logActivity,
    sanitizeObject,
};
