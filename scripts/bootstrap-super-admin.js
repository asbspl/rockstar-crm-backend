const bcrypt = require("bcrypt");
const { getConfig } = require("../src/config/env");
const pool = require("../src/config/db");

async function bootstrapSuperAdmin() {
  const config = getConfig();
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || config.authUser?.email || "admin@example.com";
  const fullName = process.env.BOOTSTRAP_SUPER_ADMIN_NAME || "System Administrator";
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

  if (!password) {
    console.warn("BOOTSTRAP_SUPER_ADMIN_PASSWORD is not set. Skipping bootstrap.");
    return;
  }

  const existingUser = await pool.query(
    `SELECT u.id FROM public.users u JOIN public.user_roles ur ON ur.user_id = u.id JOIN public.roles r ON r.id = ur.role_id WHERE LOWER(u.email) = LOWER($1) AND r.code = 'SUPER_ADMIN' LIMIT 1`,
    [email]
  );

  if (existingUser.rowCount) {
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userResult = await pool.query(
    `INSERT INTO public.users (email, full_name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [email.toLowerCase(), fullName, passwordHash]
  );

  const roleResult = await pool.query(`SELECT id FROM public.roles WHERE code = 'SUPER_ADMIN' LIMIT 1`);
  const roleId = roleResult.rows[0]?.id;

  if (roleId) {
    await pool.query(`INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userResult.rows[0].id, roleId]);
  }
  await pool.end();
}

bootstrapSuperAdmin().catch((error) => {
  console.error("Bootstrap failed:", error.message);
  process.exitCode = 1;
});
