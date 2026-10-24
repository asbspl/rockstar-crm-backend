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

const CUSTOMER_TABLE = "public.customers";
const LOCATION_TABLE = "public.locations";

/**
 * Read the available columns from a database table.
 * This lets the model support common customer/location name columns.
 */
async function getColumnNames(tableName) {
    const result = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = split_part($1, '.', 1)
           AND table_name = split_part($1, '.', 2)`,
        [tableName]
    );

    return new Set(result.rows.map((row) => row.column_name));
}

function quoteIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function firstColumn(columns, choices, fallback) {
    return choices.find((name) => columns.has(name)) || fallback;
}

async function lookupConfig(tableName, choices) {
    const columns = await getColumnNames(tableName);

    if (!columns.size || !columns.has("id")) {
        throw new Error(
            `Required lookup table ${tableName} or its id column was not found.`
        );
    }

    return firstColumn(columns, choices, "id");
}

/**
 * Return customer and registered location dropdown data.
 */
async function listLookups() {
    const [
        customerNameColumn,
        locationNameColumn,
    ] = await Promise.all([
        lookupConfig(CUSTOMER_TABLE, [
            "customer_name",
            "name",
            "customer",
            "company_name",
        ]),
        lookupConfig(LOCATION_TABLE, [
            "location_name",
            "name",
            "location",
            "city",
        ]),
    ]);

    const [customers, locations] = await Promise.all([
        query(
            `SELECT id,
                    ${quoteIdentifier(customerNameColumn)} AS name
             FROM ${CUSTOMER_TABLE}
             ORDER BY name ASC
             LIMIT 5000`
        ),
        query(
            `SELECT id,
                    ${quoteIdentifier(locationNameColumn)} AS name
             FROM ${LOCATION_TABLE}
             ORDER BY name ASC
             LIMIT 5000`
        ),
    ]);

    return {
        customers: customers.rows,
        locations: locations.rows,
    };
}

/**
 * Common SELECT fields used by the list and detail endpoints.
 * All Site Location fields are included here.
 */
function getSiteSelect(customerNameColumn, locationNameColumn) {
    return `
        SELECT
            s.id,
            s.site_name,

            s.customer_id,
            c.display_name AS customer_name,

            s.location_id,
            l.display_name AS location_name,

            s.contact_person,
            s.contact_number,

            s.line_1,
            s.line_2,
            s.country,
            s.state,
            s.city,
            s.pin_code,

            s.site_location_mode,
            s.site_location_name,
            s.site_location_address,
            s.site_location_latitude,
            s.site_location_longitude,
            s.site_location_map_url,
            s.vehicle_tracking_reference,

            s.created_at,
            s.updated_at
    `;
}

/**
 * List sites with pagination and search.
 */
async function list({ page = 1, limit = 10, search = "" }) {
    const offset = (page - 1) * limit;

    const where = search
        ? `WHERE
                s.site_name ILIKE $1
                OR c.display_name ILIKE $1
                OR l.display_name ILIKE $1
                OR s.city ILIKE $1
                OR s.state ILIKE $1`
        : "";

    const params = search ? [`%${search}%`] : [];

    const [
        customerNameColumn,
        locationNameColumn,
    ] = await Promise.all([
        lookupConfig(CUSTOMER_TABLE, [
            "customer_name",
            "name",
            "customer",
            "company_name",
        ]),
        lookupConfig(LOCATION_TABLE, [
            "location_name",
            "name",
            "location",
            "city",
        ]),
    ]);

    const from = `
        FROM public.sites s

        LEFT JOIN (
            SELECT
                id,
                ${quoteIdentifier(customerNameColumn)} AS display_name
            FROM ${CUSTOMER_TABLE}
        ) c ON c.id = s.customer_id

        LEFT JOIN (
            SELECT
                id,
                ${quoteIdentifier(locationNameColumn)} AS display_name
            FROM ${LOCATION_TABLE}
        ) l ON l.id = s.location_id
    `;

    const countResult = await query(
        `SELECT COUNT(*)::int AS total
         ${from}
         ${where}`,
        params
    );

    const select = getSiteSelect(
        customerNameColumn,
        locationNameColumn
    );

    const rowsResult = await query(
        `${select}
         ${from}
         ${where}
         ORDER BY s.id DESC
         LIMIT $${params.length + 1}
         OFFSET $${params.length + 2}`,
        [...params, limit, offset]
    );

    const total = countResult.rows[0]?.total ?? 0;

    return {
        rows: rowsResult.rows,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

/**
 * Get one site with its customer, registered location,
 * and complete Site Location information.
 */
async function getById(id) {
    const [
        customerNameColumn,
        locationNameColumn,
    ] = await Promise.all([
        lookupConfig(CUSTOMER_TABLE, [
            "customer_name",
            "name",
            "customer",
            "company_name",
        ]),
        lookupConfig(LOCATION_TABLE, [
            "location_name",
            "name",
            "location",
            "city",
        ]),
    ]);

    const select = getSiteSelect(
        customerNameColumn,
        locationNameColumn
    );

    const result = await query(
        `${select}

         FROM public.sites s

         LEFT JOIN (
             SELECT
                 id,
                 ${quoteIdentifier(customerNameColumn)} AS display_name
             FROM ${CUSTOMER_TABLE}
         ) c ON c.id = s.customer_id

         LEFT JOIN (
             SELECT
                 id,
                 ${quoteIdentifier(locationNameColumn)} AS display_name
             FROM ${LOCATION_TABLE}
         ) l ON l.id = s.location_id

         WHERE s.id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

/**
 * Check that a selected customer or registered location exists.
 */
async function assertLookupExists(tableName, id, label) {
    const result = await query(
        `SELECT id
         FROM ${tableName}
         WHERE id = $1
         LIMIT 1`,
        [id]
    );

    if (!result.rows.length) {
        const error = new Error(
            `Selected ${label} does not exist.`
        );

        error.status = 400;
        throw error;
    }
}

async function validateLookups(input) {
    await assertLookupExists(
        CUSTOMER_TABLE,
        input.customer_id,
        "customer"
    );

    // A registered location can be empty if the frontend is configured
    // to allow a site without a registered location.
    if (input.location_id != null) {
        await assertLookupExists(
            LOCATION_TABLE,
            input.location_id,
            "location"
        );
    }
}

/**
 * These are the database columns that can be created or updated.
 *
 * The customer_name and location_name display fields are not written
 * directly; they are obtained from their related tables.
 */
const writableFields = [
    "site_name",
    "customer_id",
    "location_id",
    "contact_person",
    "contact_number",
    "line_1",
    "line_2",
    "country",
    "state",
    "city",
    "pin_code",

    // Site Location
    "site_location_mode",
    "site_location_name",
    "site_location_address",
    "site_location_latitude",
    "site_location_longitude",
    "site_location_map_url",
    "vehicle_tracking_reference",
];

function valuesFrom(input) {
    return writableFields.map((field) => {
        return input[field] ?? null;
    });
}

/**
 * Create a site and return the complete saved record.
 */
async function create(input) {
    await validateLookups(input);

    const values = valuesFrom(input);

    const result = await query(
        `INSERT INTO public.sites (
            ${writableFields.join(", ")}
        )
        VALUES (
            ${values.map((_, index) => `$${index + 1}`).join(", ")}
        )
        RETURNING id`,
        values
    );

    return getById(result.rows[0].id);
}

/**
 * Update all editable fields and return the complete updated record.
 */
async function update(id, input) {
    await validateLookups(input);

    const values = valuesFrom(input);

    const assignments = writableFields
        .map((field, index) => {
            return `${field} = $${index + 1}`;
        })
        .join(", ");

    const result = await query(
        `UPDATE public.sites
         SET ${assignments},
             updated_at = NOW()
         WHERE id = $${values.length + 1}
         RETURNING id`,
        [...values, id]
    );

    if (!result.rows.length) {
        return null;
    }

    // Fetch the complete record after the update.
    return getById(id);
}

/**
 * Delete a site.
 */
async function remove(id) {
    const result = await query(
        `DELETE FROM public.sites
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    return result.rowCount > 0;
}

module.exports = {
    list,
    getById,
    listLookups,
    create,
    update,
    remove,
};