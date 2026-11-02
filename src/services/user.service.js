const bcrypt = require("bcrypt");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");
const pool = require("../config/db");

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

function normalizeRoleCodes(roleCodes) {
  const unique = [];
  for (const value of roleCodes || []) {
    const code = String(value || "").trim().toUpperCase();
    if (!code || unique.includes(code)) continue;
    unique.push(code);
  }
  return unique;
}

function validatePermissionIds(permissionIds) {
  if (!Array.isArray(permissionIds)) {
    throw new ApiError(400, "Permission IDs must be an array");
  }
  const ids = permissionIds.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new ApiError(400, "Permission IDs must be unique valid IDs");
  }
  return ids;
}

function assertCanGrantPermissions(permissionKeys, actorRoles, actorPermissions) {
  if ((actorRoles || []).includes("SUPER_ADMIN")) return;
  const actorPermissionSet = new Set(actorPermissions || []);
  const elevated = permissionKeys.some((key) =>
    PRIVILEGED_PERMISSION_KEYS.has(key) ||
    key.startsWith("roles.") ||
    key.startsWith("permissions.") ||
    key.startsWith("modules.") ||
    key.startsWith("users.permissions."),
  );
  if (elevated || permissionKeys.some((key) => !actorPermissionSet.has(key))) {
    throw new ApiError(403, "You cannot grant permissions you do not have or administrative permissions");
  }
}

