
const pool = require("../config/db");

const createActivity = async (data) => {
    const query = `
        INSERT INTO audit_logs (
            user_id,
            user_name,
            user_email,
            action,
            module,
            record_id,
            description,
            old_values,
            new_values,
            ip_address,
            user_agent,
            request_method,
            request_url,
            status,
            error_message
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9::jsonb, $10, $11,
            $12, $13, $14, $15
        )
        RETURNING *
    `;

    const values = [
        data.user_id || null,
        data.user_name || null,
        data.user_email || null,
        data.action,
        data.module,
        data.record_id || null,
        data.description || null,
        JSON.stringify(data.old_values ?? null),
        JSON.stringify(data.new_values ?? null),
        data.ip_address || null,
        data.user_agent || null,
        data.request_method || null,
        data.request_url || null,
        data.status || "SUCCESS",
        data.error_message || null,
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
};

const getActivities = async ({
    page = 1,
    limit = 25,
    search = "",
    user_id,
    action,
    module,
    status,
    start_date,
    end_date,
}) => {
    const conditions = [];
    const values = [];

    const addCondition = (sql, value) => {
        values.push(value);
        conditions.push(sql.replace("?", `$${values.length}`));
    };

    if (user_id) {
        addCondition("user_id = ?", user_id);
    }

    if (action) {
        addCondition("action = ?", action);
    }

    if (module) {
        addCondition("module = ?", module);
    }

    if (status) {
        addCondition("status = ?", status);
    }

    if (start_date) {
        addCondition("created_at >= ?::date", start_date);
    }

    if (end_date) {
        addCondition(
            "created_at < (?::date + INTERVAL '1 day')",
            end_date
        );
    }

    if (search) {
        values.push(`%${search}%`);

        const index = values.length;

        conditions.push(`
            (
                user_name ILIKE $${index}
                OR user_email ILIKE $${index}
                OR description ILIKE $${index}
                OR module ILIKE $${index}
                OR record_id ILIKE $${index}
            )
        `);
    }

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const offset = (page - 1) * limit;

    const countResult = await pool.query(
        `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
        values
    );

    const total = Number(countResult.rows[0].count);

    const dataResult = await pool.query(
        `
        SELECT *
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset]
    );

    return {
        rows: dataResult.rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getActivityById = async (id) => {
    const result = await pool.query(
        `
        SELECT *
        FROM audit_logs
        WHERE id = $1
        `,
        [id]
    );

    return result.rows[0] || null;
};

const getActivitySummary = async () => {
    const result = await pool.query(`
        SELECT
            COUNT(*) AS total_activities,

            COUNT(*) FILTER (
                WHERE created_at >= CURRENT_DATE
            ) AS today_activities,

            COUNT(*) FILTER (
                WHERE status = 'FAILED'
                AND created_at >= CURRENT_DATE
            ) AS failed_activities,

            COUNT(DISTINCT user_id) FILTER (
                WHERE created_at >= CURRENT_DATE
            ) AS active_users

        FROM audit_logs
    `);

    return result.rows[0];
};

const getAvailableFilters = async () => {
    const result = await pool.query(`
        SELECT
            ARRAY(
                SELECT DISTINCT action
                FROM audit_logs
                ORDER BY action
            ) AS actions,

            ARRAY(
                SELECT DISTINCT module
                FROM audit_logs
                ORDER BY module
            ) AS modules
    `);

    return result.rows[0];
};

module.exports = {
    createActivity,
    getActivities,
    getActivityById,
    getActivitySummary,
    getAvailableFilters,
};
