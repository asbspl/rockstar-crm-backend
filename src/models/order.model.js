
const db = require("../config/db");

function getPool() {
    if (typeof db.connect === "function" && typeof db.query === "function") return db;
    if (db.pool && typeof db.pool.connect === "function") return db.pool;
    throw new Error("Database pool is not available from ../config/db.");
}

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function positiveId(value, label, optional = false) {
    if ((value === null || value === undefined || value === "") && optional) return null;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw createError(`${label} must be a valid ID.`);
    return id;
}

function numberValue(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw createError(`${label} must be between ${min} and ${max}.`);
    }
    return Math.round(number * 100) / 100;
}

function dateValue(value, label) {
    if (!value || Number.isNaN(Date.parse(value))) {
        throw createError(`${label} is required and must be a valid date.`);
    }
    return String(value).slice(0, 10);
}

function textValue(value, label, maxLength = 5000, required = false) {
    const text = String(value ?? "").trim();
    if (required && !text) throw createError(`${label} is required.`);
    if (text.length > maxLength) {
        throw createError(`${label} cannot exceed ${maxLength} characters.`);
    }
    return text;
}

function parseItems(value) {
    let items = value;

    if (typeof items === "string") {
        try {
            items = JSON.parse(items);
        } catch {
            throw createError("Order items must be valid JSON.");
        }
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw createError("Add at least one order product.");
    }

    return items.map((item, index) => ({
        product_id: positiveId(item.product_id, `Product on line ${index + 1}`),
        product_name: textValue(item.product_name, `Product name on line ${index + 1}`, 250, true),
        unit: textValue(item.unit || "Nos", `Unit on line ${index + 1}`, 40, true),
        quantity: numberValue(item.quantity, `Quantity on line ${index + 1}`, {
            min: 0.0001,
            max: 100000000,
        }),
        // The client-provided rate is not trusted.
        // It is replaced with the matching Rate Matrix rate below.
        rate_incl_gst: numberValue(item.rate_incl_gst, `Rate on line ${index + 1}`, {
            min: 0,
            max: 100000000,
        }),
        discount: numberValue(item.discount ?? 0, `Discount on line ${index + 1}`, {
            min: 0,
            max: 100000000,
        }),
    }));
}

function filePath(files, name, oldValue) {
    const file = files?.[name]?.[0];
    return file ? `/uploads/orders/${file.filename}` : (oldValue || null);
}

async function resolveSite(client, input) {
    const siteId = input.site_id ? positiveId(input.site_id, "Customer Site") : null;
    const customerId = positiveId(input.customer_id, "Customer", true);
    const siteName = textValue(input.customer_site_name, "Customer Site", 250, true);

    if (siteId) {
        const result = await client.query(
            `SELECT id, site_name, customer_id, location_id
             FROM public.sites
             WHERE id = $1 AND customer_id = $2
             LIMIT 1`,
            [siteId, customerId]
        );

        if (!result.rows[0]) {
            throw createError("The selected site does not belong to the selected customer.");
        }

        return result.rows[0];
    }

    if (!customerId) {
        throw createError("Customer is required before selecting a customer site.");
    }

    const result = await client.query(
        `SELECT id, site_name, customer_id, location_id
         FROM public.sites
         WHERE customer_id = $1
           AND lower(trim(site_name)) = lower(trim($2))
         ORDER BY id
         LIMIT 1`,
        [customerId, siteName]
    );

    if (!result.rows[0]) {
        throw createError(
            "Customer Site was not found for the selected customer. Check the site name or send site_id from the frontend."
        );
    }

    return result.rows[0];
}

