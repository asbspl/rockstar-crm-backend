
const db = require("../config/db");

const query = (...args) => {
    if (typeof db.query === "function") {
        return db.query(...args);
    }

    if (db.pool && typeof db.pool.query === "function") {
        return db.pool.query(...args);
    }

    throw new Error("Database connection is not configured correctly.");
};

const normalizeSite = (row) => ({
    id: row.id,
    site_name: row.site_name,
    customer_id: row.customer_id,
    customer_name: row.customer_name || "",
    location_id: row.location_id,
    location_name: row.location_name || "",
    contact_person: row.contact_person || "",
    contact_number: row.contact_number || "",
    line_1: row.line_1 || "",
    line_2: row.line_2 || "",
    country: row.country || "India",
    state: row.state || "",
    city: row.city || "",
    pin_code: row.pin_code || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const getSites = async ({
    page = 1,
    limit = 10,
    search = "",
} = {}) => {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(
        100,
        Math.max(1, Number.parseInt(limit, 10) || 10)
    );
    const offset = (safePage - 1) * safeLimit;
    const searchTerm = String(search).trim();

    const params = [];
    let whereClause = "";

    if (searchTerm) {
        params.push(`%${searchTerm}%`);
        whereClause = `
            WHERE s.site_name ILIKE $1
               OR c.customer_name ILIKE $1
               OR l.location_name ILIKE $1
        `;
    }

    const countResult = await query(
        `
        SELECT COUNT(*)::int AS total
        FROM public.sites s
        LEFT JOIN public.customers c
            ON c.id = s.customer_id
        LEFT JOIN public.locations l
            ON l.id = s.location_id
        ${whereClause}
        `,
        params
    );

    const total = Number(countResult.rows[0]?.total || 0);

    const result = await query(
        `
        SELECT
            s.*,
            c.customer_name,
            l.location_name
        FROM public.sites s
        LEFT JOIN public.customers c
            ON c.id = s.customer_id
        LEFT JOIN public.locations l
            ON l.id = s.location_id
        ${whereClause}
        ORDER BY s.id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
        `,
        [...params, safeLimit, offset]
    );

    return {
        rows: result.rows.map(normalizeSite),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit),
        },
    };
};

const getSiteById = async (id) => {
    const result = await query(
        `
        SELECT
            s.*,
            c.customer_name,
            l.location_name
        FROM public.sites s
        LEFT JOIN public.customers c
            ON c.id = s.customer_id
        LEFT JOIN public.locations l
            ON l.id = s.location_id
        WHERE s.id = $1
        `,
        [id]
    );

    if (!result.rows.length) {
        return null;
    }

    return normalizeSite(result.rows[0]);
};

const createSite = async (data) => {
    const {
        site_name,
        customer_id,
        location_id,
        contact_person,
        contact_number,
        line_1,
        line_2,
        country,
        state,
        city,
        pin_code,
    } = data;

    const result = await query(
        `
        INSERT INTO public.sites (
            site_name,
            customer_id,
            location_id,
            contact_person,
            contact_number,
            line_1,
            line_2,
            country,
            state,
            city,
            pin_code,
            created_at,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, NOW(), NOW()
        )
        RETURNING *
        `,
        [
            site_name.trim(),
            customer_id,
            location_id || null,
            contact_person || null,
            contact_number || null,
            line_1 || null,
            line_2 || null,
            country || "India",
            state || null,
            city || null,
            pin_code || null,
        ]
    );

    return getSiteById(result.rows[0].id);
};

const updateSite = async (id, data) => {
    const {
        site_name,
        customer_id,
        location_id,
        contact_person,
        contact_number,
        line_1,
        line_2,
        country,
        state,
        city,
        pin_code,
    } = data;

    const result = await query(
        `
        UPDATE public.sites
        SET
            site_name = $1,
            customer_id = $2,
            location_id = $3,
            contact_person = $4,
            contact_number = $5,
            line_1 = $6,
            line_2 = $7,
            country = $8,
            state = $9,
            city = $10,
            pin_code = $11,
            updated_at = NOW()
        WHERE id = $12
        RETURNING id
        `,
        [
            site_name.trim(),
            customer_id,
            location_id || null,
            contact_person || null,
            contact_number || null,
            line_1 || null,
            line_2 || null,
            country || "India",
            state || null,
            city || null,
            pin_code || null,
            id,
        ]
    );

    if (!result.rows.length) {
        return null;
    }

    return getSiteById(result.rows[0].id);
};

const deleteSite = async (id) => {
    const result = await query(
        `
        DELETE FROM public.sites
        WHERE id = $1
        RETURNING id
        `,
        [id]
    );

    return result.rows.length > 0;
};

module.exports = {
    getSites,
    getSiteById,
    createSite,
    updateSite,
    deleteSite,
};
