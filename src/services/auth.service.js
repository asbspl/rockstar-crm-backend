const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");

function signAccessToken(user, config) {
  return jwt.sign(
    {
      sub: String(user.id),
      jti: crypto.randomUUID(),
      email: user.email,
      roles: user.roles || [],
      permissions: user.permissions || [],
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: config.jwtAccessExpiresIn,
    }
  );
}

function signRefreshToken(user, config) {
  return jwt.sign(
    {
      sub: String(user.id),
      jti: crypto.randomUUID(),
      type: "refresh",
      email: user.email,
    },
    config.jwtRefreshSecret,
    {
      algorithm: "HS256",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: config.jwtRefreshExpiresIn,
    }
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeAccountStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status || ["pending", "under_review", "approved"].includes(status)) {
    return "approved";
  }
  if (["rejected", "suspended"].includes(status)) {
    return status;
  }
  return "approved";
}

function getAccountStatusMessage(status) {
  switch (status) {
    case "pending":
      return "Account is pending approval";
    case "under_review":
      return "Account is under review";
    case "rejected":
      return "Account has been rejected";
    case "suspended":
      return "Account is suspended";
    default:
      return "Account is not active";
  }
}

function validatePassword(password) {
  if (!password || typeof password !== "string") return false;
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function escapeLike(value) {
  return String(value).replace(/[%_]/g, "\\$&");
}

function normalizePrivacyAccepted(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function getMultipartFile(files, fieldName) {
  if (!files || !files[fieldName]) return null;
  if (Array.isArray(files[fieldName])) return files[fieldName][0] || null;
  return files[fieldName] || null;
}

function createAuthService(config) {
  return {
    async register(payload = {}, files = {}) {
      const normalizedPayload = payload || {};
      const email = String(normalizedPayload.email || "").trim().toLowerCase();
      const fullName = String(normalizedPayload.name || normalizedPayload.fullName || "").trim();
      const phone = String(normalizedPayload.phone || "").trim();
      const password = String(normalizedPayload.password || "");
      const addressLine1 = String(normalizedPayload.addressLine1 || normalizedPayload.address_line1 || "").trim();
      const addressLine2 = String(normalizedPayload.addressLine2 || normalizedPayload.address_line2 || "").trim();
      const location = String(normalizedPayload.location || "").trim();
      const state = String(normalizedPayload.state || "").trim();
      const city = String(normalizedPayload.city || "").trim();
      const pinCode = String(normalizedPayload.pinCode || normalizedPayload.pin_code || "").trim();
      const privacyAccepted = normalizePrivacyAccepted(normalizedPayload.privacyAccepted);

      if (!privacyAccepted) {
        throw new ApiError(400, "Privacy policy must be accepted");
      }
      if (!email || !fullName || !phone || !addressLine1 || !location || !state || !city || !pinCode || !password) {
        throw new ApiError(400, "All required profile fields must be provided");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "A valid email is required");
      }
      if (!validatePassword(password)) {
        throw new ApiError(400, "Password must be at least 8 characters long and include uppercase, lowercase, and number characters");
      }
      if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) {
        throw new ApiError(400, "A valid phone number is required");
      }

      const existingUser = await userModel.findByEmail(email);
      if (existingUser) {
        throw new ApiError(409, "An account with this email already exists");
      }

      const duplicatePhone = await pool.query(
        `SELECT id FROM public.users WHERE phone = $1 AND is_deleted = FALSE LIMIT 1`,
        [phone]
      );
      if (duplicatePhone.rowCount) {
        throw new ApiError(409, "An account with this phone number already exists");
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const userResult = await client.query(
          `INSERT INTO public.users (email, full_name, phone, password_hash, status, account_status, is_deleted)
           VALUES ($1, $2, $3, $4, 'active', 'pending', FALSE)
           RETURNING id, email, full_name, account_status`,
          [email, fullName, phone, passwordHash]
        );
        const user = userResult.rows[0];

        await client.query(
          `INSERT INTO public.user_profiles (user_id, full_name, address_line1, address_line2, location, state, city, pin_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.id, fullName, addressLine1, addressLine2 || null, location, state, city, pinCode]
        );

        const panRaw = String(normalizedPayload.panNumber || normalizedPayload.pan || "").trim();
        const aadhaarRaw = String(normalizedPayload.aadhaarNumber || normalizedPayload.aadhaar || "").trim();
        const panLast4 = panRaw ? panRaw.replace(/\s+/g, "").slice(-4) : null;
        const aadhaarLast4 = aadhaarRaw ? aadhaarRaw.replace(/\s+/g, "").slice(-4) : null;

        await client.query(
          `INSERT INTO public.user_kyc (user_id, pan_last4, aadhaar_last4, verification_status, review_notes)
           VALUES ($1, $2, $3, 'pending', $4)`,
          [user.id, panLast4, aadhaarLast4, "Registration submitted"]
        );

        const upiId = String(
          normalizedPayload.paymentUpi || normalizedPayload.upiId || normalizedPayload.upi || ""
        ).trim();
        const accountName = String(normalizedPayload.accountName || "").trim();
        const accountNumber = String(normalizedPayload.accountNumber || "").trim();
        const ifscCode = String(normalizedPayload.ifscCode || "").trim();

        if (upiId || accountName || accountNumber || ifscCode) {
          await client.query(
            `INSERT INTO public.user_bank_accounts (user_id, upi_id, account_name, account_number_encrypted, account_last4, ifsc_code, verification_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [user.id, upiId || null, accountName || null, Buffer.from(accountNumber || ""), accountNumber ? accountNumber.slice(-4) : null, ifscCode || null]
          );
        }

        const panDocument = getMultipartFile(files, "panCard");
        const aadhaarDocument = getMultipartFile(files, "aadhaarCard");

        for (const [documentType, documentFile, fieldName] of [
          ["pan_card", panDocument, "panCard"],
          ["aadhaar_card", aadhaarDocument, "aadhaarCard"],
        ]) {
          if (!documentFile) continue;

          const originalName = String(documentFile.originalname || fieldName || documentType).trim();
          const mimeType = String(documentFile.mimetype || "application/octet-stream").trim();
          const fileSize = Number(documentFile.size || 0);
          if (!originalName || !mimeType || fileSize <= 0) continue;

          await client.query(
            `INSERT INTO public.user_documents (user_id, document_type, storage_key, original_filename, mime_type, file_size_bytes, verification_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [user.id, documentType, `${documentType}/${crypto.randomUUID()}`, originalName, mimeType, fileSize]
          );
        }

        await client.query(
          `INSERT INTO public.registration_reviews (user_id, reviewed_by, decision, notes)
           VALUES ($1, NULL, 'pending', $2)`,
          [user.id, "Application submitted for review"]
        );

        await client.query("COMMIT");

        return {
          userId: user.id,
          applicationId: user.id,
          accountStatus: "pending",
          message: "Registration submitted successfully and is pending review.",
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async login(email, password, metadata = {}) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      await userModel.ensureRequiredPermissions();
      const user = await userModel.findByEmail(normalizedEmail);
      if (!user) {
        throw new ApiError(401, "Email or password is incorrect");
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        throw new ApiError(401, "Email or password is incorrect");
      }

      if (user.is_deleted) {
        throw new ApiError(401, "Account is disabled or inactive");
      }
      if (user.status !== "active") {
        throw new ApiError(401, "Account is disabled or inactive");
      }

      const accountStatus = normalizeAccountStatus(user.account_status);
      if (accountStatus !== "approved") {
        throw new ApiError(401, getAccountStatusMessage(accountStatus));
      }

      const roles = await userModel.getRolesForUser(user.id);
      const permissions = await userModel.getPermissionsForUser(user.id);
      const safeUser = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
        account_status: accountStatus,
        roles,
        permissions,
      };

      const accessToken = signAccessToken(safeUser, config);
      const refreshToken = signRefreshToken(safeUser, config);
      const refreshHash = hashToken(refreshToken);

      await userModel.saveRefreshToken(user.id, refreshHash, {
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        userAgent: metadata.userAgent || "unknown",
        ipAddress: metadata.ipAddress || null,
      });

      await userModel.touchLastLogin(user.id);

      return {
        token: accessToken,
        accessToken,
        refreshToken,
        user: {
          id: safeUser.id,
          email: safeUser.email,
          full_name: safeUser.full_name,
          status: safeUser.status,
          account_status: safeUser.account_status,
          roles: safeUser.roles,
          permissions: safeUser.permissions,
        },
      };
    },

    async logout(payload) {
      if (payload.refreshToken) {
        const refreshHash = hashToken(payload.refreshToken);
        await userModel.revokeRefreshToken(payload.userId, refreshHash);
      } else {
        await userModel.revokeAllRefreshTokens(payload.userId);
      }
      return { revoked: true };
    },

    async getCurrentUser(userId) {
      const profile = await userModel.getUserProfile(userId);
      if (!profile) throw new ApiError(401, "Authenticated user no longer exists");
      if (profile.status !== "active") throw new ApiError(401, "Account is disabled or inactive");

      const accountStatus = normalizeAccountStatus(profile.account_status);
      if (accountStatus !== "approved") {
        throw new ApiError(401, getAccountStatusMessage(accountStatus));
      }
      return {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone || null,
        status: profile.status,
        account_status: accountStatus,
        roles: profile.roles || [],
        permissions: profile.permissions || [],
        last_login_at: profile.last_login_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      };
    },

    async getRegistrationStatus(userId) {
      const user = await userModel.getRegistrationStatus(userId);
      if (!user) throw new ApiError(404, "User not found");
      return {
        userId: user.id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
        account_status: normalizeAccountStatus(user.account_status),
        approved_by: user.approved_by || null,
        rejection_reason: user.rejection_reason || null,
        last_login_at: user.last_login_at,
      };
    },

    async refreshAccessToken(refreshToken, metadata = {}) {
      if (!refreshToken) {
        throw new ApiError(401, "Refresh token is required");
      }

      const tokenHash = hashToken(refreshToken);
      const session = await userModel.getActiveRefreshToken(tokenHash);
      if (!session) {
        throw new ApiError(401, "Refresh token is invalid or expired");
      }

      let payload;
      try {
        payload = jwt.verify(refreshToken, config.jwtRefreshSecret, {
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        });
      } catch {
        throw new ApiError(401, "Refresh token is invalid or expired");
      }

      const user = await userModel.findById(payload.sub);
      if (!user || user.status !== "active") {
        throw new ApiError(401, "Authenticated user no longer exists");
      }

      const accountStatus = normalizeAccountStatus(user.account_status);
      if (accountStatus !== "approved") {
        throw new ApiError(401, getAccountStatusMessage(accountStatus));
      }

      await userModel.revokeRefreshToken(user.id, tokenHash);

      const roles = await userModel.getRolesForUser(user.id);
      const permissions = await userModel.getPermissionsForUser(user.id);
      const safeUser = { ...user, roles, permissions };
      const accessToken = signAccessToken(safeUser, config);
      const newRefreshToken = signRefreshToken(safeUser, config);
      const newRefreshHash = hashToken(newRefreshToken);

      await userModel.saveRefreshToken(user.id, newRefreshHash, {
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        userAgent: metadata.userAgent || "unknown",
        ipAddress: metadata.ipAddress || null,
      });

      return {
        token: accessToken,
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          status: user.status,
          account_status: accountStatus,
          roles,
          permissions,
        },
      };
    },

    async changePassword(userId, currentPassword, newPassword) {
      if (!newPassword || newPassword.length < 8) {
        throw new ApiError(400, "New password must be at least 8 characters long");
      }

      const user = await userModel.findById(userId);
      if (!user) throw new ApiError(401, "Authenticated user no longer exists");

      const matches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!matches) {
        throw new ApiError(401, "Current password is incorrect");
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await userModel.updatePassword(userId, hash);
      await userModel.revokeAllRefreshTokens(userId);

      return { changed: true };
    },

    async requestPasswordReset(email) {
      const user = await userModel.findByEmail(email);
      if (!user) {
        return { requested: true, resetToken: null };
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      await userModel.savePasswordResetToken(user.id, tokenHash, {
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      if (config.nodeEnv !== "production") {
        return { requested: true, resetToken: token };
      }

      return { requested: true, resetToken: null };
    },

    async resetPassword(resetToken, newPassword) {
      if (!resetToken) throw new ApiError(400, "Password reset token is required");
      if (!newPassword || newPassword.length < 8) {
        throw new ApiError(400, "New password must be at least 8 characters long");
      }

      const tokenHash = hashToken(resetToken);
      const resetRecord = await userModel.getValidPasswordResetToken(tokenHash);
      if (!resetRecord) {
        throw new ApiError(401, "Password reset token is invalid or expired");
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await userModel.updatePassword(resetRecord.user_id, hash);
      await userModel.markPasswordResetTokenUsed(tokenHash);
      await userModel.revokeAllRefreshTokens(resetRecord.user_id);

      return { reset: true };
    },
  };
}

module.exports = createAuthService;