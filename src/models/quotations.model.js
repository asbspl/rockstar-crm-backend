
const pool = require("../config/db");



const quotationJoins = `
    FROM public.quotations q

    LEFT JOIN public.companies co
        ON co.id = q.company_id

    LEFT JOIN public.clients cl
        ON cl.id = q.client_id

    LEFT JOIN public.customers cu
        ON cu.id = q.customer_id

    LEFT JOIN public.sites si
        ON si.id = q.site_id

    LEFT JOIN public.locations lo
        ON lo.id = q.location_id

    LEFT JOIN public.locations site_lo
        ON site_lo.id = si.location_id
`;





const quotationSelect = `
    SELECT
        q.id,
        q.quotation_no,
        q.company_id,
        q.client_id,
        q.customer_id,
        q.site_id,
        q.location_id,
        q.quotation_date,
        q.expiry_date,
        q.reference,
        q.comment,
        q.total_amount,
        q.grand_total,
        q.status,
        q.created_at,
        q.updated_at,

        COALESCE(co.company_name, '') AS company_name,
        COALESCE(cl.client_name, '') AS client_name,
        COALESCE(cu.customer_name, '') AS customer_name,
        COALESCE(si.site_name, '') AS site_name,

        COALESCE(
            NULLIF(TRIM(lo.location_name), ''),
            NULLIF(TRIM(site_lo.location_name), ''),
            NULLIF(TRIM(si.site_location_name), ''),
            ''
        ) AS location_name,

        si.site_location_mode AS location_mode,
        si.site_location_address AS location_address,
        si.site_location_latitude AS location_latitude,
        si.site_location_longitude AS location_longitude,
        si.site_location_map_url AS location_map_url,
        si.vehicle_tracking_reference AS vehicle_tracking_reference
`;


async function getAll({
    page = 1,
    limit = 10,
    search = "",
    status = "All",
}) {
    const values = [];
    let where = " WHERE 1 = 1 ";

    if (search.trim()) {
        values.push(`%${search.trim()}%`);
        const n = values.length;

        where += `
            AND (
                q.quotation_no ILIKE $${n}
                OR COALESCE(co.company_name, '') ILIKE $${n}
                OR COALESCE(cl.client_name, '') ILIKE $${n}
                OR COALESCE(cu.customer_name, '') ILIKE $${n}
                OR COALESCE(si.site_name, '') ILIKE $${n}
                OR COALESCE(lo.location_name, '') ILIKE $${n}
                OR COALESCE(site_lo.location_name, '') ILIKE $${n}
            )
        `;
    }

    if (status && status !== "All") {
        values.push(status);
        where += ` AND q.status = $${values.length}`;
    }

    const count = await pool.query(
        `SELECT COUNT(DISTINCT q.id)::int AS total
         ${quotationJoins}
         ${where}`,
        values
    );

    const offset = (page - 1) * limit;

    const result = await pool.query(
        `${quotationSelect}
         ${quotationJoins}
         ${where}
         ORDER BY q.id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );

    return {
        rows: result.rows,
        pagination: {
            page,
            limit,
            total: count.rows[0].total,
            totalPages: Math.max(
                1,
                Math.ceil(count.rows[0].total / limit)
            ),
        },
    };
}

async function getById(id, db = pool) {
    const result = await db.query(
        `${quotationSelect}
         ${quotationJoins}
         WHERE q.id = $1`,
        [id]
    );

    if (!result.rowCount) {
        return null;
    }

    const items = await db.query(
        `SELECT
            qi.id,
            qi.quotation_id,
            qi.product_id,
            qi.unit,
            qi.quantity,
            qi.rate_incl_gst,
            qi.amount,
            COALESCE(p.product_name, '') AS product_name
         FROM public.quotation_items qi
         LEFT JOIN public.products p
            ON p.id = qi.product_id
         WHERE qi.quotation_id = $1
         ORDER BY qi.id`,
        [id]
    );

    return {
        ...result.rows[0],
        items: items.rows,
    };
}

async function insertHeader(db, data) {
    const result = await db.query(
        `INSERT INTO public.quotations (
            quotation_no,
            company_id,
            client_id,
            customer_id,
            site_id,
            location_id,
            quotation_date,
            expiry_date,
            reference,
            comment,
            total_amount,
            grand_total,
            status
        ) VALUES (
            'TEMP-' || LEFT(
                MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text),
                20
            ),
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, 'Draft'
        )
        RETURNING id`,
        [
            data.company_id,
            data.client_id,
            data.customer_id ?? null,
            data.site_id ?? null,
            data.location_id ?? null,
            data.quotation_date,
            data.expiry_date,
            data.reference,
            data.comment,
            data.total_amount,
            data.grand_total,
        ]
    );

    const id = result.rows[0].id;
    const year = String(new Date().getFullYear()).slice(-2);
    const quotationNo = `QS${year}${String(id).padStart(4, "0")}`;

    await db.query(
        `UPDATE public.quotations
         SET quotation_no = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [quotationNo, id]
    );

    return id;
}

async function replaceItems(db, quotationId, items) {
    await db.query(
        `DELETE FROM public.quotation_items
         WHERE quotation_id = $1`,
        [quotationId]
    );

    for (const item of items) {
        await db.query(
            `INSERT INTO public.quotation_items (
                quotation_id,
                product_id,
                unit,
                quantity,
                rate_incl_gst,
                amount
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                quotationId,
                item.product_id,
                item.unit,
                item.quantity,
                item.rate_incl_gst,
                item.amount,
            ]
        );
    }
}

async function updateHeader(db, id, data) {
    await db.query(
        `UPDATE public.quotations
         SET
            company_id = $1,
            client_id = $2,
            customer_id = $3,
            site_id = $4,
            location_id = $5,
            quotation_date = $6,
            expiry_date = $7,
            reference = $8,
            comment = $9,
            total_amount = $10,
            grand_total = $11,
            updated_at = NOW()
         WHERE id = $12`,
        [
            data.company_id,
            data.client_id,
            data.customer_id ?? null,
            data.site_id ?? null,
            data.location_id ?? null,
            data.quotation_date,
            data.expiry_date,
            data.reference,
            data.comment,
            data.total_amount,
            data.grand_total,
            id,
        ]
    );
}

async function setStatus(id, status) {
    const result = await pool.query(
        `UPDATE public.quotations
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, quotation_no, status`,
        [status, id]
    );

    return result.rows[0] || null;
}

async function remove(id) {
    const result = await pool.query(
        `DELETE FROM public.quotations
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    return result.rowCount > 0;
}

module.exports = {
    pool,
    getAll,
    getById,
    insertHeader,
    replaceItems,
    updateHeader,
    setStatus,
    remove,
};
