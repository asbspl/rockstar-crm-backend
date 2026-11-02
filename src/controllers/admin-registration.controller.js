
const pool = require("../config/db");

const ALLOWED_STATUSES = ["pending", "approved", "rejected"];
const PRIVILEGED_PERMISSION_PREFIXES = ["roles.", "permissions.", "modules."];
const PRIVILEGED_PERMISSION_KEYS = new Set([
  "users.approve",
  "users.reject",
  "users.suspend",
  "users.assign_role",
  "users.assign_permission",
  "users.permissions.update",
]);
async function preventPrivilegeGrant(client, permissionIds, actorRoles) {
  if (
    (actorRoles || []).includes("SUPER_ADMIN") ||
    permissionIds.length === 0
  ) {
    return;
  }

  const result = await client.query(
    `SELECT key
     FROM public.permissions
     WHERE id = ANY($1::bigint[])`,
    [permissionIds],
  );

  const privileged = result.rows.some(({ key }) =>
    PRIVILEGED_PERMISSION_KEYS.has(key) ||
    PRIVILEGED_PERMISSION_PREFIXES.some((prefix) =>
      key.startsWith(prefix)
    ) ||
    key.startsWith("users.permissions."),
  );

  if (privileged) {
    throw Object.assign(
      new Error("Only a Super Admin can grant administrative permissions"),
      { statusCode: 403 },
    );
  }
}

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

async function validateSelectedIds(client, table, ids) {
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
     WHERE id::text = ANY($1::text[])
       AND is_active = TRUE`,
    [ids.map(String)]
  );

  return result.rowCount === ids.length;
}
  if (ids.length === 0) {
    return true;
  }

  const result = await client.query(
    `SELECT id
     FROM public.${table}
     WHERE id::text = ANY($1::text[])
       AND is_active = TRUE`,
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

async function replaceUserPermissions(client, userId, permissionIds, roleIds) {
  const defaults = await client.query(
    `SELECT DISTINCT rp.permission_id
     FROM public.role_permissions rp
     JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
     WHERE rp.role_id = ANY($1::bigint[])`,
    [roleIds],
  );
  const defaultIds = new Set(defaults.rows.map((row) => Number(row.permission_id)));
  const selectedIds = new Set(permissionIds.map(Number));
  const grantIds = permissionIds.filter((id) => !defaultIds.has(Number(id)));
  const denyIds = [...defaultIds].filter((id) => !selectedIds.has(id));

  await client.query(
    `DELETE FROM public.user_permissions
     WHERE user_id = $1`,
    [userId]
  );

  for (const permissionId of grantIds) {
    await client.query(
      `INSERT INTO public.user_permissions (user_id, permission_id, effect)
       VALUES ($1, $2, 'grant')
       ON CONFLICT (user_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect`,
      [userId, permissionId]
    );
  }
  for (const permissionId of denyIds) {
    await client.query(
      `INSERT INTO public.user_permissions (user_id, permission_id, effect)
       VALUES ($1, $2, 'deny')
       ON CONFLICT (user_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect`,
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
                 'name', r.name,
                 'code', r.code
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
             SELECT json_agg(DISTINCT effective.id ORDER BY effective.id)
             FROM public.permissions effective
             JOIN public.permission_modules effective_module
               ON effective_module.id = effective.module_id
              AND effective_module.is_active = TRUE
             WHERE effective.is_active = TRUE
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.user_permissions denied
                 WHERE denied.user_id = u.id
                   AND denied.permission_id = effective.id
                   AND denied.effect = 'deny'
               )
               AND (
                 EXISTS (
                   SELECT 1
                   FROM public.user_roles effective_ur
                   JOIN public.roles effective_role
                     ON effective_role.id = effective_ur.role_id
                    AND effective_role.is_active = TRUE
                   JOIN public.role_permissions effective_rp
                     ON effective_rp.role_id = effective_role.id
                   WHERE effective_ur.user_id = u.id
                     AND effective_rp.permission_id = effective.id
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM public.user_permissions granted
                   WHERE granted.user_id = u.id
                     AND granted.permission_id = effective.id
                     AND granted.effect = 'grant'
                 )
               )
           ),
           '[]'::json
         ) AS "permissionIds",

         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', effective.id,
                 'key', effective.key,
                 'code', effective.key,
                 'name', effective.name,
                 'module', module.name
               )
               ORDER BY module.name, effective.key
             )
             FROM public.permissions effective
             JOIN public.permission_modules module
               ON module.id = effective.module_id
              AND module.is_active = TRUE
             WHERE effective.is_active = TRUE
               AND NOT EXISTS (
                 SELECT 1
                 FROM public.user_permissions denied
                 WHERE denied.user_id = u.id
                   AND denied.permission_id = effective.id
                   AND denied.effect = 'deny'
               )
               AND (
                 EXISTS (
                   SELECT 1
                   FROM public.user_roles effective_ur
                   JOIN public.roles effective_role
                     ON effective_role.id = effective_ur.role_id
                    AND effective_role.is_active = TRUE
                   JOIN public.role_permissions effective_rp
                     ON effective_rp.role_id = effective_role.id
                   WHERE effective_ur.user_id = u.id
                     AND effective_rp.permission_id = effective.id
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM public.user_permissions granted
                   WHERE granted.user_id = u.id
                     AND granted.permission_id = effective.id
                     AND granted.effect = 'grant'
                 )
               )
           ),
           '[]'::json
         ) AS "effectivePermissions",

         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', p.id,
                 'key', p.key,
                 'effect', up.effect
               )
               ORDER BY p.key
             )
             FROM public.user_permissions up
             JOIN public.permissions p ON p.id = up.permission_id
             WHERE up.user_id = u.id
           ),
           '[]'::json
         ) AS "permissionOverrides",

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
         m.key AS "moduleKey",
         m.name AS module,
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
       JOIN public.permission_modules m ON m.id = p.module_id
       WHERE p.is_active = TRUE
         AND m.is_active = TRUE
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

    if (String(userId) === String(reviewerId)) {
      return res.status(403).json({
        success: false,
        message: "Administrators cannot approve their own account.",
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

      const selectedRoles = await client.query(
        "SELECT id, code FROM public.roles WHERE id = ANY($1::bigint[])",
        [roleIds],
      );
      if (
        selectedRoles.rows.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.code)) &&
        !(req.auth.roles || []).includes("SUPER_ADMIN")
      ) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Only a Super Admin can assign administrator roles.",
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

      await preventPrivilegeGrant(client, permissionIds, req.auth.roles || []);
      await replaceUserRoles(client, userId, roleIds);

      await replaceUserPermissions(
        client,
        userId,
        permissionIds,
        roleIds,
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

    if (
      String(userId) === String(reviewerId)
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own access using this endpoint.",
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

    const selectedRoles = await client.query(
      "SELECT id, code FROM public.roles WHERE id = ANY($1::bigint[])",
      [roleIds],
    );
    if (
      selectedRoles.rows.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.code)) &&
      !(req.auth.roles || []).includes("SUPER_ADMIN")
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Only a Super Admin can assign administrator roles.",
      });
    }
    await preventPrivilegeGrant(client, permissionIds, req.auth.roles || []);

    await replaceUserRoles(client, userId, roleIds);

    await replaceUserPermissions(
      client,
      userId,
      permissionIds,
      roleIds,
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
