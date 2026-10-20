
const pool = require("../config/db");

const ALLOWED_STATUSES = ["pending", "approved", "rejected"];

function isValidId(value) {
  return (
    /^\d+$/.test(String(value)) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

function validateIdArray(ids) {
  return (
    Array.isArray(ids) &&
    ids.every(isValidId) &&
    new Set(ids.map(String)).size === ids.length
  );
}

async function validateSelectedIds(client, table, ids) {
  // Table names are internal constants supplied by this controller.
  const allowedTables = ["roles", "permissions"];

  if (!allowedTables.includes(table)) {
    throw new Error("Invalid validation table.");
  }

  if (ids.length === 0) {
    return true;
  }

  const result = await client.query(
    `SELECT id
     FROM public.${table}
     WHERE id::text = ANY($1::text[])`,
    [ids.map(String)]
  );

  return result.rowCount === ids.length;
}

async function replaceUserRoles(client, userId, roleIds) {
  await client.query(
    `DELETE FROM public.user_roles
     WHERE user_id = $1`,
    [userId]
  );

  for (const roleId of roleIds) {
    await client.query(
      `INSERT INTO public.user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId]
    );
  }
}

async function replaceUserPermissions(client, userId, permissionIds) {
  await client.query(
    `DELETE FROM public.user_permissions
     WHERE user_id = $1`,
    [userId]
  );

  for (const permissionId of permissionIds) {
    await client.query(
      `INSERT INTO public.user_permissions (user_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, permission_id) DO NOTHING`,
      [userId, permissionId]
    );
  }
}

async function listRegistrations(req, res, next) {
  try {
    const status = req.query.status;

    if (
      status !== undefined &&
      !ALLOWED_STATUSES.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid registration status. Use pending, approved, rejected, or omit status for all.",
      });
    }

    const values = [];
    let statusFilter = "";

    if (status) {
      values.push(status);
      statusFilter = "AND u.account_status = $1";
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.phone,
         u.status,
         u.account_status,
         u.created_at,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', r.id,
                 'name', r.name
               )
               ORDER BY r.name
             )
             FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
           ),
           '[]'::json
         ) AS roles
       FROM public.users u
       WHERE u.is_deleted = FALSE
         ${statusFilter}
       ORDER BY u.created_at DESC`,
      values
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function getRegistration(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
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
         u.phone,
         u.status,
         u.account_status,
         u.created_at,

         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', r.id,
                 'name', r.name
               )
               ORDER BY r.name
             )
             FROM public.user_roles ur
             JOIN public.roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
           ),
           '[]'::json
         ) AS roles,

         COALESCE(
           (
             SELECT json_agg(ur.role_id ORDER BY ur.role_id)
             FROM public.user_roles ur
             WHERE ur.user_id = u.id
           ),
           '[]'::json
         ) AS "roleIds",

         COALESCE(
           (
             SELECT json_agg(
               up.permission_id ORDER BY up.permission_id
             )
             FROM public.user_permissions up
             WHERE up.user_id = u.id
           ),
           '[]'::json
         ) AS "permissionIds",

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

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

async function listRoles(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, code, name, description
       FROM public.roles
       WHERE is_active = TRUE
       ORDER BY name`
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function listPermissions(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         p.id,
         p.key,
         COALESCE(
           NULLIF(to_jsonb(p)->>'name', ''),
           NULLIF(to_jsonb(p)->>'permission_name', ''),
           NULLIF(to_jsonb(p)->>'title', ''),
           NULLIF(to_jsonb(p)->>'display_name', ''),
           p.key,
           p.id::text
         ) AS name,
         COALESCE(p.description, '') AS description
       FROM public.permissions p
       WHERE p.is_active = TRUE
       ORDER BY 3`
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function reviewRegistration(req, res, next) {
  let client;

  try {
    const userId = req.params.id;
    const reviewerId = req.auth?.userId;

    const {
      decision,
      reason = "",
      roleIds = [],
      permissionIds = [],
    } = req.body;

    if (!isValidId(userId)) {
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

    if (
      !validateIdArray(roleIds) ||
      !validateIdArray(permissionIds)
    ) {
      return res.status(400).json({
        success: false,
        message: "Role IDs and permission IDs must be valid, unique ID arrays.",
      });
    }

    if (decision === "approved" && roleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one role before approving.",
      });
    }

    if (
      decision === "rejected" &&
      !String(reason).trim()
    ) {
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
       WHERE id = $1
         AND is_deleted = FALSE
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
      const rolesValid = await validateSelectedIds(
        client,
        "roles",
        roleIds
      );

      if (!rolesValid) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "One or more selected roles do not exist.",
        });
      }

      const permissionsValid = await validateSelectedIds(
        client,
        "permissions",
        permissionIds
      );

      if (!permissionsValid) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "One or more selected permissions do not exist.",
        });
      }

      await replaceUserRoles(client, userId, roleIds);

      await replaceUserPermissions(
        client,
        userId,
        permissionIds
      );

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

    await client.query(
      `INSERT INTO public.registration_reviews
         (user_id, reviewed_by, decision, notes, reviewed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        userId,
        reviewerId,
        decision,
        String(reason).trim() || null,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message:
        decision === "approved"
          ? "Registration approved and roles and permissions saved."
          : "Registration rejected.",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Preserve the original error.
      }
    }

    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Update access for an already approved user.
 * Expected body: { roleIds: number[], permissionIds: number[] }
 */
async function updateUserAccess(req, res, next) {
  let client;

  try {
    const userId = req.params.id;
    const reviewerId = req.auth?.userId;
    const { roleIds, permissionIds } = req.body;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!reviewerId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (
      !validateIdArray(roleIds) ||
      !validateIdArray(permissionIds)
    ) {
      return res.status(400).json({
        success: false,
        message: "roleIds and permissionIds must be arrays of unique valid IDs.",
      });
    }

    if (roleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one role.",
      });
    }

    if (String(userId) === String(reviewerId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own access using this endpoint.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, account_status
       FROM public.users
       WHERE id = $1
         AND is_deleted = FALSE
       FOR UPDATE`,
      [userId]
    );

    if (!userResult.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (userResult.rows[0].account_status !== "approved") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Only approved users can have their access updated.",
      });
    }

    const rolesValid = await validateSelectedIds(
      client,
      "roles",
      roleIds
    );

    if (!rolesValid) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "One or more selected roles do not exist.",
      });
    }

    const permissionsValid = await validateSelectedIds(
      client,
      "permissions",
      permissionIds
    );

    if (!permissionsValid) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "One or more selected permissions do not exist.",
      });
    }

    await replaceUserRoles(client, userId, roleIds);

    await replaceUserPermissions(
      client,
      userId,
      permissionIds
    );

    await client.query(
      `UPDATE public.users
       SET updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "User roles and permissions updated successfully.",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Preserve the original error.
      }
    }

    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

function createAdminRegistrationController() {
  return {
    listRegistrations,
    getRegistration,
    listRoles,
    listPermissions,
    reviewRegistration,
    updateUserAccess,
  };
}

module.exports = createAdminRegistrationController;