async function resolveMatrixRates(
    client,
    { client_id, customer_id, site_id, location_id, items }
) {
    for (const item of items) {
        const result = await client.query(
            `SELECT rate
             FROM public.rate_matrices
             WHERE client_id = $1
               AND customer_id = $2
               AND product_id = $3
               AND (site_id = $4 OR site_id IS NULL)
               AND (location_id = $5 OR location_id IS NULL)
             ORDER BY
                 CASE WHEN site_id = $4 THEN 0 ELSE 1 END,
                 CASE WHEN location_id = $5 THEN 0 ELSE 1 END,
                 id DESC
             LIMIT 1`,
            [
                client_id,
                customer_id,
                item.product_id,
                site_id,
                location_id,
            ]
        );

        if (result.rows[0]) {
            const expectedRate = numberValue(
                result.rows[0].rate,
                `Allocated rate for ${item.product_name}`,
                { min: 0, max: 100000000 }
            );

            item.rate_incl_gst = expectedRate;
        }

        if (item.discount > item.quantity * item.rate_incl_gst) {
            throw createError(
                `Discount for ${item.product_name} cannot exceed its line amount.`
            );
        }
    }

    return items;
}

async function calculateTotals(items) {
    const subtotal = items.reduce(
        (sum, item) => sum + item.quantity * item.rate_incl_gst,
        0
    );

    const total_discount = items.reduce(
        (sum, item) => sum + item.discount,
        0
    );

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        total_discount: Math.round(total_discount * 100) / 100,
        grand_total: Math.round((subtotal - total_discount) * 100) / 100,
    };
}

/*
|--------------------------------------------------------------------------
| GET ONE ORDER WITH CLIENT DETAILS
|--------------------------------------------------------------------------
| Added client Delivery Challan fields:
| - delivery_challan_provided
| - client_gstin
| - client_phone
| - client_email
| - client_logo
| - client address fields
|
| These fields are read from the selected client in the clients table.
|--------------------------------------------------------------------------
*/

