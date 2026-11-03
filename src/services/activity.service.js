
const activityModel = require("../models/activity.model");

const sensitiveFieldPattern =
    /(password|token|authorization|cookie|secret|api[_-]?key|credential|private[_-]?key|aadhaar|aadhar|pan|bank|ifsc|account[_-]?number|document|file[_-]?path|photo)/i;

const sanitizeObject = (value) => {
    if (!value || typeof value !== "object") {
        return value ?? null;
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeObject);
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, val]) => {
            if (sensitiveFieldPattern.test(key)) {
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
    entity_type = null,
    record_id = null,
    description = "",
    old_values = null,
    new_values = null,
    status = "SUCCESS",
    error_message = null,
    auditClient = null,
    user: userOverride = null,
}) => {
    try {
        const user = userOverride || req?.auth?.user || req?.user || {};
        const userId = req?.auth?.userId || user.id || user.user_id || null;
        const ipAddress = req?.ip || req?.socket?.remoteAddress || null;

        return await activityModel.createActivity({
            user_id: userId,

            user_name:
                user.full_name ||
                user.name ||
                (userId ? null : "System"),

            user_email: user.email || null,

            action: String(action).toUpperCase(),

            module: String(module),

            entity_type,

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

            request_url: String(req?.originalUrl || req?.url || "").split("?")[0] || null,

            status: String(status).toUpperCase(),

            error_message: error_message
                ? String(error_message).slice(0, 1000)
                : null,
        }, auditClient);
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
