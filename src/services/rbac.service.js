const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

const PRIVILEGED_PERMISSION_KEYS = new Set([
  "users.approve",
  "users.reject",
  "users.suspend",
  "users.assign_role",
  "users.assign_permission",
  "users.permissions.update",
  "roles.create",
  "roles.update",
  "roles.assign",
  "roles.delete",
  "permissions.assign",
  "permissions.create",
  "permissions.update",
  "permissions.deactivate",
  "modules.manage",
]);

function isSuperAdmin(roleCodes = []) {
  return roleCodes.includes("SUPER_ADMIN");
}

function requireSuperAdmin(roleCodes, message) {
  if (!isSuperAdmin(roleCodes)) {
    throw new ApiError(403, message || "Only a Super Admin can perform this action");
  }
}

function normalizeIds(values, label) {
  if (!Array.isArray(values)) {
    throw new ApiError(400, `${label} must be an array`);
  }
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ApiError(400, `${label} contains an invalid ID`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, `${label} must not contain duplicate IDs`);
  }
  return ids;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePermissionKeys(values) {
  if (!Array.isArray(values)) {
    throw new ApiError(400, "Permissions must be an array");
  }
  const keys = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (keys.length !== values.length) {
    throw new ApiError(400, "Permissions must not contain empty or duplicate values");
  }
  return keys;
}

function assertCanGrantPermissionKeys(permissionKeys, actorPermissionKeys, actorRoles) {
  if (isSuperAdmin(actorRoles)) return;
  const actorPermissions = new Set(actorPermissionKeys || []);
  const forbidden = permissionKeys.filter(
    (key) => PRIVILEGED_PERMISSION_KEYS.has(key) || key.startsWith("users.permissions."),
  );
  const notHeld = permissionKeys.filter((key) => !actorPermissions.has(key));
  if (forbidden.length || notHeld.length) {
    throw new ApiError(403, "You cannot grant permissions you do not have or administrative permissions");
  }
}

async function validateActiveIds(client, table, ids, label) {
  if (!["roles", "permissions"].includes(table)) {
    throw new Error("Invalid RBAC table name");
  }
  if (!ids.length) return;
  const result = await client.query(
    `SELECT id FROM public.${table} WHERE id = ANY($1::bigint[]) AND is_active = TRUE`,
    [ids],
  );
  if (result.rowCount !== ids.length) {
    throw new ApiError(400, `One or more ${label} are missing or inactive`);
  }
}

