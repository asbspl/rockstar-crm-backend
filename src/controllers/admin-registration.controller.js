
const pool = require("../config/db");

async function listRegistrations(req, res, next) {
  try {
    const status = req.query.status || "pending";

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration status.",
      });
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.status,
         u.account_status,
         u.created_at,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object('id', r.id, 'name', r.name)
             )
             FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
           ),
           '[]'::json
         ) AS roles
       FROM public.users u
       WHERE u.is_deleted = FALSE
         AND u.account_status = $1
       ORDER BY u.created_at DESC`,
      [status]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

async function getRegistration(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID.",
      });
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.status,
         u.account_status,
         u.created_at,
         to_jsonb(profile) AS profile,
         to_jsonb(kyc) AS kyc,
         to_jsonb(bank) AS bank
       FROM public.users u
       LEFT JOIN public.user_profiles profile
         ON profile.user_id = u.id
       LEFT JOIN public.user_kyc kyc
         ON kyc.user_id = u.id
       LEFT JOIN public.user_bank_accounts bank
         ON bank.user_id = u.id
       WHERE u.id = $1
         AND u.is_deleted = FALSE`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Registration request not found.",
      });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function listRoles(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, name
       FROM public.roles
       ORDER BY name`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

async function listPermissions(req, res, next) {
  try {
    // Resolve a display label from the actual row without requiring
    // a permissions.code column.
    const result = await pool.query(
      `SELECT
         p.id,
         COALESCE(
           to_jsonb(p)->>'name',
           to_jsonb(p)->>'permission_name',
           to_jsonb(p)->>'title',
           to_jsonb(p)->>'code',
           to_jsonb(p)->>'key',
           p.id::text
         ) AS name,
         COALESCE(
           to_jsonb(p)->>'description',
           to_jsonb(p)->>'display_name',
           ''
         ) AS description
       FROM public.permissions p
       ORDER BY 2`
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

async function reviewRegistration(req, res, next) {
  let client;

  try {
    const userId = req.params.id;
    const reviewerId = req.user?.id;
    const {
      decision,
      reason = "",
      roleIds = [],
      permissionIds = [],
    } = req.body;

    if (!/^\d+$/.test(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID.",
      });
    }

    if (!reviewerId) {
      return res.status(401).json({
        success: false,
        message: "Reviewer authentication is required.",
      });
    }

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be approved or rejected.",
      });
    }

    if (!Array.isArray(roleIds) || !Array.isArray(permissionIds)) {
      return res.status(400).json({
        success: false,
        message: "Role IDs and permission IDs must be arrays.",
      });
    }

    const validIds = (ids) =>
      ids.every((id) => /^\d+$/.test(String(id)) && Number(id) > 0);

    if (
      !validIds(roleIds) ||
      !validIds(permissionIds) ||
      new Set(roleIds.map(String)).size !== roleIds.length ||
      new Set(permissionIds.map(String)).size !== permissionIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Role and permission IDs must be valid and unique.",
      });
    }

    if (decision === "approved" && roleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one role before approving.",
      });
    }

    if (decision === "rejected" && !String(reason).trim()) {
      return res.status(400).json({
        success: false,
        message: "Provide a reason for rejection.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, account_status
       FROM public.users
       WHERE id = $1 AND is_deleted = FALSE
       FOR UPDATE`,
      [userId]
    );

    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Registration not found.",
      });
    }

    if (userResult.rows[0].account_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "This registration has already been reviewed.",
      });
    }

    if (decision === "approved") {
      const roles = await client.query(
        `SELECT id
         FROM public.roles
         WHERE id::text = ANY($1::text[])`,
        [roleIds.map(String)]
      );

      if (roles.rowCount !== roleIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "One or more selected roles do not exist.",
        });
      }

      const permissions = await client.query(
        `SELECT id
         FROM public.permissions
         WHERE id::text = ANY($1::text[])`,
        [permissionIds.map(String)]
      );

      if (permissions.rowCount !== permissionIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "One or more selected permissions do not exist.",
        });
      }

      await client.query(
        `DELETE FROM public.user_roles WHERE user_id = $1`,
        [userId]
      );

      await client.query(
        `INSERT INTO public.user_roles (user_id, role_id, assigned_by)
         SELECT $1, r.id, $2
         FROM public.roles r
         WHERE r.id::text = ANY($3::text[])`,
        [userId, reviewerId, roleIds.map(String)]
      );

      // This implementation expects public.user_permissions to exist
      // with user_id, permission_id and granted_by columns.
      await client.query(
        `DELETE FROM public.user_permissions WHERE user_id = $1`,
        [userId]
      );

      if (permissionIds.length > 0) {
        await client.query(
          `INSERT INTO public.user_permissions
             (user_id, permission_id, granted_by)
           SELECT $1, p.id, $2
           FROM public.permissions p
           WHERE p.id::text = ANY($3::text[])`,
          [userId, reviewerId, permissionIds.map(String)]
        );
      }

      await client.query(
        `UPDATE public.users
         SET account_status = 'approved',
             status = 'active',
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );
    } else {
      await client.query(
        `UPDATE public.users
         SET account_status = 'rejected',
             status = 'inactive',
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );
    }

    // Save audit history if this table is present.
    const historyTable = await client.query(
      `SELECT to_regclass('public.registration_review_history') AS table_name`
    );

    if (historyTable.rows[0].table_name) {
      await client.query(
        `INSERT INTO public.registration_review_history
           (user_id, reviewed_by, decision, reason)
         VALUES ($1, $2, $3, $4)`,
        [userId, reviewerId, decision, String(reason).trim() || null]
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message:
        decision === "approved"
          ? "Registration approved and access assigned."
          : "Registration rejected.",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Keep the original error.
      }
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
}

function createAdminRegistrationController() {
  return {
    listRegistrations,
    getRegistration,
    listRoles,
    listPermissions,
    reviewRegistration,
  };
}

module.exports = createAdminRegistrationController;
