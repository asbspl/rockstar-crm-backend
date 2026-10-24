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

const PRODUCT_COLUMNS = `
    id,
    product_code,
    product_name,
    unit,
    product_description,
    hsn_code,
    standard_rate,
    status,
    product_image,
    created_at,
    updated_at
`;

async function list({
    page = 1,
    limit = 10,
    search = "",
    status = "All",
}) {
    const conditions = [];
    const params = [];

    if (search.trim()) {
        params.push(`%${search.trim()}%`);
        const index = params.length;

        conditions.push(`
            (
                product_code ILIKE $${index}
                OR product_name ILIKE $${index}
                OR unit ILIKE $${index}
                OR hsn_code ILIKE $${index}
                OR product_description ILIKE $${index}
            )
        `);
    }

    if (status && status !== "All") {
        params.push(status);
        conditions.push(
            `LOWER(status) = LOWER($${params.length})`
        );
    }

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countResult = await query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM public.products
         ${whereClause}`,
        params
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const offset = (page - 1) * limit;

    const rowsResult = await query(
        `SELECT ${PRODUCT_COLUMNS}
         FROM public.products
         ${whereClause}
         ORDER BY id DESC
         LIMIT $${params.length + 1}
         OFFSET $${params.length + 2}`,
        [...params, limit, offset]
    );

    return {
        rows: rowsResult.rows,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

async function getById(id) {
    const result = await query(
        `SELECT ${PRODUCT_COLUMNS}
         FROM public.products
         WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

async function create(input) {
    const result = await query(
        `INSERT INTO public.products (
            product_code,
            product_name,
            unit,
            product_description,
            hsn_code,
            standard_rate,
            product_image,
            status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')
        RETURNING ${PRODUCT_COLUMNS}`,
        [
            input.product_code,
            input.product_name,
            input.unit,
            input.product_description,
            input.hsn_code,
            input.standard_rate,
            input.product_image,
        ]
    );

    return result.rows[0];
}

async function update(id, input) {
    const result = await query(
        `UPDATE public.products
         SET
            product_code = $1,
            product_name = $2,
            unit = $3,
            product_description = $4,
            hsn_code = $5,
            standard_rate = $6,
            product_image = COALESCE($7, product_image),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING ${PRODUCT_COLUMNS}`,
        [
            input.product_code,
            input.product_name,
            input.unit,
            input.product_description,
            input.hsn_code,
            input.standard_rate,
            input.product_image,
            id,
        ]
    );

    return result.rows[0] || null;
}

async function updateStatus(id, status) {
    const result = await query(
        `UPDATE public.products
         SET
            status = $1,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${PRODUCT_COLUMNS}`,
        [status, id]
    );

    return result.rows[0] || null;
}

async function remove(id) {
    const result = await query(
        `DELETE FROM public.products
         WHERE id = $1
         RETURNING ${PRODUCT_COLUMNS}`,
        [id]
    );

    return result.rows[0] || null;
}

module.exports = {
    list,
    getById,
    create,
    update,
    updateStatus,
    remove,
};