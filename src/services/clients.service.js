const db = require("../config/db");

const query = (...args) => {
    if (typeof db.query === "function") {
        return db.query(...args);
    }

    if (db.pool && typeof db.pool.query === "function") {
        return db.pool.query(...args);
    }

    throw new Error("PostgreSQL query method was not found in db.js.");
};


const COLUMNS = `
    id,
    client_code,
    client_name,
    client_phone,
    client_email,
    address_line1,
    address_line2,
    country,
    state,
    city,
    pin_code,
    location_name,
    location_mode,
    location_address,
    location_latitude,
    location_longitude,
    location_map_url,
    vehicle_tracking_reference,
    client_addition_date,
    client_gstin,
    contact_person,
    client_status,
    credit_days,
    under_employee_id,
    delivery_challan_provided,
    gst_document_path,
    pan_number,
    pan_document_path,
    aadhaar_number,
    aadhaar_document_path,
    dealer_registration_number,
    dealer_registration_document_path,
    visiting_card_front,
    visiting_card_back_path AS visiting_card_back,
    created_at,
    updated_at
`;



const FILE_FIELDS = [
    "gst_document_path",
    "pan_document_path",
    "aadhaar_document_path",
    "dealer_registration_document_path",
    "visiting_card_front",
    "visiting_card_back_path",
];


const ALLOWED_STATUSES = ["Active", "Hold", "Close"];
const ALLOWED_LOCATION_MODES = [
    "na",
    "manual",
    "map_link",
    "gps",
    "vehicle_tracking",
];

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function valueOrNull(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const valueTrimmed = value.trim();
        return valueTrimmed || null;
    }

    return value;
}

function normalize(body) {
    const status = valueOrNull(body.client_status) || "Active";
    const locationMode =
        valueOrNull(body.location_mode) || "manual";

    if (!ALLOWED_STATUSES.includes(status)) {
        throw createError("Invalid client status.");
    }

    if (!ALLOWED_LOCATION_MODES.includes(locationMode)) {
        throw createError("Invalid location mode.");
    }

    const phone = valueOrNull(body.client_phone);
    const email = valueOrNull(body.client_email);

    if (phone && !/^\d{10}$/.test(phone)) {
        throw createError("Client phone must contain 10 digits.");
    }

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        throw createError("Enter a valid email address.");
    }

    const creditDays =
        body.credit_days === "" ||
            body.credit_days === undefined ||
            body.credit_days === null
            ? 0
            : Number(body.credit_days);

    if (
        !Number.isInteger(creditDays) ||
        creditDays < 0 ||
        creditDays > 3650
    ) {
        throw createError(
            "Credit days must be between 0 and 3650."
        );
    }

    const latitude = valueOrNull(body.location_latitude);
    const longitude = valueOrNull(body.location_longitude);

    if ((latitude === null) !== (longitude === null)) {
        throw createError(
            "Latitude and longitude must be provided together."
        );
    }

    if (
        latitude !== null &&
        (!Number.isFinite(Number(latitude)) ||
            Number(latitude) < -90 ||
            Number(latitude) > 90)
    ) {
        throw createError("Invalid latitude.");
    }

    if (
        longitude !== null &&
        (!Number.isFinite(Number(longitude)) ||
            Number(longitude) < -180 ||
            Number(longitude) > 180)
    ) {
        throw createError("Invalid longitude.");
    }

    const employeeId = valueOrNull(body.under_employee_id);

    if (
        employeeId !== null &&
        (!Number.isInteger(Number(employeeId)) ||
            Number(employeeId) < 1)
    ) {
        throw createError("Invalid employee ID.");
    }

    return {
        client_code: valueOrNull(body.client_code),
        client_name: valueOrNull(body.client_name),
        client_phone: phone,
        client_email: email,
        address_line1: valueOrNull(body.address_line1),
        address_line2: valueOrNull(body.address_line2),
        country: valueOrNull(body.country) || "India",
        state: valueOrNull(body.state),
        city: valueOrNull(body.city),
        pin_code: valueOrNull(body.pin_code),
        location_name: valueOrNull(body.location_name),
        location_mode: locationMode,
        location_address: valueOrNull(body.location_address),
        location_latitude:
            latitude === null ? null : Number(latitude),
        location_longitude:
            longitude === null ? null : Number(longitude),
        location_map_url: valueOrNull(body.location_map_url),
        vehicle_tracking_reference:
            valueOrNull(body.vehicle_tracking_reference),
        client_addition_date:
            valueOrNull(body.client_addition_date),
        client_gstin: valueOrNull(body.client_gstin),
        contact_person: valueOrNull(body.contact_person),
        client_status: status,
        credit_days: creditDays,
        under_employee_id:
            employeeId === null ? null : Number(employeeId),
        delivery_challan_provided:
            body.delivery_challan_provided === true ||
            body.delivery_challan_provided === "true",
        gst_document_path: valueOrNull(body.gst_document_path),
        pan_number: valueOrNull(body.pan_number),
        pan_document_path: valueOrNull(body.pan_document_path),
        aadhaar_number: valueOrNull(body.aadhaar_number),
        aadhaar_document_path:
            valueOrNull(body.aadhaar_document_path),
        dealer_registration_number:
            valueOrNull(body.dealer_registration_number),
        dealer_registration_document_path:
            valueOrNull(body.dealer_registration_document_path),
        visiting_card_front: valueOrNull(
            body.visiting_card_front
        ),

        visiting_card_back_path: valueOrNull(
            body.visiting_card_back_path ?? body.visiting_card_back
        ),
    };
}