async function getOrderWithClient(client, id) {
    const orderResult = await client.query(
        `SELECT
            o.*,

            co.company_name,
            cl.client_name,
            cu.customer_name,
            lo.location_name,

            /* CLIENT DELIVERY CHALLAN SETTINGS */
            COALESCE(
                to_jsonb(cl)->>'delivery_challan_provided',
                'false'
            ) AS delivery_challan_provided,

            /* CLIENT CONTACT DETAILS */
            COALESCE(
                to_jsonb(cl)->>'client_phone',
                to_jsonb(cl)->>'phone',
                to_jsonb(cl)->>'contact_number',
                to_jsonb(cl)->>'mobile',
                ''
            ) AS client_phone,

            COALESCE(
                to_jsonb(cl)->>'email',
                to_jsonb(cl)->>'client_email',
                ''
            ) AS client_email,

            COALESCE(
                to_jsonb(cl)->>'client_gstin',
                to_jsonb(cl)->>'gstin',
                to_jsonb(cl)->>'gst_number',
                ''
            ) AS client_gstin,

            COALESCE(
                to_jsonb(cl)->>'client_logo',
                to_jsonb(cl)->>'logo',
                to_jsonb(cl)->>'logo_url',
                ''
            ) AS client_logo,

            /* CLIENT ADDRESS DETAILS */
            COALESCE(
                to_jsonb(cl)->>'address_line1',
                to_jsonb(cl)->>'address_line_1',
                ''
            ) AS client_address_line1,

            COALESCE(
                to_jsonb(cl)->>'address_line2',
                to_jsonb(cl)->>'address_line_2',
                ''
            ) AS client_address_line2,

            COALESCE(to_jsonb(cl)->>'city', '') AS client_city,
            COALESCE(to_jsonb(cl)->>'state', '') AS client_state,

            COALESCE(
                to_jsonb(cl)->>'pin_code',
                to_jsonb(cl)->>'pincode',
                to_jsonb(cl)->>'postal_code',
                ''
            ) AS client_pin_code,

            COALESCE(to_jsonb(cl)->>'country', '') AS client_country,

            /* COMPANY DETAILS */
            COALESCE(
                to_jsonb(co)->>'address',
                to_jsonb(co)->>'address_line_1',
                to_jsonb(co)->>'registered_address',
                ''
            ) AS company_address,

            COALESCE(
                to_jsonb(co)->>'gstin',
                to_jsonb(co)->>'gst_number',
                ''
            ) AS company_gstin,

            COALESCE(
                to_jsonb(co)->>'phone',
                to_jsonb(co)->>'contact_number',
                to_jsonb(co)->>'mobile',
                ''
            ) AS company_contact,

            COALESCE(to_jsonb(co)->>'email', '') AS company_email,

            COALESCE(
                to_jsonb(co)->>'logo',
                to_jsonb(co)->>'logo_url',
                to_jsonb(co)->>'company_logo',
                ''
            ) AS company_logo,

            /* COMPANY BANK DETAILS */
            COALESCE(to_jsonb(co)->>'bank_name', '') AS bank_name,

            COALESCE(
                to_jsonb(co)->>'bank_account_name',
                ''
            ) AS bank_account_name,

            COALESCE(
                to_jsonb(co)->>'bank_account_number',
                to_jsonb(co)->>'account_number',
                ''
            ) AS bank_account_number,

            COALESCE(
                to_jsonb(co)->>'bank_ifsc',
                to_jsonb(co)->>'ifsc_code',
                ''
            ) AS bank_ifsc,

            COALESCE(
                to_jsonb(co)->>'bank_branch',
                to_jsonb(co)->>'branch_name',
                ''
            ) AS bank_branch,

            /* CUSTOMER DETAILS */
            COALESCE(
                to_jsonb(cu)->>'address',
                to_jsonb(cu)->>'address_line_1',
                ''
            ) AS customer_address,

            COALESCE(
                to_jsonb(cu)->>'gstin',
                to_jsonb(cu)->>'gst_number',
                ''
            ) AS customer_gstin,

            COALESCE(
                to_jsonb(cu)->>'phone',
                to_jsonb(cu)->>'contact_number',
                to_jsonb(cu)->>'mobile',
                ''
            ) AS customer_contact,

            COALESCE(to_jsonb(cu)->>'email', '') AS customer_email,

            /* CUSTOMER SITE DETAILS */
            COALESCE(
                to_jsonb(s)->>'site_name',
                o.customer_site_name,
                ''
            ) AS site_name,

            COALESCE(
                to_jsonb(s)->>'line_1',
                to_jsonb(s)->>'address_line_1',
                to_jsonb(s)->>'site_location_address',
                ''
            ) AS address_line_1,

            COALESCE(
                to_jsonb(s)->>'line_2',
                to_jsonb(s)->>'address_line_2',
                ''
            ) AS address_line_2,

            COALESCE(to_jsonb(s)->>'city', '') AS city,

            COALESCE(
                to_jsonb(s)->>'pin_code',
                to_jsonb(s)->>'pincode',
                to_jsonb(s)->>'postal_code',
                ''
            ) AS pin_code,

            COALESCE(to_jsonb(s)->>'state', '') AS state,
            COALESCE(to_jsonb(s)->>'country', '') AS country,

            COALESCE(
                to_jsonb(s)->>'contact_person',
                to_jsonb(s)->>'contact_name',
                ''
            ) AS site_contact_person,

            COALESCE(
                to_jsonb(s)->>'contact_number',
                to_jsonb(s)->>'phone',
                ''
            ) AS site_contact_number,

            COALESCE(
                to_jsonb(s)->>'site_location_name',
                to_jsonb(lo)->>'location_name',
                lo.location_name,
                ''
            ) AS site_location_name,

            COALESCE(
                to_jsonb(lo)->>'address',
                to_jsonb(lo)->>'location_address',
                ''
            ) AS location_address

         FROM public.orders o

         LEFT JOIN public.companies co
            ON co.id = o.company_id

         LEFT JOIN public.clients cl
            ON cl.id = o.client_id

         LEFT JOIN public.customers cu
            ON cu.id = o.customer_id

         LEFT JOIN public.locations lo
            ON lo.id = o.location_id

         LEFT JOIN public.sites s
            ON s.id = o.site_id

         WHERE o.id = $1`,
        [id]
    );

    const order = orderResult.rows[0];

    if (!order) return null;

    const itemsResult = await client.query(
        `SELECT
            oi.id,
            oi.product_id,
            oi.product_name,
            oi.unit,
            oi.quantity,
            oi.rate_incl_gst,
            oi.discount,
            oi.amount,

            COALESCE(
                to_jsonb(p)->>'product_code',
                to_jsonb(p)->>'code',
                ''
            ) AS product_code,

            COALESCE(
                to_jsonb(p)->>'hsn_sac',
                to_jsonb(p)->>'hsn_code',
                to_jsonb(p)->>'hsn',
                ''
            ) AS hsn_sac,

            COALESCE(
                to_jsonb(p)->>'description',
                to_jsonb(p)->>'product_description',
                ''
            ) AS product_description

         FROM public.order_items oi

         LEFT JOIN public.products p
            ON p.id = oi.product_id

         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [id]
    );

    order.items = itemsResult.rows.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        rate_incl_gst: Number(item.rate_incl_gst),
        discount: Number(item.discount),
        amount: Number(item.amount),
    }));

    for (const key of ["subtotal", "total_discount", "grand_total"]) {
        order[key] = Number(order[key] || 0);
    }

    return order;
}

/*
|--------------------------------------------------------------------------
| GET ALL ORDERS
|--------------------------------------------------------------------------
*/

async function getOrders({
    page = 1,
    limit = 10,
    search = "",
    status = "All",
    dispatch = "All",
}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const offset = (safePage - 1) * safeLimit;

    const params = [];
    const where = [];

    if (String(search || "").trim()) {
        params.push(`%${String(search).trim()}%`);
        const p = `$${params.length}`;

        where.push(
            `(o.pino ILIKE ${p}
              OR o.dcsno ILIKE ${p}
              OR cl.client_name ILIKE ${p}
              OR cu.customer_name ILIKE ${p}
              OR o.customer_site_name ILIKE ${p})`
        );
    }

    if (status && status !== "All") {
        params.push(status);
        where.push(`o.status = $${params.length}`);
    }

    if (dispatch && dispatch !== "All") {
        params.push(dispatch);
        where.push(`o.dispatch_status = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pool = getPool();

    const count = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.orders o
         LEFT JOIN public.clients cl ON cl.id = o.client_id
         LEFT JOIN public.customers cu ON cu.id = o.customer_id
         ${whereSql}`,
        params
    );

    params.push(safeLimit, offset);

    const rows = await pool.query(
        `SELECT
            o.*,
            co.company_name,
            cl.client_name,
            cu.customer_name,
            lo.location_name,

            /* CLIENT DELIVERY CHALLAN SETTINGS */
            COALESCE(
                to_jsonb(cl)->>'delivery_challan_provided',
                'false'
            ) AS delivery_challan_provided,

            /* CLIENT CONTACT DETAILS */
            COALESCE(
                to_jsonb(cl)->>'client_phone',
                to_jsonb(cl)->>'phone',
                to_jsonb(cl)->>'contact_number',
                to_jsonb(cl)->>'mobile',
                ''
            ) AS client_phone,

            COALESCE(
                to_jsonb(cl)->>'email',
                to_jsonb(cl)->>'client_email',
                ''
            ) AS client_email,

            COALESCE(
                to_jsonb(cl)->>'client_gstin',
                to_jsonb(cl)->>'gstin',
                to_jsonb(cl)->>'gst_number',
                ''
            ) AS client_gstin,

            COALESCE(
                to_jsonb(cl)->>'client_logo',
                to_jsonb(cl)->>'logo',
                to_jsonb(cl)->>'logo_url',
                ''
            ) AS client_logo,

            /* CLIENT ADDRESS DETAILS */
            COALESCE(
                to_jsonb(cl)->>'address_line1',
                to_jsonb(cl)->>'address_line_1',
                ''
            ) AS client_address_line1,

            COALESCE(
                to_jsonb(cl)->>'address_line2',
                to_jsonb(cl)->>'address_line_2',
                ''
            ) AS client_address_line2,

            COALESCE(to_jsonb(cl)->>'city', '') AS client_city,
            COALESCE(to_jsonb(cl)->>'state', '') AS client_state,

            COALESCE(
                to_jsonb(cl)->>'pin_code',
                to_jsonb(cl)->>'pincode',
                to_jsonb(cl)->>'postal_code',
                ''
            ) AS client_pin_code,

            COALESCE(to_jsonb(cl)->>'country', '') AS client_country,

            /* CUSTOMER SITE DETAILS */
            COALESCE(
                to_jsonb(s)->>'site_name',
                o.customer_site_name,
                ''
            ) AS site_name,

            COALESCE(
                to_jsonb(s)->>'line_1',
                to_jsonb(s)->>'address_line_1',
                ''
            ) AS address_line_1,

            COALESCE(
                to_jsonb(s)->>'line_2',
                to_jsonb(s)->>'address_line_2',
                ''
            ) AS address_line_2,

            COALESCE(to_jsonb(s)->>'city', '') AS city,

            COALESCE(
                to_jsonb(s)->>'pin_code',
                to_jsonb(s)->>'pincode',
                ''
            ) AS pin_code,

            COALESCE(to_jsonb(s)->>'state', '') AS state,
            COALESCE(to_jsonb(s)->>'country', '') AS country

         FROM public.orders o

         LEFT JOIN public.companies co
            ON co.id = o.company_id

         LEFT JOIN public.clients cl
            ON cl.id = o.client_id

         LEFT JOIN public.customers cu
            ON cu.id = o.customer_id

         LEFT JOIN public.locations lo
            ON lo.id = o.location_id

         LEFT JOIN public.sites s
            ON s.id = o.site_id

         ${whereSql}

         ORDER BY o.id DESC
         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
    );

    const data = [];

    for (const row of rows.rows) {
        const items = await pool.query(
            `SELECT
                oi.id,
                oi.product_id,
                oi.product_name,
                oi.unit,
                oi.quantity,
                oi.rate_incl_gst,
                oi.discount,
                oi.amount,

                COALESCE(
                    to_jsonb(p)->>'product_code',
                    to_jsonb(p)->>'code',
                    ''
                ) AS product_code,

                COALESCE(
                    to_jsonb(p)->>'hsn_sac',
                    to_jsonb(p)->>'hsn_code',
                    to_jsonb(p)->>'hsn',
                    ''
                ) AS hsn_sac,

                COALESCE(
                    to_jsonb(p)->>'description',
                    to_jsonb(p)->>'product_description',
                    ''
                ) AS product_description

             FROM public.order_items oi

             LEFT JOIN public.products p
                ON p.id = oi.product_id

             WHERE oi.order_id = $1
             ORDER BY oi.id`,
            [row.id]
        );

        row.items = items.rows.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            rate_incl_gst: Number(item.rate_incl_gst),
            discount: Number(item.discount),
            amount: Number(item.amount),
        }));

        for (const key of ["subtotal", "total_discount", "grand_total"]) {
            row[key] = Number(row[key] || 0);
        }

        data.push(row);
    }

    const total = Number(count.rows[0]?.total || 0);

    return {
        data,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        },
    };
}

