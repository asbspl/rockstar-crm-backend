const bcrypt = require("bcrypt");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");
const pool = require("../config/db");

function normalizeRoleCodes(roleCodes) {
  const unique = [];
  for (const value of roleCodes || []) {
    const code = String(value || "").trim();
    if (!code || unique.includes(code)) continue;
    unique.push(code);
  }
  return unique;
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

    async approveApplication(currentUserId, applicationId, payload = {}) {
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

        const roleIds = [];
        for (const code of roleCodes) {
          const roleId = await userModel.getRoleIdByCode(code);
          if (!roleId) {
            throw new ApiError(400, `Role not found: ${code}`);
          }
          roleIds.push(roleId);
        }

        await client.query(
          `UPDATE public.users
           SET account_status = 'approved', status = 'active', approved_by = $2, rejection_reason = NULL, updated_at = NOW()
           WHERE id = $1`,
          [applicationId, currentUserId]
        );

        await client.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [applicationId]);
        if (roleIds.length) {
          const values = roleIds.map((roleId, index) => `($1, $${index + 2})`).join(", ");
          await client.query(`INSERT INTO public.user_roles (user_id, role_id) VALUES ${values}`, [applicationId, ...roleIds]);
        }

        const review = await userModel.createRegistrationReview(applicationId, "approved", currentUserId, payload.notes || "Approved by administrator");
        await client.query("COMMIT");
        return { id: applicationId, account_status: "approved", roles: roleCodes, reviewId: review.id };
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

    async assignUserRoles(currentUserId, userId, roleCodes) {
      if (String(currentUserId) === String(userId)) {
        throw new ApiError(403, "Administrators cannot modify their own privileged roles through the ordinary role assignment API");
      }

      const roleIds = [];
      const normalized = normalizeRoleCodes(roleCodes);
      for (const code of normalized) {
        const roleId = await userModel.getRoleIdByCode(code);
        if (!roleId) {
          throw new ApiError(400, `Role not found: ${code}`);
        }
        roleIds.push(roleId);
      }
      await userModel.assignRolesToUser(userId, roleIds);
      return { userId, roles: normalized };
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

      if (Array.isArray(payload.roles) && payload.roles.length) {
        const roleIds = [];
        for (const roleCode of payload.roles) {
          const roleId = await userModel.getRoleIdByCode(roleCode);
          if (roleId) roleIds.push(roleId);
        }
        await userModel.assignRolesToUser(user.id, roleIds);
      }

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

      if (Array.isArray(payload.roles)) {
        const roleIds = [];
        for (const roleCode of payload.roles) {
          const roleId = await userModel.getRoleIdByCode(roleCode);
          if (roleId) roleIds.push(roleId);
        }
        await userModel.assignRolesToUser(userId, roleIds);
      }

      return this.getUser(userId);
    },

    async updateStatus(userId, status) {
      if (!status || !["active", "inactive", "pending", "under_review", "approved", "rejected", "suspended"].includes(status)) {
        throw new ApiError(400, "Status must be a valid account status");
      }

      const user = await userModel.updateUser(userId, { status, account_status: status === "active" ? "approved" : status });
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
