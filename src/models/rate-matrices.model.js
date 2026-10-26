const db = require("../config/db");

const query = (...args) => {
    if (typeof db.query === "function") {
        return db.query(...args);
    }

    if (db.pool && typeof db.pool.query === "function") {
        return db.pool.query(...args);
    }

    throw new Error("Database query method is not available.");
};

const SELECT_SQL = `
    SELECT
        rm.id,

        rm.client_id,
        cl.client_name,

        rm.customer_id,
        cu.customer_name,

        rm.site_id,
        s.site_name AS customer_site_name,

        rm.location_id,
        l.location_name,

        rm.product_id,
        p.product_code,
        p.product_name,

        rm.rate,

        rm.created_at,
        rm.updated_at

    FROM public.rate_matrices rm

    LEFT JOIN public.clients cl
        ON cl.id = rm.client_id

    LEFT JOIN public.customers cu
        ON cu.id = rm.customer_id

    LEFT JOIN public.sites s
        ON s.id = rm.site_id

    LEFT JOIN public.locations l
        ON l.id = rm.location_id

    LEFT JOIN public.products p
        ON p.id = rm.product_id
`;

async function list({ page = 1, limit = 10, search = "" }) {
    const params = [];
    let where = "";

    if (search.trim()) {
        params.push(`%${search.trim()}%`);
        const index = params.length;

        where = `
            WHERE
                cl.client_name ILIKE $${index}
                OR cu.customer_name ILIKE $${index}
                OR s.site_name ILIKE $${index}
                OR l.location_name ILIKE $${index}
                OR p.product_name ILIKE $${index}
                OR p.product_code ILIKE $${index}
        `;
    }

    const countResult = await query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM public.rate_matrices rm
         LEFT JOIN public.clients cl ON cl.id = rm.client_id
         LEFT JOIN public.customers cu ON cu.id = rm.customer_id
         LEFT JOIN public.sites s ON s.id = rm.site_id
         LEFT JOIN public.locations l ON l.id = rm.location_id
         LEFT JOIN public.products p ON p.id = rm.product_id
         ${where}`,
        params
    );

    const total = Number(countResult.rows[0]?.total ?? 0);

    const rowsResult = await query(
        `${SELECT_SQL}
         ${where}
         ORDER BY rm.id DESC
         LIMIT $${params.length + 1}
         OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
    );

    return {
        rows: rowsResult.rows,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

async function getById(id) {
    const result = await query(
        `${SELECT_SQL}
         WHERE rm.id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

const fields = [
    "client_id",
    "customer_id",
    "site_id",
    "location_id",
    "product_id",
    "rate",
];

function valuesFrom(input) {
    return fields.map((field) => input[field]);
}

async function create(input) {
    const values = valuesFrom(input);

    const result = await query(
        `INSERT INTO public.rate_matrices (
            ${fields.join(", ")}
        )
        VALUES (
            ${values.map((_, index) => `$${index + 1}`).join(", ")}
        )
        RETURNING id`,
        values
    );

    return getById(result.rows[0].id);
}

async function update(id, input) {
    const values = valuesFrom(input);

    const assignments = fields
        .map((field, index) => `${field} = $${index + 1}`)
        .join(", ");

    const result = await query(
        `UPDATE public.rate_matrices
         SET ${assignments},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length + 1}
         RETURNING id`,
        [...values, id]
    );

    if (!result.rows.length) {
        return null;
    }

    return getById(id);
}

async function remove(id) {
    const result = await query(
        `DELETE FROM public.rate_matrices
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    return result.rowCount > 0;
}

module.exports = {
    list,
    getById,
    create,
    update,
    remove,
};