async function getOrder(id) {
    const pool = getPool();
    return getOrderWithClient(pool, positiveId(id, "Order"));
}

async function nextPino(client, proformaDate) {
    const date = dateValue(proformaDate, "Proforma Date");
    const yearSuffix = date.slice(2, 4);

    await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`orders-pino:${date.slice(0, 4)}`]
    );

    const result = await client.query(
        `SELECT
            COALESCE(
                MAX((substring(pino from '^PI([0-9]+)[0-9]{2}$'))::BIGINT),
                0
            )::BIGINT AS last_seq
         FROM public.orders
         WHERE pino ~ '^PI[0-9]+[0-9]{2}$'`
    );

    let sequence = Number(result.rows[0]?.last_seq || 0) + 1;

    for (let attempts = 0; attempts < 10000; attempts += 1, sequence += 1) {
        const pino = `PI${String(sequence).padStart(4, "0")}${yearSuffix}`;

        const exists = await client.query(
            "SELECT 1 FROM public.orders WHERE pino = $1 LIMIT 1",
            [pino]
        );

        if (!exists.rowCount) return pino;
    }

    throw createError("Could not generate a unique Proforma Invoice Number.", 500);
}

async function saveOrder(input, files, orderId = null) {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const id = orderId == null ? null : positiveId(orderId, "Order");
        let existing = null;

        if (id) {
            const existingResult = await client.query(
                "SELECT * FROM public.orders WHERE id = $1 FOR UPDATE",
                [id]
            );

            existing = existingResult.rows[0];

            if (!existing) throw createError("Order not found.", 404);

            if (existing.status === "Cancelled") {
                throw createError("Cancelled orders cannot be edited.", 409);
            }
        }

        const company_id = positiveId(input.company_id, "Company");
        const client_id = positiveId(input.client_id, "Client");
        const customer_id = positiveId(input.customer_id, "Customer", true);
        const requestedLocationId = positiveId(input.location_id, "Location", true);

        const site = await resolveSite(client, { ...input, customer_id });

        const location_id = site.location_id
            ? Number(site.location_id)
            : requestedLocationId;

        const items = parseItems(input.items);

        await resolveMatrixRates(client, {
            client_id,
            customer_id,
            site_id: Number(site.id),
            location_id,
            items,
        });

        const totals = await calculateTotals(items);

        const proforma_date = dateValue(input.proforma_date, "Proforma Date");
        const expected_shipping_date = dateValue(
            input.expected_shipping_date,
            "Expected Shipping Date"
        );

        if (expected_shipping_date < proforma_date) {
            throw createError("Expected Shipping Date cannot be earlier than Proforma Date.");
        }

        const reference = textValue(input.reference, "Reference", 250);
        const comment = textValue(input.comment, "Comment", 5000);

        const image1 = filePath(files, "image1", existing?.image1);
        const image2 = filePath(files, "image2", existing?.image2);
        const image3 = filePath(files, "image3", existing?.image3);
        const image4 = filePath(files, "image4", existing?.image4);

        let savedId = id;
        const pino = existing?.pino || await nextPino(client, proforma_date);

        if (id) {
            await client.query(
                `UPDATE public.orders
                 SET company_id = $1,
                     client_id = $2,
                     customer_id = $3,
                     customer_site_name = $4,
                     site_id = $5,
                     location_id = $6,
                     proforma_date = $7,
                     expected_shipping_date = $8,
                     reference = $9,
                     comment = $10,
                     subtotal = $11,
                     total_discount = $12,
                     grand_total = $13,
                     image1 = $14,
                     image2 = $15,
                     image3 = $16,
                     image4 = $17,
                     pino = COALESCE(NULLIF(pino, ''), $18),
                     updated_at = NOW()
                 WHERE id = $19`,
                [
                    company_id,
                    client_id,
                    customer_id,
                    site.site_name,
                    site.id,
                    location_id,
                    proforma_date,
                    expected_shipping_date,
                    reference,
                    comment,
                    totals.subtotal,
                    totals.total_discount,
                    totals.grand_total,
                    image1,
                    image2,
                    image3,
                    image4,
                    pino,
                    id,
                ]
            );

            await client.query(
                "DELETE FROM public.order_items WHERE order_id = $1",
                [id]
            );
        } else {
            const inserted = await client.query(
                `INSERT INTO public.orders
                 (
                    pino,
                    company_id,
                    client_id,
                    customer_id,
                    customer_site_name,
                    site_id,
                    location_id,
                    proforma_date,
                    expected_shipping_date,
                    reference,
                    comment,
                    status,
                    dispatch_status,
                    subtotal,
                    total_discount,
                    grand_total,
                    image1,
                    image2,
                    image3,
                    image4
                 )
                 VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                    'Draft','Pending',$12,$13,$14,$15,$16,$17,$18
                 )
                 RETURNING id`,
                [
                    pino,
                    company_id,
                    client_id,
                    customer_id,
                    site.site_name,
                    site.id,
                    location_id,
                    proforma_date,
                    expected_shipping_date,
                    reference,
                    comment,
                    totals.subtotal,
                    totals.total_discount,
                    totals.grand_total,
                    image1,
                    image2,
                    image3,
                    image4,
                ]
            );

            savedId = Number(inserted.rows[0].id);
        }

        for (const item of items) {
            const amount = Math.round(
                (item.quantity * item.rate_incl_gst - item.discount) * 100
            ) / 100;

            await client.query(
                `INSERT INTO public.order_items
                 (
                    order_id,
                    product_id,
                    product_name,
                    unit,
                    quantity,
                    rate_incl_gst,
                    discount,
                    amount
                 )
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    savedId,
                    item.product_id,
                    item.product_name,
                    item.unit,
                    item.quantity,
                    item.rate_incl_gst,
                    item.discount,
                    amount,
                ]
            );
        }

        await client.query("COMMIT");

        return await getOrder(savedId);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function deleteOrder(id) {
    const pool = getPool();
    const orderId = positiveId(id, "Order");

    const found = await pool.query(
        "SELECT status FROM public.orders WHERE id = $1",
        [orderId]
    );

    if (!found.rows[0]) throw createError("Order not found.", 404);

    if (["Submitted", "Approved"].includes(found.rows[0].status)) {
        throw createError("Submitted or approved orders cannot be deleted.", 409);
    }

    const result = await pool.query(
        "DELETE FROM public.orders WHERE id = $1 RETURNING id",
        [orderId]
    );

    if (!result.rows[0]) throw createError("Order not found.", 404);

    return true;
}

async function updateOrderStatus(id, status) {
    const allowed = [
        "Draft",
        "Submitted",
        "Approved",
        "Invoiced",
        "Paid",
        "Overdue",
        "Cancelled",
    ];

    if (!allowed.includes(status)) {
        throw createError("Invalid order status.");
    }

    const pool = getPool();

    const result = await pool.query(
        "UPDATE public.orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
        [status, positiveId(id, "Order")]
    );

    if (!result.rows[0]) throw createError("Order not found.", 404);

    return getOrder(id);
}

async function saveDispatch(id, input) {
    const pool = getPool();
    const client = await pool.connect();
    const orderId = positiveId(id, "Order");

    try {
        await client.query("BEGIN");

        const locked = await client.query(
            "SELECT id, dcsno FROM public.orders WHERE id = $1 FOR UPDATE",
            [orderId]
        );

        if (!locked.rows[0]) throw createError("Order not found.", 404);

        const dispatch_status = String(input.dispatch_status || "Pending");

        if (!["Pending", "Partial", "Dispatched"].includes(dispatch_status)) {
            throw createError("Invalid dispatch status.");
        }

        const dispatch_date = dateValue(input.dispatch_date, "Dispatch Date");
        const driver_id = positiveId(input.driver_id, "Driver");
        const driver_name = textValue(input.driver_name, "Driver Name", 250, true);
        const vehicle_no = textValue(input.vehicle_no, "Vehicle Number", 100, true);
        const vehicle_type = textValue(input.vehicle_type, "Vehicle Type", 80, true);
        const contact = textValue(input.contact, "Driver Contact", 50, true);

        const date = new Date(`${dispatch_date}T00:00:00`);

        const dcsno = `${orderId}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;

        const duplicate = await client.query(
            "SELECT id FROM public.orders WHERE dcsno = $1 AND id <> $2 LIMIT 1",
            [dcsno, orderId]
        );

        if (duplicate.rowCount) {
            throw createError(
                `Delivery Challan number ${dcsno} is already assigned to another order.`,
                409
            );
        }

        await client.query(
            `UPDATE public.orders
             SET dcsno = $1,
                 dispatch_sequence_no = $1,
                 dispatch_date = $2,
                 driver_id = $3,
                 driver_name = $4,
                 vehicle_no = $5,
                 vehicle_type = $6,
                 contact = $7,
                 dispatch_status = $8,
                 updated_at = NOW()
             WHERE id = $9`,
            [
                dcsno,
                dispatch_date,
                driver_id,
                driver_name,
                vehicle_no,
                vehicle_type,
                contact,
                dispatch_status,
                orderId,
            ]
        );

        await client.query("COMMIT");

        return await getOrder(orderId);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    getOrders,
    getOrder,
    saveOrder,
    deleteOrder,
    updateOrderStatus,
    saveDispatch,
};
