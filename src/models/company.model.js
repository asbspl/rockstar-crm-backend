
const pool = require("../config/db");

async function listCompanies({ search, limit, offset }) {
  const result = await pool.query(
    `
      SELECT
        id,
        company_name,
        phone,
        email,
        address_line1,
        address_line2,
        country,
        state,
        city,
        pin_code,
        company_logo,
        company_signature,
        bank_details,
        terms_and_conditions,
        pan_number,
        pan_document,
        gst_number,
        gst_certificate,
        status,
        created_at,
        updated_at
      FROM public.companies
      WHERE
        COALESCE(company_name, '') ILIKE $1
        OR COALESCE(phone, '') ILIKE $1
        OR COALESCE(email, '') ILIKE $1
        OR COALESCE(city, '') ILIKE $1
      ORDER BY id DESC
      LIMIT $2 OFFSET $3
    `,
    [`%${search}%`, limit, offset]
  );

  return result.rows;
}

async function countCompanies(search) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM public.companies
      WHERE
        COALESCE(company_name, '') ILIKE $1
        OR COALESCE(phone, '') ILIKE $1
        OR COALESCE(email, '') ILIKE $1
        OR COALESCE(city, '') ILIKE $1
    `,
    [`%${search}%`]
  );

  return result.rows[0].total;
}

async function getCompanyById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM public.companies
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function createCompany(data) {
  const result = await pool.query(
    `
      INSERT INTO public.companies (
        company_name,
        phone,
        email,
        address_line1,
        address_line2,
        country,
        state,
        city,
        pin_code,
        company_logo,
        company_signature,
        bank_details,
        terms_and_conditions,
        pan_number,
        pan_document,
        gst_number,
        gst_certificate,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, 'active'
      )
      RETURNING *
    `,
    [
      data.companyName,
      data.phone,
      data.email,
      data.addressLine1,
      data.addressLine2 || null,
      data.country,
      data.state,
      data.city,
      data.pinCode,
      data.companyLogo,
      data.companySignature,
      data.bankDetails,
      data.termsAndConditions,
      data.panNumber,
      data.panDocument,
      data.gstNumber,
      data.gstCertificate,
    ]
  );

  return result.rows[0];
}


async function updateCompany(id, data) {
  const result = await pool.query(
    `
      UPDATE public.companies
      SET
        company_name = $1,
        phone = $2,
        email = $3,
        address_line1 = $4,
        address_line2 = $5,
        country = $6,
        state = $7,
        city = $8,
        pin_code = $9,
        company_logo = $10,
        company_signature = $11,
        bank_details = $12,
        terms_and_conditions = $13,
        pan_number = $14,
        pan_document = $15,
        gst_number = $16,
        gst_certificate = $17,
        status = $18,
        updated_at = NOW()
      WHERE id = $19
      RETURNING *
    `,
    [
      data.companyName,       // $1
      data.phone,              // $2
      data.email,              // $3
      data.addressLine1,       // $4
      data.addressLine2 || null, // $5
      data.country,            // $6
      data.state,              // $7
      data.city,               // $8
      data.pinCode,            // $9
      data.companyLogo,        // $10
      data.companySignature,   // $11
      data.bankDetails,        // $12
      data.termsAndConditions, // $13
      data.panNumber,          // $14
      data.panDocument,        // $15
      data.gstNumber,          // $16
      data.gstCertificate,     // $17
      data.status || "active", // $18
      id,                      // $19
    ]
  );

  return result.rows[0] || null;
}


async function deleteCompany(id) {
  const result = await pool.query(
    `
      DELETE FROM public.companies
      WHERE id = $1
      RETURNING id
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  listCompanies,
  countCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
};
