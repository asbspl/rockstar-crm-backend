
const db = require("../config/db");

const pool = db.pool || db;

async function list({ search = "", page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  const term = `%${search.trim()}%`;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT
         id,
         driver_full_name,
         vehicle_number,
         contact_no,
         aadhar_card_document,
         vehicle_registration_document,
         vehicle_type,
         status,
         created_at,
         updated_at
       FROM public.drivers
       WHERE is_deleted = FALSE
         AND (
           $1 = '%%'
           OR driver_full_name ILIKE $1
           OR vehicle_number ILIKE $1
           OR contact_no ILIKE $1
         )
       ORDER BY id DESC
       LIMIT $2 OFFSET $3`,
      [term, limit, offset]
    ),

    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.drivers
       WHERE is_deleted = FALSE
         AND (
           $1 = '%%'
           OR driver_full_name ILIKE $1
           OR vehicle_number ILIKE $1
           OR contact_no ILIKE $1
         )`,
      [term]
    ),
  ]);

  return {
    rows: rows.rows,
    total: count.rows[0].total,
    page,
    limit,
  };
}

async function findById(id) {
  const result = await pool.query(
    `SELECT *
     FROM public.drivers
     WHERE id = $1
       AND is_deleted = FALSE`,
    [id]
  );

  return result.rows[0] || null;
}

async function create(data) {
  const result = await pool.query(
    `INSERT INTO public.drivers (
       driver_full_name,
       vehicle_number,
       contact_no,
       aadhar_card_document,
       vehicle_registration_document,
       vehicle_type,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.driver_full_name,
      data.vehicle_number,
      data.contact_no,
      data.aadhar_card_document,
      data.vehicle_registration_document,
      data.vehicle_type,
      data.status,
    ]
  );

  return result.rows[0];
}

async function update(id, data) {
  const result = await pool.query(
    `UPDATE public.drivers
     SET
       driver_full_name = $2,
       vehicle_number = $3,
       contact_no = $4,
       aadhar_card_document = $5,
       vehicle_registration_document = $6,
       vehicle_type = $7,
       status = $8,
       updated_at = NOW()
     WHERE id = $1
       AND is_deleted = FALSE
     RETURNING *`,
    [
      id,
      data.driver_full_name,
      data.vehicle_number,
      data.contact_no,
      data.aadhar_card_document,
      data.vehicle_registration_document,
      data.vehicle_type,
      data.status,
    ]
  );

  return result.rows[0] || null;
}

async function updateStatus(id, status) {
  const result = await pool.query(
    `UPDATE public.drivers
     SET
       status = $2,
       updated_at = NOW()
     WHERE id = $1
       AND is_deleted = FALSE
     RETURNING *`,
    [id, status]
  );

  return result.rows[0] || null;
}

async function softDelete(id) {
  const result = await pool.query(
    `UPDATE public.drivers
     SET
       is_deleted = TRUE,
       updated_at = NOW()
     WHERE id = $1
       AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );

  return result.rowCount > 0;
}

module.exports = {
  list,
  findById,
  create,
  update,
  updateStatus,
  softDelete,
};
