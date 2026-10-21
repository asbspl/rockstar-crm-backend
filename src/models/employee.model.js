
const pool = require("../config/db");

const ALLOWED_FIELDS = [
  "employee_code",
  "employee_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "country",
  "state",
  "city",
  "pin_code",
  "location",
  "joining_date",
  "resignation_date",
  "status",
  "profile_picture",
  "last_salary_slip",
  "pan_card",
  "aadhar_card",
  "resume",
  "account_statement",
  "experience_certificate",
  "allotment_list",
];

function mapEmployee(row) {
  if (!row) return null;
  return row;
}

async function list({ search, status, limit, offset }) {
  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;

    conditions.push(`(
      employee_name ILIKE ${p}
      OR employee_code ILIKE ${p}
      OR phone ILIKE ${p}
      OR email ILIKE ${p}
      OR location ILIKE ${p}
      OR address_line1 ILIKE ${p}
    )`);
  }

  if (status && status !== "all") {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM public.employees ${where}`,
    values
  );

  const total = countResult.rows[0].total;

  values.push(limit);
  const limitParam = `$${values.length}`;

  values.push(offset);
  const offsetParam = `$${values.length}`;

  const result = await pool.query(
    `SELECT *
     FROM public.employees
     ${where}
     ORDER BY id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values
  );

  return {
    rows: result.rows.map(mapEmployee),
    total,
  };
}

async function findById(id) {
  const result = await pool.query(
    "SELECT * FROM public.employees WHERE id = $1",
    [id]
  );

  return mapEmployee(result.rows[0]);
}

async function create(data) {
  const fields = ALLOWED_FIELDS.filter(
    (field) => data[field] !== undefined
  );

  const columns = fields.join(", ");
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(", ");
  const values = fields.map((field) => data[field]);

  const result = await pool.query(
    `INSERT INTO public.employees (${columns})
     VALUES (${placeholders})
     RETURNING *`,
    values
  );

  return mapEmployee(result.rows[0]);
}

async function update(id, data) {
  const fields = ALLOWED_FIELDS.filter(
    (field) => data[field] !== undefined
  );

  if (!fields.length) {
    return findById(id);
  }

  const assignments = fields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(", ");

  const values = fields.map((field) => data[field]);
  values.push(id);

  const result = await pool.query(
    `UPDATE public.employees
     SET ${assignments}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return mapEmployee(result.rows[0]);
}

async function updateStatus(id, status) {
  const result = await pool.query(
    `UPDATE public.employees
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  return mapEmployee(result.rows[0]);
}

async function remove(id) {
  const result = await pool.query(
    "DELETE FROM public.employees WHERE id = $1 RETURNING id",
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
  remove,
};