function validateRequired(data) {
    const required = [
        ["client_name", "Client name"],
        ["client_phone", "Client phone"],
        ["client_email", "Client email"],
        ["address_line1", "Address line 1"],
        ["country", "Country"],
        ["state", "State"],
        ["city", "City"],
        ["pin_code", "Pin code"],
        ["client_addition_date", "Client addition date"],
        ["client_gstin", "GSTIN"],
        ["contact_person", "Contact person"],
    ];

    for (const [key, label] of required) {
        if (!data[key]) {
            throw createError(`${label} is required.`);
        }
    }

    if (!/^[A-Z0-9]{15}$/i.test(data.client_gstin)) {
        throw createError("GSTIN must contain 15 alphanumeric characters.");
    }

    if (!/^\d{10}$/.test(data.pan_number || "")) {
        // PAN is validated separately below using its proper format.
        if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(data.pan_number || "")) {
            throw createError("Enter a valid PAN number.");
        }
    }

    if (!/^\d{12}$/.test(data.aadhaar_number || "")) {
        throw createError("Aadhaar number must contain 12 digits.");
    }
    if (
        !data.gst_document_path ||
        !data.pan_document_path ||
        !data.aadhaar_document_path ||
        !data.dealer_registration_document_path ||
        !data.visiting_card_front ||
        !data.visiting_card_back_path
    ) {
        throw createError(
            "GST, PAN, Aadhaar, dealer registration, visiting card front, and visiting card back files are required."
        );
    }
}