async function userExists(client, userId, lock = false) {
  const result = await client.query(
    `SELECT id, account_status
     FROM public.users
     WHERE id = $1 AND is_deleted = FALSE${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  if (!result.rows[0]) throw new ApiError(404, "User not found");
  return result.rows[0];
}

async function getEffectivePermissions(client, userId) {
  const result = await client.query(
    `SELECT DISTINCT p.id, p.key, p.name, p.description,
            m.key AS "moduleKey", m.name AS module
     FROM public.permissions p
     JOIN public.permission_modules m ON m.id = p.module_id
     WHERE p.is_active = TRUE
       AND m.is_active = TRUE
       AND NOT EXISTS (
         SELECT 1
         FROM public.user_permissions denied
         WHERE denied.user_id = $1
           AND denied.permission_id = p.id
           AND denied.effect = 'deny'
       )
       AND (
         EXISTS (
           SELECT 1
           FROM public.user_roles ur
           JOIN public.roles r ON r.id = ur.role_id AND r.is_active = TRUE
           JOIN public.role_permissions rp ON rp.role_id = r.id
           WHERE ur.user_id = $1 AND rp.permission_id = p.id
         )
         OR EXISTS (
           SELECT 1
           FROM public.user_permissions granted
           WHERE granted.user_id = $1
             AND granted.permission_id = p.id
             AND granted.effect = 'grant'
         )
       )
     ORDER BY m.name, p.key`,
    [userId],
  );
  return result.rows;
}

async function readUserAccess(client, userId) {
  const rolesResult = await client.query(
    `SELECT r.id, r.code, r.name, r.description
     FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.name`,
    [userId],
  );
  const overridesResult = await client.query(
    `SELECT p.id, p.key, p.name, up.effect,
            m.key AS "moduleKey", m.name AS module
     FROM public.user_permissions up
     JOIN public.permissions p ON p.id = up.permission_id
     JOIN public.permission_modules m ON m.id = p.module_id
     WHERE up.user_id = $1
     ORDER BY p.key`,
    [userId],
  );
  const effectivePermissions = await getEffectivePermissions(client, userId);
  return {
    userId,
    roles: rolesResult.rows,
    roleIds: rolesResult.rows.map((role) => Number(role.id)),
    overrides: overridesResult.rows,
    effectivePermissions,
    permissionIds: effectivePermissions.map((permission) => Number(permission.id)),
  };
}

async function replaceOverrides(client, userId, grants, denials) {
  await client.query("DELETE FROM public.user_permissions WHERE user_id = $1", [userId]);

  if (grants.length) {
    await client.query(
      `INSERT INTO public.user_permissions (user_id, permission_id, effect)
       SELECT $1, permission_id, 'grant'
       FROM UNNEST($2::bigint[]) AS permission_id`,
      [userId, grants],
    );
  }
  if (denials.length) {
    await client.query(
      `INSERT INTO public.user_permissions (user_id, permission_id, effect)
       SELECT $1, permission_id, 'deny'
       FROM UNNEST($2::bigint[]) AS permission_id`,
      [userId, denials],
    );
  }
}

async function roleById(client, roleId, lock = false) {
  const result = await client.query(
    `SELECT id, code, name, is_active
     FROM public.roles WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [roleId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Role not found");
  return result.rows[0];
}

function createRbacService() {
  return {
    async listRoles() {
      const result = await pool.query(
        `SELECT r.id, r.code, r.name, r.description, r.is_active,
                r.created_at, r.updated_at,
                COUNT(DISTINCT ur.user_id)::integer AS "assignedUserCount"
         FROM public.roles r
         LEFT JOIN public.user_roles ur ON ur.role_id = r.id
         GROUP BY r.id
         ORDER BY r.name`,
      );
      return result.rows;
    },

    async createRole(payload) {
      const name = String(payload.name || "").trim();
      const code = String(payload.code || slugify(name)).trim().toUpperCase();
      if (name.length < 2 || name.length > 128) {
        throw new ApiError(400, "Role name must be between 2 and 128 characters");
      }
      if (!/^[A-Z0-9_]{2,64}$/.test(code)) {
        throw new ApiError(400, "Role code must use 2-64 letters, numbers, or underscores");
      }
      const result = await pool.query(
        `INSERT INTO public.roles (code, name, description, is_active)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, code, name, description, is_active`,
        [code, name, String(payload.description || "").trim() || null],
      );
      return result.rows[0];
    },

    async updateRole(roleId, payload, actorRoles = []) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const role = await roleById(client, roleId, true);
        if (role.code === "SUPER_ADMIN" || role.code === "ADMIN") {
          requireSuperAdmin(actorRoles, "Only a Super Admin can edit built-in administrator roles");
        }
        const name = payload.name === undefined ? role.name : String(payload.name).trim();
        if (name.length < 2 || name.length > 128) {
          throw new ApiError(400, "Role name must be between 2 and 128 characters");
        }
        const description = payload.description === undefined
          ? role.description
          : String(payload.description).trim() || null;
        const isActive = payload.isActive === undefined ? role.is_active : payload.isActive;
        const result = await client.query(
          `UPDATE public.roles
           SET name = $1,
               description = $2,
               is_active = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, code, name, description, is_active`,
          [name, description, isActive, roleId],
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteRole(roleId, actorRoles = []) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const role = await roleById(client, roleId, true);
        if (role.code === "SUPER_ADMIN") {
          throw new ApiError(409, "The Super Admin role cannot be deleted");
        }
        if (role.code === "ADMIN") {
          requireSuperAdmin(actorRoles, "Only a Super Admin can delete the Admin role");
        }
        const assigned = await client.query(
          "SELECT 1 FROM public.user_roles WHERE role_id = $1 LIMIT 1",
          [roleId],
        );
        if (assigned.rowCount) {
          throw new ApiError(409, "This role is assigned to users and cannot be deleted");
        }
        await client.query("DELETE FROM public.roles WHERE id = $1", [roleId]);
        await client.query("COMMIT");
        return { id: Number(roleId), deleted: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listModules() {
      const result = await pool.query(
        `SELECT m.id, m.key, m.name, m.description, m.is_active,
                COUNT(p.id)::integer AS "permissionCount"
         FROM public.permission_modules m
         LEFT JOIN public.permissions p ON p.module_id = m.id
         GROUP BY m.id
         ORDER BY m.name`,
      );
      return result.rows;
    },

    async createModule(payload) {
      const name = String(payload.name || "").trim();
      const key = String(payload.key || slugify(name)).trim().toLowerCase();
      if (name.length < 2 || name.length > 128 || !/^[a-z0-9_-]{2,64}$/.test(key)) {
        throw new ApiError(400, "A valid module name and key are required");
      }
      const result = await pool.query(
        `INSERT INTO public.permission_modules (key, name, description)
         VALUES ($1, $2, $3)
         RETURNING id, key, name, description, is_active`,
        [key, name, String(payload.description || "").trim() || null],
      );
      return result.rows[0];
    },

    async updateModule(moduleId, payload) {
      const result = await pool.query(
        `UPDATE public.permission_modules
         SET name = COALESCE($1, name),
             description = CASE WHEN $2::boolean THEN $3 ELSE description END,
             is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, key, name, description, is_active`,
        [
          payload.name === undefined ? null : String(payload.name).trim(),
          payload.description !== undefined,
          payload.description === undefined ? null : String(payload.description).trim() || null,
          payload.isActive === undefined ? null : payload.isActive,
          moduleId,
        ],
      );
      if (!result.rows[0]) throw new ApiError(404, "Permission module not found");
      return result.rows[0];
    },

    async deleteModule(moduleId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const module = await client.query(
          "SELECT id FROM public.permission_modules WHERE id = $1 FOR UPDATE",
          [moduleId],
        );
        if (!module.rowCount) throw new ApiError(404, "Permission module not found");
        const used = await client.query(
          "SELECT 1 FROM public.permissions WHERE module_id = $1 LIMIT 1",
          [moduleId],
        );
        if (used.rowCount) {
          throw new ApiError(409, "A module with permissions cannot be deleted");
        }
        await client.query("DELETE FROM public.permission_modules WHERE id = $1", [moduleId]);
        await client.query("COMMIT");
        return { id: Number(moduleId), deleted: true };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listPermissions() {
      const result = await pool.query(
        `SELECT p.id, p.key, p.key AS code, p.name, p.description,
                (p.is_active AND m.is_active) AS is_active,
                m.is_active AS "moduleIsActive",
                m.id AS "moduleId", m.key AS "moduleKey", m.name AS module
         FROM public.permissions p
         JOIN public.permission_modules m ON m.id = p.module_id
         ORDER BY m.name, p.key`,
      );
      return result.rows;
    },

    async createPermission(payload) {
      const key = String(payload.key || "").trim().toLowerCase();
      const name = String(payload.name || "").trim();
      const moduleId = Number(payload.moduleId);
      if (!/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/.test(key)) {
        throw new ApiError(400, "Permission keys must use module.action format");
      }
      if (name.length < 2 || name.length > 128 || !Number.isSafeInteger(moduleId) || moduleId <= 0) {
        throw new ApiError(400, "Permission name and module are required");
      }
      const module = await pool.query(
        "SELECT key FROM public.permission_modules WHERE id = $1 AND is_active = TRUE",
        [moduleId],
      );
      if (!module.rows[0]) throw new ApiError(400, "Permission module is missing or inactive");
      if (!key.startsWith(`${module.rows[0].key}.`)) {
        throw new ApiError(400, "Permission key must start with its module key");
      }
      const result = await pool.query(
        `INSERT INTO public.permissions (key, name, description, module_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, key, key AS code, name, description, is_active, module_id AS "moduleId"`,
        [key, name, String(payload.description || "").trim() || null, moduleId],
      );
      return result.rows[0];
    },

    async updatePermission(permissionId, payload, actorRoles = []) {
      requireSuperAdmin(actorRoles, "Only a Super Admin can edit permission definitions");
      const current = await pool.query(
        "SELECT key, module_id FROM public.permissions WHERE id = $1",
        [permissionId],
      );
      if (!current.rows[0]) throw new ApiError(404, "Permission not found");
      const nextKey = payload.key === undefined
        ? current.rows[0].key
        : String(payload.key).trim().toLowerCase();
      const nextModuleId = payload.moduleId === undefined
        ? Number(current.rows[0].module_id)
        : Number(payload.moduleId);
      if (!/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/.test(nextKey)) {
        throw new ApiError(400, "Permission keys must use module.action format");
      }
      const module = await pool.query(
        "SELECT key FROM public.permission_modules WHERE id = $1 AND is_active = TRUE",
        [nextModuleId],
      );
      if (!module.rows[0]) throw new ApiError(400, "Permission module is missing or inactive");
      if (!nextKey.startsWith(`${module.rows[0].key}.`)) {
        throw new ApiError(400, "Permission key must start with its module key");
      }
      const result = await pool.query(
        `UPDATE public.permissions
         SET key = COALESCE($1, key),
             name = COALESCE($2, name),
             description = CASE WHEN $3::boolean THEN $4 ELSE description END,
             module_id = COALESCE($5, module_id),
             is_active = COALESCE($6, is_active),
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, key, key AS code, name, description, is_active, module_id AS "moduleId"`,
        [
          nextKey,
          payload.name === undefined ? null : String(payload.name).trim(),
          payload.description !== undefined,
          payload.description === undefined ? null : String(payload.description).trim() || null,
          payload.moduleId === undefined ? null : Number(payload.moduleId),
          payload.isActive === undefined ? null : payload.isActive,
          permissionId,
        ],
      );
      if (!result.rows[0]) throw new ApiError(404, "Permission not found");
      return result.rows[0];
    },

    async getRolePermissions(roleId) {
      const role = await pool.query("SELECT id FROM public.roles WHERE id = $1", [roleId]);
      if (!role.rowCount) throw new ApiError(404, "Role not found");
      const result = await pool.query(
        `SELECT p.id, p.key, p.key AS code, p.name, p.description,
                m.id AS "moduleId", m.key AS "moduleKey", m.name AS module
         FROM public.role_permissions rp
         JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
         JOIN public.permission_modules m ON m.id = p.module_id AND m.is_active = TRUE
         WHERE rp.role_id = $1
         ORDER BY m.name, p.key`,
        [roleId],
      );
      return result.rows;
    },

    async updateRolePermissions(roleId, rawPermissions, actorRoles = [], actorPermissions = []) {
      const permissions = normalizePermissionKeys(rawPermissions);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const role = await roleById(client, roleId, true);
        if (role.code === "SUPER_ADMIN" || role.code === "ADMIN") {
          requireSuperAdmin(actorRoles, "Only a Super Admin can edit built-in administrator role permissions");
        }
        const permissionIds = [];
        if (permissions.length) {
          const allNumeric = permissions.every((permission) => /^\d+$/.test(permission));
          const column = allNumeric ? "p.id::text" : "p.key";
          const result = await client.query(
            `SELECT p.id, p.key
             FROM public.permissions p
             JOIN public.permission_modules m ON m.id = p.module_id AND m.is_active = TRUE
             WHERE ${column} = ANY($1::text[])
               AND p.is_active = TRUE`,
            [permissions],
          );
          if (result.rowCount !== permissions.length) {
            throw new ApiError(400, "One or more permissions are missing or inactive");
          }
          assertCanGrantPermissionKeys(
            result.rows.map((permission) => permission.key),
            actorPermissions,
            actorRoles,
          );
          permissionIds.push(...result.rows.map((permission) => Number(permission.id)));
        }

        await client.query("DELETE FROM public.role_permissions WHERE role_id = $1", [roleId]);
        if (permissionIds.length) {
          await client.query(
            `INSERT INTO public.role_permissions (role_id, permission_id)
             SELECT $1, permission_id
             FROM UNNEST($2::bigint[]) AS permission_id`,
            [roleId, permissionIds],
          );
        }
        await client.query("COMMIT");
        return this.getRolePermissions(roleId);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getUserAccess(userId) {
      const id = Number(userId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "Invalid user ID");
      const client = await pool.connect();
      try {
        await userExists(client, id);
        return await readUserAccess(client, id);
      } finally {
        client.release();
      }
    },

    async getEffectivePermissions(userId) {
      const access = await this.getUserAccess(userId);
      return { userId: access.userId, permissions: access.effectivePermissions };
    },

    async updateUserAccess(actorId, userId, roleIdsValue, permissionIdsValue, actorRoles = [], actorPermissions = []) {
      const id = Number(userId);
      const roleIds = normalizeIds(roleIdsValue, "Role IDs");
      const permissionIds = normalizeIds(permissionIdsValue, "Permission IDs");
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "Invalid user ID");
      if (String(actorId) === String(id)) {
        throw new ApiError(403, "You cannot change your own roles or permissions");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const user = await userExists(client, id, true);
        if (user.account_status !== "approved") {
          throw new ApiError(409, "Only approved users can have their access updated");
        }
        await validateActiveIds(client, "roles", roleIds, "roles");
        await validateActiveIds(client, "permissions", permissionIds, "permissions");

        const selectedRoles = await client.query(
          "SELECT id, code FROM public.roles WHERE id = ANY($1::bigint[])",
          [roleIds],
        );
        if (selectedRoles.rows.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.code))) {
          requireSuperAdmin(actorRoles, "Only a Super Admin can assign administrator roles");
        }
        const rolePermissionKeys = await client.query(
          `SELECT DISTINCT p.key
           FROM public.role_permissions rp
           JOIN public.permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = ANY($1::bigint[]) AND p.is_active = TRUE`,
          [roleIds],
        );
        assertCanGrantPermissionKeys(
          rolePermissionKeys.rows.map((permission) => permission.key),
          actorPermissions,
          actorRoles,
        );

        const baseline = await client.query(
          `SELECT DISTINCT p.id
           FROM public.role_permissions rp
           JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
           JOIN public.permission_modules m ON m.id = p.module_id AND m.is_active = TRUE
           WHERE rp.role_id = ANY($1::bigint[])`,
          [roleIds],
        );
        const baselineIds = new Set(baseline.rows.map((permission) => Number(permission.id)));
        const requestedIds = new Set(permissionIds);
        const grants = permissionIds.filter((permissionId) => !baselineIds.has(permissionId));
        const denials = [...baselineIds].filter((permissionId) => !requestedIds.has(permissionId));
        const grantKeys = grants.length
          ? await client.query(
              "SELECT key FROM public.permissions WHERE id = ANY($1::bigint[])",
              [grants],
            )
          : { rows: [] };
        assertCanGrantPermissionKeys(
          grantKeys.rows.map((permission) => permission.key),
          actorPermissions,
          actorRoles,
        );

        await client.query("DELETE FROM public.user_roles WHERE user_id = $1", [id]);
        if (roleIds.length) {
          await client.query(
            `INSERT INTO public.user_roles (user_id, role_id)
             SELECT $1, role_id FROM UNNEST($2::bigint[]) AS role_id`,
            [id, roleIds],
          );
        }
        await replaceOverrides(client, id, grants, denials);
        await client.query("UPDATE public.users SET updated_at = NOW() WHERE id = $1", [id]);
        await client.query("COMMIT");
      } catch (error) {
        if (error?.code && !error.operation) {
          error.operation = "update user roles and permission overrides";
        }
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("RBAC user access rollback failed:", {
            operation: "rollback user access transaction",
            message: rollbackError.message,
            code: rollbackError.code || "unknown",
          });
        }
        throw error;
      } finally {
        client.release();
      }
      return this.getUserAccess(id);
    },

    async updateUserPermissionOverrides(actorId, userId, grantValues, denyValues, actorRoles = [], actorPermissions = []) {
      const id = Number(userId);
      const grants = normalizeIds(grantValues, "Grant permission IDs");
      const denials = normalizeIds(denyValues, "Deny permission IDs");
      if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, "Invalid user ID");
      if (String(actorId) === String(id)) {
        throw new ApiError(403, "You cannot change your own permissions");
      }
      if (grants.some((permissionId) => denials.includes(permissionId))) {
        throw new ApiError(400, "A permission cannot be both granted and denied");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const user = await userExists(client, id, true);
        if (user.account_status !== "approved") {
          throw new ApiError(409, "Only approved users can have permission overrides");
        }
        await validateActiveIds(client, "permissions", [...grants, ...denials], "permissions");
        const granted = await client.query(
          "SELECT key FROM public.permissions WHERE id = ANY($1::bigint[])",
          [grants],
        );
        assertCanGrantPermissionKeys(
          granted.rows.map((permission) => permission.key),
          actorPermissions,
          actorRoles,
        );
        await replaceOverrides(client, id, grants, denials);
        await client.query("UPDATE public.users SET updated_at = NOW() WHERE id = $1", [id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return this.getUserAccess(id);
    },
  };
}

module.exports = createRbacService;
