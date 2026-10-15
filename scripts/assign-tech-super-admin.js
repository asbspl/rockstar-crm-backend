const pool = require("../src/config/db");

async function assignSuperAdminDashboardAccess() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, status, account_status, is_deleted
       FROM public.users
       WHERE LOWER(email) = LOWER($1)
       FOR UPDATE`,
      ["tech@asbspl.com"]
    );
    const user = userResult.rows[0];
    if (!user || user.status !== "active" || user.is_deleted) {
      throw new Error("The target account must exist, be active, and not be deleted.");
    }

    const roleResult = await client.query(
      `SELECT id, is_active FROM public.roles WHERE code = $1 FOR UPDATE`,
      ["SUPER_ADMIN"]
    );
    const role = roleResult.rows[0];
    if (!role || !role.is_active) {
      throw new Error("An active SUPER_ADMIN role is required; no role was created or reactivated.");
    }

    const permissionResult = await client.query(
      `SELECT id, is_active FROM public.permissions WHERE key = $1 FOR UPDATE`,
      ["dashboard.read"]
    );
    const permission = permissionResult.rows[0];
    if (!permission || !permission.is_active) {
      throw new Error("An active dashboard.read permission is required; no permission was activated.");
    }

    await client.query(
      `INSERT INTO public.role_permissions (role_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [role.id, permission.id]
    );
    await client.query(
      `INSERT INTO public.user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [user.id, role.id]
    );

    await client.query(
      `UPDATE public.users
       SET account_status = 'approved', approved_by = $1, rejection_reason = NULL, updated_at = NOW()
       WHERE id = $2`,
      [user.id, user.id]
    );

    await client.query("COMMIT");
    console.log("Super Admin dashboard access is assigned to the existing target account.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

assignSuperAdminDashboardAccess()
  .catch((error) => {
    console.error("Super Admin dashboard access seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());