async function list({
    page = 1,
    limit = 10,
    search = "",
    status = "All",
}) {
    const currentPage = Math.max(
        1,
        Number.parseInt(page, 10) || 1
    );
    const pageSize = Math.min(
        100,
        Math.max(1, Number.parseInt(limit, 10) || 10)
    );

    const values = [];
    const filters = [];

    if (String(search).trim()) {
        values.push(`%${String(search).trim()}%`);
        const n = values.length;

        filters.push(`(
            client_name ILIKE $${n}
            OR client_code ILIKE $${n}
            OR client_phone ILIKE $${n}
            OR client_email ILIKE $${n}
            OR location_name ILIKE $${n}
            OR contact_person ILIKE $${n}
        )`);
    }

    if (status && status !== "All") {
        values.push(status);
        filters.push(`client_status = $${values.length}`);
    }

    const where = filters.length
        ? `WHERE ${filters.join(" AND ")}`
        : "";

    const countResult = await query(
        `SELECT COUNT(*)::int AS total
         FROM public.clients ${where}`,
        values
    );

    const total = countResult.rows[0].total;
    const offset = (currentPage - 1) * pageSize;

    const result = await query(
        `SELECT ${COLUMNS}
         FROM public.clients
         ${where}
         ORDER BY id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        [...values, pageSize, offset]
    );

    return {
        rows: result.rows,
        pagination: {
            page: currentPage,
            limit: pageSize,
            total,
            totalPages: Math.max(
                1,
                Math.ceil(total / pageSize)
            ),
        },
    };
}

async function getById(id) {
    const result = await query(
        `SELECT ${COLUMNS}
         FROM public.clients
         WHERE id = $1`,
        [Number(id)]
    );

    return result.rows[0] || null;
}

async function create(body) {
    const data = normalize(body);
    validateRequired(data);

    const clientCode = data.client_code;
    delete data.client_code;

    const columns = Object.keys(data);
    const values = columns.map((key) => data[key]);
    const placeholders = values.map(
        (_, index) => `$${index + 1}`
    );

    const result = await query(
        `INSERT INTO public.clients (${columns.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING ${COLUMNS}`,
        values
    );

    let client = result.rows[0];

    if (!client.client_code) {
        const generatedCode =
            `CLI-${String(client.id).padStart(5, "0")}`;

        const updated = await query(
            `UPDATE public.clients
             SET client_code = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING ${COLUMNS}`,
            [generatedCode, client.id]
        );

        client = updated.rows[0];
    }

    if (clientCode && clientCode !== client.client_code) {
        const updated = await query(
            `UPDATE public.clients
             SET client_code = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING ${COLUMNS}`,
            [clientCode, client.id]
        );

        client = updated.rows[0];
    }

    return client;
}

async function update(id, body) {
    const current = await getById(id);

    if (!current) {
        return null;
    }

    const data = normalize(body);

    // Preserve existing files when no replacement is uploaded.

    // Preserve existing files when no replacement is uploaded.
    // visiting_card_back is the alias returned by COLUMNS.
    const existingFiles = {
        gst_document_path: current.gst_document_path,
        pan_document_path: current.pan_document_path,
        aadhaar_document_path: current.aadhaar_document_path,
        dealer_registration_document_path:
            current.dealer_registration_document_path,
        visiting_card_front: current.visiting_card_front,
        visiting_card_back_path:
            current.visiting_card_back_path ??
            current.visiting_card_back,
    };

    for (const key of FILE_FIELDS) {
        if (!data[key]) {
            data[key] = existingFiles[key] ?? null;
        }
    }


    // Preserve the existing client code when omitted.
    // Preserve the existing client code when omitted.
    if (data.client_code === null) {
        data.client_code = current.client_code;
    }

    validateRequired(data);

    const columns = Object.keys(data);
    const values = columns.map((key) => data[key]);

    const sets = columns.map(
        (key, index) => `${key} = $${index + 1}`
    );

    values.push(Number(id));

    const result = await query(
        `UPDATE public.clients
         SET ${sets.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING ${COLUMNS}`,
        values
    );

    return result.rows[0] || null;
}

async function updateStatus(id, status) {
    if (!ALLOWED_STATUSES.includes(status)) {
        throw createError(
            "Status must be Active, Hold, or Close."
        );
    }

    const result = await query(
        `UPDATE public.clients
         SET client_status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING ${COLUMNS}`,
        [status, Number(id)]
    );

    return result.rows[0] || null;
}

async function remove(id) {
    const result = await query(
        `DELETE FROM public.clients
         WHERE id = $1
         RETURNING id`,
        [Number(id)]
    );

    return result.rowCount > 0;
}

module.exports = {
    list,
    getById,
    create,
    update,
    updateStatus,
    remove,
};