
const db = require("../config/db");

async function findAll({ page, limit, search, status }) {
    const offset = (page - 1) * limit;
    const values = [];
    const conditions = [];

    if (search) {
        values.push(`%${search}%`);
        conditions.push(`
            (
                name ILIKE $${values.length}
                OR phone ILIKE $${values.length}
                OR email ILIKE $${values.length}
                OR location ILIKE $${values.length}
                OR city ILIKE $${values.length}
            )
        `);
    }

    if (status && status !== "All") {
        values.push(status);
        conditions.push(`status = $${values.length}`);
    }

    const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countResult = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM public.contractors ${where}`,
        values
    );

    const rowsResult = await db.query(
        `SELECT
            id, name, phone, email, address_line1,
            address_line2, location, state, city, pin_code,
            pan_card, pan_card_document, aadhaar_card,
            aadhaar_card_document, payment_upi,
            account_name, account_number, ifsc_code,
            status, created_at, updated_at
         FROM public.contractors
         ${where}
         ORDER BY id DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );

    return {
        rows: rowsResult.rows,
        total: countResult.rows[0].total,
    };
}

async function findById(id) {
    const result = await db.query(
        `SELECT * FROM public.contractors WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

async function create(data) {
    const result = await db.query(
        `INSERT INTO public.contractors (
            name, phone, email, address_line1, address_line2,
            location, state, city, pin_code, pan_card,
            pan_card_document, aadhaar_card, aadhaar_card_document,
            payment_upi, account_name, account_number, ifsc_code, status
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        RETURNING *`,
        [
            data.name, data.phone, data.email,
            data.address_line1, data.address_line2 || null,
            data.location, data.state, data.city, data.pin_code,
            data.pan_card, data.pan_card_document,
            data.aadhaar_card, data.aadhaar_card_document,
            data.payment_upi, data.account_name,
            data.account_number, data.ifsc_code, data.status,
        ]
    );

    return result.rows[0];
}

async function update(id, data) {
    const result = await db.query(
        `UPDATE public.contractors SET
            name = $1, phone = $2, email = $3,
            address_line1 = $4, address_line2 = $5,
            location = $6, state = $7, city = $8, pin_code = $9,
            pan_card = $10,
            pan_card_document = $11,
            aadhaar_card = $12,
            aadhaar_card_document = $13,
            payment_upi = $14, account_name = $15,
            account_number = $16, ifsc_code = $17,
            status = $18, updated_at = NOW()
         WHERE id = $19
         RETURNING *`,
        [
            data.name, data.phone, data.email,
            data.address_line1, data.address_line2 || null,
            data.location, data.state, data.city, data.pin_code,
            data.pan_card, data.pan_card_document,
            data.aadhaar_card, data.aadhaar_card_document,
            data.payment_upi, data.account_name,
            data.account_number, data.ifsc_code, data.status, id,
        ]
    );

    return result.rows[0] || null;
}

async function updateStatus(id, status) {
    const result = await db.query(
        `UPDATE public.contractors
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
    );

    return result.rows[0] || null;
}

async function remove(id) {
    const result = await db.query(
        `DELETE FROM public.contractors WHERE id = $1 RETURNING id`,
        [id]
    );

    return result.rowCount > 0;
}

module.exports = {
    findAll,
    findById,
    create,
    update,
    updateStatus,
    remove,
};
