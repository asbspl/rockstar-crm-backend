
const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

function createAdminRegistrationService() {
  return {
    async listRegistrations({ status, search, page = 1, limit = 20 }) {
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset = (safePage - 1) * safeLimit;

      const values = [];
      const conditions = ["u.is_deleted = FALSE"];

      if (status) {
        values.push(status);
        conditions.push(`u.account_status = $${values.length}`);
      }

      if (search) {
        values.push(`%${search.trim()}%`);
        conditions.push(
          `(u.full_name ILIKE $${values.length}
            OR u.email ILIKE $${values.length}
            OR u.phone ILIKE $${values.length})`
        );
      }

      const where = conditions.join(" AND ");

      const result = await pool.query(
        `SELECT
           u.id,
           u.full_name,
           u.email,
           u.phone,
           u.status,
           u.account_status,
           u.created_at,
           p.address_line1,
           p.address_line2,
           p.location,
           p.state,
           p.city,
           p.pin_code,
           k.verification_status AS kyc_status
         FROM public.users u
         LEFT JOIN public.user_profiles p ON p.user_id = u.id
         LEFT JOIN public.user_kyc k ON k.user_id = u.id
         WHERE ${where}
         ORDER BY u.created_at DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        [...values, safeLimit, offset]
      );

      return {
        items: result.rows,
        page: safePage,
        limit: safeLimit,
      };
    },

    async getRegistrationDetails(userId) {
      const result = await pool.query(
        `SELECT
           u.id,
           u.full_name,
           u.email,
           u.phone,
           u.status,
           u.account_status,
           u.created_at,
           p.address_line1,
           p.address_line2,
           p.location,
           p.state,
           p.city,
           p.pin_code,
           k.pan_last4,
           k.aadhaar_last4,
           k.verification_status AS kyc_status,
           k.review_notes AS kyc_review_notes
         FROM public.users u
         LEFT JOIN public.user_profiles p ON p.user_id = u.id
         LEFT JOIN public.user_kyc k ON k.user_id = u.id
         WHERE u.id = $1 AND u.is_deleted = FALSE`,
        [userId]
      );

      if (!result.rows[0]) {
        throw new ApiError(404, "Registration not found");
      }

      const bankResult = await pool.query(
        `SELECT
           id,
           upi_id,
           account_name,
           account_last4,
           ifsc_code,
           verification_status
         FROM public.user_bank_accounts
         WHERE user_id = $1`,
        [userId]
      ).catch((error) => {
        if (error.code === "42P01") return { rows: [] };
        throw error;
      });

      return {
        ...result.rows[0],
        bankAccounts: bankResult.rows.map((account) => ({
          ...account,
          upi_id: account.upi_id
            ? `${account.upi_id.slice(0, 2)}***`
            : null,
          ifsc_code: account.ifsc_code
            ? `${account.ifsc_code.slice(0, 4)}****`
            : null,
        })),
      };
    },

    async reviewRegistration(userId, adminId, decision, notes) {
      if (!["approved", "rejected", "under_review"].includes(decision)) {
        throw new ApiError(400, "Invalid review decision");
      }

      if (decision === "rejected" && !String(notes || "").trim()) {
        throw new ApiError(400, "A rejection reason is required");
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const userResult = await client.query(
          `SELECT id, account_status
           FROM public.users
           WHERE id = $1 AND is_deleted = FALSE
           FOR UPDATE`,
          [userId]
        );

        if (!userResult.rows[0]) {
          throw new ApiError(404, "Registration not found");
        }

        const user = userResult.rows[0];

        if (user.account_status === "approved" && decision !== "approved") {
          throw new ApiError(
            409,
            "An approved account cannot be changed through registration review"
          );
        }

        await client.query(
          `UPDATE public.users
           SET account_status = $1, updated_at = NOW()
           WHERE id = $2`,
          [decision, userId]
        );

        const reviewResult = await client.query(
          `UPDATE public.registration_reviews
           SET reviewed_by = $1, decision = $2, notes = $3
           WHERE user_id = $4 AND decision = 'pending'
           RETURNING user_id`,
          [adminId, decision, notes?.trim() || null, userId]
        );

        if (reviewResult.rowCount === 0) {
          await client.query(
            `INSERT INTO public.registration_reviews
               (user_id, reviewed_by, decision, notes)
             VALUES ($1, $2, $3, $4)`,
            [userId, adminId, decision, notes?.trim() || null]
          );
        }

        await client.query("COMMIT");

        return {
          userId,
          accountStatus: decision,
          message: "Registration review updated",
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async assignRoles(userId, roleIds) {
      if (!Array.isArray(roleIds) || roleIds.length === 0) {
        throw new ApiError(400, "Select at least one role");
      }

      const ids = [...new Set(roleIds.map(Number))];

      if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new ApiError(400, "Invalid role ID");
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const userResult = await client.query(
          `SELECT id, account_status
           FROM public.users
           WHERE id = $1 AND is_deleted = FALSE
           FOR UPDATE`,
          [userId]
        );

        const user = userResult.rows[0];

        if (!user) throw new ApiError(404, "User not found");

        if (user.account_status !== "approved") {
          throw new ApiError(
            409,
            "Roles can only be assigned to approved users"
          );
        }

        const rolesResult = await client.query(
          `SELECT id FROM public.roles WHERE id = ANY($1::int[])`,
          [ids]
        );

        if (rolesResult.rowCount !== ids.length) {
          throw new ApiError(400, "One or more roles do not exist");
        }

        for (const roleId of ids) {
          await client.query(
            `INSERT INTO public.user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [userId, roleId]
          );
        }

        await client.query("COMMIT");

        return { userId, assignedRoleIds: ids };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

module.exports = createAdminRegistrationService;
