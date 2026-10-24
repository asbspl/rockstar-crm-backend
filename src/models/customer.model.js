
const db = require("../config/db");

const query = (...args) => {
    if (typeof db.query === "function") {
        return db.query(...args);
    }

    if (db.pool && typeof db.pool.query === "function") {
        return db.pool.query(...args);
    }

    throw new Error(
        "PostgreSQL query method was not found in db.js."
    );
};

/**
 * Fields allowed to be inserted or updated in public.customers.
 * These names must match the database column names.
 */
const CUSTOMER_FIELDS = [
    "customer_name",
    "client_id",
    "location_id",
    "phone",
    "email",
    "address_line1",
    "address_line2",
    "country",
    "state",
    "city",
    "pin_code",
    "contact_person",
    "status",
    "under_employee_id",

    // Location and Google Maps fields
    "location_name",
    "location_mode",
    "location_address",
    "location_latitude",
    "location_longitude",
    "location_map_url",
    "vehicle_tracking_reference",

    // Uploaded file fields
    "visiting_card_front",
    "visiting_card_back",
    "shop_front",
    "shop_back",
];

/**
 * Convert empty strings to null for nullable integer columns.
 * This prevents PostgreSQL error 22P02:
 * invalid input syntax for type integer: ""
 */
const INTEGER_FIELDS = [
    "client_id",
    "location_id",
    "under_employee_id",
];

const NUMERIC_FIELDS = [
    "location_latitude",
    "location_longitude",
];

function normalizeValue(field, value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string" && value.trim() === "") {
        return null;
    }

    if (INTEGER_FIELDS.includes(field)) {
        const number = Number(value);

        if (!Number.isInteger(number)) {
            const error = new Error(
                `${field} must be a valid integer.`
            );
            error.statusCode = 400;
            throw error;
        }

        return number;
    }

    if (NUMERIC_FIELDS.includes(field)) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            const error = new Error(
                `${field} must be a valid number.`
            );
            error.statusCode = 400;
            throw error;
        }

        return number;
    }

    return value;
}

/**
 * Normalize only recognized fields.
 */
function normalizeData(data = {}) {
    const normalized = {};

    for (const field of CUSTOMER_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
            normalized[field] = normalizeValue(
                field,
                data[field]
            );
        }
    }

    return normalized;
}

/**
 * Get customers with pagination and optional search.
 */
async function list({
    search = "",
    page = 1,
    limit = 10,
} = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(
        100,
        Math.max(1, Number.parseInt(limit, 10) || 10)
    );

    const offset = (safePage - 1) * safeLimit;
    const searchTerm = String(search ?? "").trim();

    const params = [];
    let where = "";

    if (searchTerm) {
        params.push(`%${searchTerm}%`);

        where = `
            WHERE
                customer_name ILIKE $1
                OR phone ILIKE $1
                OR email ILIKE $1
                OR city ILIKE $1
                OR state ILIKE $1
                OR contact_person ILIKE $1
        `;
    }

    const countResult = await query(
        `
            SELECT COUNT(*)::int AS total
            FROM public.customers
            ${where}
        `,
        params
    );

    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, safeLimit, offset];
    const limitPlaceholder = dataParams.length - 1;
    const offsetPlaceholder = dataParams.length;

    const result = await query(
        `
            SELECT *
            FROM public.customers
            ${where}
            ORDER BY id DESC
            LIMIT $${limitPlaceholder}
            OFFSET $${offsetPlaceholder}
        `,
        dataParams
    );

    return {
        rows: result.rows,
        total,
    };
}

/**
 * Get one customer by ID.
 */
async function getById(id) {
    const customerId = normalizeValue("location_id", id);

    if (customerId === null || customerId <= 0) {
        const error = new Error("A valid customer ID is required.");
        error.statusCode = 400;
        throw error;
    }

    const result = await query(
        `
            SELECT *
            FROM public.customers
            WHERE id = $1
            LIMIT 1
        `,
        [customerId]
    );

    return result.rows[0] ?? null;
}

/**
 * Create a customer.
 */
async function create(data = {}) {
    const normalizedData = normalizeData(data);

    const fields = CUSTOMER_FIELDS.filter(
        (field) =>
            Object.prototype.hasOwnProperty.call(
                normalizedData,
                field
            )
    );

    if (fields.length === 0) {
        const error = new Error(
            "No valid customer fields were provided."
        );
        error.statusCode = 400;
        throw error;
    }

    const values = fields.map(
        (field) => normalizedData[field]
    );

    const columns = fields
        .map((field) => `"${field}"`)
        .join(", ");

    const placeholders = fields
        .map((_, index) => `$${index + 1}`)
        .join(", ");

    const result = await query(
        `
            INSERT INTO public.customers (${columns})
            VALUES (${placeholders})
            RETURNING *
        `,
        values
    );

    return result.rows[0];
}

/**
 * Update a customer.
 * Fields not provided are left unchanged.
 */
async function update(id, data = {}) {
    const customerId = normalizeValue("location_id", id);

    if (customerId === null || customerId <= 0) {
        const error = new Error("A valid customer ID is required.");
        error.statusCode = 400;
        throw error;
    }

    const normalizedData = normalizeData(data);

    const fields = CUSTOMER_FIELDS.filter(
        (field) =>
            Object.prototype.hasOwnProperty.call(
                normalizedData,
                field
            )
    );

    if (fields.length === 0) {
        return getById(customerId);
    }

    const values = fields.map(
        (field) => normalizedData[field]
    );

    const assignments = fields
        .map(
            (field, index) =>
                `"${field}" = $${index + 1}`
        )
        .join(", ");

    values.push(customerId);

    const result = await query(
        `
            UPDATE public.customers
            SET
                ${assignments},
                updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *
        `,
        values
    );

    return result.rows[0] ?? null;
}

/**
 * Delete a customer.
 */
async function remove(id) {
    const customerId = normalizeValue("location_id", id);

    if (customerId === null || customerId <= 0) {
        const error = new Error("A valid customer ID is required.");
        error.statusCode = 400;
        throw error;
    }

    const result = await query(
        `
            DELETE FROM public.customers
            WHERE id = $1
            RETURNING *
        `,
        [customerId]
    );

    return result.rows[0] ?? null;
}

module.exports = {
    list,
    getById,
    create,
    update,
    remove,
};