function createUserService(config) {
  return {
    async listUsers() {
      const users = await userModel.listUsers();
      return users.map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
        account_status: user.account_status || "pending",
        roles: user.roles || [],
        permissions: user.permissions || [],
        created_at: user.created_at,
        updated_at: user.updated_at,
      }));
    },

    async listApplications(params = {}) {
      const status = params.status ? String(params.status).trim().toLowerCase() : null;
      const search = params.search ? String(params.search).trim() : null;
      const limit = Number(params.limit || 25);
      const offset = Number(params.offset || 0);

      const applications = await userModel.listApplications({ status, search, limit, offset });
      return applications.map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone || null,
        account_status: user.account_status || "pending",
        status: user.status,
        location: user.location || null,
        city: user.city || null,
        state: user.state || null,
        address_line1: user.address_line1 || null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        roles: user.roles || [],
      }));
    },

    async getApplication(applicationId) {
      const application = await userModel.getApplicationById(applicationId);
      if (!application) {
        throw new ApiError(404, "Application not found");
      }
      return {
        id: application.id,
        email: application.email,
        full_name: application.full_name,
        phone: application.phone || null,
        status: application.status,
        account_status: application.account_status || "pending",
        roles: application.roles || [],
        profile: {
          address_line1: application.address_line1 || null,
          address_line2: application.address_line2 || null,
          location: application.location || null,
          state: application.state || null,
          city: application.city || null,
          pin_code: application.pin_code || null,
        },
        kyc: {
          pan_last4: application.pan_last4 || null,
          aadhaar_last4: application.aadhaar_last4 || null,
          verification_status: application.verification_status || "pending",
        },
        bank: {
          upi_id: application.upi_id || null,
          account_name: application.account_name || null,
          account_last4: application.account_last4 || null,
          ifsc_code: application.ifsc_code || null,
          verification_status: application.verification_status || "pending",
        },
        created_at: application.created_at,
        updated_at: application.updated_at,
      };
    },

    async approveApplication(currentUserId, applicationId, payload = {}, currentUserRoles = [], currentUserPermissions = []) {
      const application = await userModel.getApplicationById(applicationId);
      if (!application) throw new ApiError(404, "Application not found");
      if (String(application.id) === String(currentUserId)) {
        throw new ApiError(403, "Administrators cannot approve their own account");
      }

      const roleCodes = normalizeRoleCodes(payload.roleCodes || payload.roles || []);
      if (!roleCodes.length) {
        throw new ApiError(400, "At least one role is required to approve an application");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const applicant = await client.query(
          `SELECT id, account_status
           FROM public.users
           WHERE id = $1 AND is_deleted = FALSE
           FOR UPDATE`,
          [applicationId],
        );
        if (!applicant.rows[0]) throw new ApiError(404, "Application not found");
        if (applicant.rows[0].account_status !== "pending") {
          throw new ApiError(409, "This application has already been reviewed");
        }

        const selectedRoles = await client.query(
          `SELECT id, code FROM public.roles
           WHERE code = ANY($1::text[]) AND is_active = TRUE`,
          [roleCodes],
        );
        if (selectedRoles.rowCount !== roleCodes.length) {
          throw new ApiError(400, "One or more selected roles are missing or inactive");
        }
        if (
          selectedRoles.rows.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.code)) &&
          !currentUserRoles.includes("SUPER_ADMIN")
        ) {
          throw new ApiError(403, "Only a Super Admin can assign administrator roles");
        }

        const roleIds = selectedRoles.rows.map((role) => Number(role.id));
        const defaults = await client.query(
          `SELECT DISTINCT p.id, p.key
           FROM public.role_permissions rp
           JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
           JOIN public.permission_modules m ON m.id = p.module_id AND m.is_active = TRUE
           WHERE rp.role_id = ANY($1::bigint[])`,
          [roleIds],
        );
        const defaultIds = new Set(defaults.rows.map((permission) => Number(permission.id)));
        const requestedIds = payload.permissionIds === undefined
          ? [...defaultIds]
          : validatePermissionIds(payload.permissionIds);
        if (requestedIds.length) {
          const validPermissions = await client.query(
            `SELECT p.id, p.key
             FROM public.permissions p
             JOIN public.permission_modules m ON m.id = p.module_id AND m.is_active = TRUE
             WHERE p.id = ANY($1::bigint[]) AND p.is_active = TRUE`,
            [requestedIds],
          );
          if (validPermissions.rowCount !== requestedIds.length) {
            throw new ApiError(400, "One or more selected permissions are missing or inactive");
          }
          assertCanGrantPermissions(
            validPermissions.rows.map((permission) => permission.key),
            currentUserRoles,
            currentUserPermissions,
          );
        }

        const requestedSet = new Set(requestedIds);
        const grants = requestedIds.filter((id) => !defaultIds.has(id));
        const denials = [...defaultIds].filter((id) => !requestedSet.has(id));

        await client.query(
          `UPDATE public.users
           SET account_status = 'approved', status = 'active', approved_by = $2, rejection_reason = NULL, updated_at = NOW()
           WHERE id = $1`,
          [applicationId, currentUserId]
        );

        await client.query("DELETE FROM public.user_roles WHERE user_id = $1", [applicationId]);
        if (roleIds.length) {
          await client.query(
            `INSERT INTO public.user_roles (user_id, role_id)
             SELECT $1, role_id FROM UNNEST($2::bigint[]) AS role_id`,
            [applicationId, roleIds],
          );
        }

        await client.query("DELETE FROM public.user_permissions WHERE user_id = $1", [applicationId]);
        if (grants.length) {
          await client.query(
            `INSERT INTO public.user_permissions (user_id, permission_id, effect)
             SELECT $1, permission_id, 'grant'
             FROM UNNEST($2::bigint[]) AS permission_id`,
            [applicationId, grants],
          );
        }
        if (denials.length) {
          await client.query(
            `INSERT INTO public.user_permissions (user_id, permission_id, effect)
             SELECT $1, permission_id, 'deny'
             FROM UNNEST($2::bigint[]) AS permission_id`,
            [applicationId, denials],
          );
        }
        const review = await client.query(
          `INSERT INTO public.registration_reviews (user_id, reviewed_by, decision, notes)
           VALUES ($1, $2, 'approved', $3)
           RETURNING id`,
          [applicationId, currentUserId, payload.notes || "Approved by administrator"],
        );
        await client.query("COMMIT");
        return {
          id: applicationId,
          account_status: "approved",
          roles: roleCodes,
          reviewId: review.rows[0].id,
          permissions: requestedIds,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async rejectApplication(currentUserId, applicationId, reason) {
      const application = await userModel.getApplicationById(applicationId);
      if (!application) throw new ApiError(404, "Application not found");
      if (String(application.id) === String(currentUserId)) {
        throw new ApiError(403, "Administrators cannot reject their own account");
      }

      await userModel.updateUser(applicationId, { account_status: "rejected", rejection_reason: String(reason || "").trim(), status: "inactive" });
      await userModel.createRegistrationReview(applicationId, "rejected", currentUserId, String(reason || "").trim());
      return { id: applicationId, account_status: "rejected", rejection_reason: reason || "" };
    },

    async requestCorrections(currentUserId, applicationId, notes) {
      const application = await userModel.getApplicationById(applicationId);
      if (!application) throw new ApiError(404, "Application not found");
      await userModel.updateUser(applicationId, { account_status: "under_review", rejection_reason: null });
      await userModel.createRegistrationReview(applicationId, "under_review", currentUserId, String(notes || "").trim());
      return { id: applicationId, account_status: "under_review" };
    },

    async getUserRoles(userId) {
      const user = await userModel.findById(userId);
      if (!user) throw new ApiError(404, "User not found");
      const roles = await userModel.getRolesForUser(userId);
      return { userId, roles };
    },

async assignUserRoles(
  currentUserId,
  userId,
  roleCodes,
  currentUserRoles = [],
  currentUserPermissions = [],
) {
  // Do not allow administrators to change their own privileged roles.
  if (String(currentUserId) === String(userId)) {
    throw new ApiError(
      403,
      "You cannot change your own privileged roles"
    );
  }

  const normalized = normalizeRoleCodes(roleCodes);

  if (normalized.length === 0) {
    throw new ApiError(400, "Select at least one role");
  }

  const client = await pool.connect();
  let roleIds = [];
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `SELECT id, account_status
       FROM public.users
       WHERE id = $1 AND is_deleted = FALSE
       FOR UPDATE`,
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) throw new ApiError(404, "User not found");
    if (user.account_status !== "approved") {
      throw new ApiError(409, "Roles can only be updated for approved users");
    }

    const rolesResult = await client.query(
      `SELECT id, code
       FROM public.roles
       WHERE code = ANY($1::text[]) AND is_active = TRUE`,
      [normalized],
    );
    if (rolesResult.rowCount !== normalized.length) {
      throw new ApiError(400, "One or more selected roles are missing or inactive");
    }
    if (
      rolesResult.rows.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.code)) &&
      !currentUserRoles.includes("SUPER_ADMIN")
    ) {
      throw new ApiError(403, "Only a Super Admin can assign administrator roles");
    }

    roleIds = rolesResult.rows.map((role) => Number(role.id));
    const rolePermissions = await client.query(
      `SELECT DISTINCT p.key
       FROM public.role_permissions rp
       JOIN public.permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
       WHERE rp.role_id = ANY($1::bigint[])`,
      [roleIds],
    );
    assertCanGrantPermissions(
      rolePermissions.rows.map((permission) => permission.key),
      currentUserRoles,
      currentUserPermissions,
    );
    await client.query("DELETE FROM public.user_roles WHERE user_id = $1", [userId]);
    if (roleIds.length) {
      await client.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         SELECT $1, role_id FROM UNNEST($2::bigint[]) AS role_id`,
        [userId, roleIds],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    userId,
    assignedRoleCodes: normalized,
    message: "User roles updated successfully",
  };
},

    async getUser(userId) {
      const profile = await userModel.getUserProfile(userId);
      if (!profile) {
        throw new ApiError(404, "User not found");
      }
      return {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        status: profile.status,
        account_status: profile.account_status || "pending",
        roles: profile.roles || [],
        permissions: profile.permissions || [],
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      };
    },

    async createUser(payload) {
      const normalizedEmail = String(payload.email || "").trim().toLowerCase();
      const fullName = String(payload.fullName || "").trim();
      if (!normalizedEmail || !fullName) {
        throw new ApiError(400, "Email and full name are required");
      }
      if (!payload.password || String(payload.password).length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters long");
      }

      const existing = await userModel.findByEmail(normalizedEmail);
      if (existing) {
        throw new ApiError(409, "A user with this email already exists");
      }

      const passwordHash = await bcrypt.hash(payload.password, 12);
      const user = await userModel.createUser({
        email: normalizedEmail,
        fullName,
        passwordHash,
        status: payload.status || "active",
        accountStatus: payload.accountStatus || "approved",
      });

      return this.getUser(user.id);
    },

    async updateUser(userId, payload) {
      const allowedChanges = {};
      if (payload.email) allowedChanges.email = String(payload.email).trim().toLowerCase();
      if (payload.fullName) allowedChanges.full_name = String(payload.fullName).trim();
      if (payload.status) allowedChanges.status = payload.status;
      if (payload.accountStatus) allowedChanges.account_status = payload.accountStatus;

      if (Object.keys(allowedChanges).length) {
        await userModel.updateUser(userId, allowedChanges);
      }

      return this.getUser(userId);
    },

    async updateStatus(userId, status) {
      if (!status || !["active", "inactive", "pending", "under_review", "approved", "rejected", "suspended"].includes(status)) {
        throw new ApiError(400, "Status must be a valid account status");
      }

      const current = await userModel.findById(userId);
      if (!current) {
        throw new ApiError(404, "User not found");
      }
      const accountStatus = status === "active" || status === "inactive"
        ? (status === "active" || current.account_status === "approved"
          ? "approved"
          : current.account_status)
        : status;
      const user = await userModel.updateUser(userId, {
        status: status === "active" || status === "approved" ? "active" : "inactive",
        account_status: accountStatus,
      });
      if (!user) {
        throw new ApiError(404, "User not found");
      }
      return this.getUser(userId);
    },

    async listRoles() {
      return userModel.getAllRoles();
    },

    async listPermissions() {
      return userModel.getAllPermissions();
    },

    async getRolePermissions(roleId) {
      const role = await userModel.getAllRoles();
      const found = role.find((item) => String(item.id) === String(roleId));
      if (!found) throw new ApiError(404, "Role not found");
      return userModel.getRolePermissions(found.id);
    },

    async updateRolePermissions(roleId, permissionKeys) {
      const roles = await userModel.getAllRoles();
      const found = roles.find((item) => String(item.id) === String(roleId));
      if (!found) throw new ApiError(404, "Role not found");
      const permissions = await userModel.setRolePermissions(found.id, permissionKeys || []);
      return { roleId: found.id, permissions };
    },
  };
}

module.exports = createUserService;
