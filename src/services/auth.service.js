
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");
const {
  sendPasswordResetEmail ,
} = require("../utils/email");

// ============================================================
// TOKEN HELPERS
// ============================================================

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
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// ============================================================
// ACCOUNT STATUS HELPERS
// ============================================================

function normalizeAccountStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  if (
    [
      "pending",
      "under_review",
      "approved",
      "rejected",
      "suspended",
    ].includes(status)
  ) {
    return status;
  }

  // Unknown or missing statuses must never grant approval.
  return "pending";
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

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validatePassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

function normalizePrivacyAccepted(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

function getMultipartFile(files, fieldName) {
  if (!files || !files[fieldName]) {
    return null;
  }

  if (Array.isArray(files[fieldName])) {
    return files[fieldName][0] || null;
  }

  return files[fieldName];
}

// ============================================================
// PASSWORD RESET ELIGIBILITY
// ============================================================


function isPasswordResetEligible(user) {
  if (!user) return false;

  const isLocked =
    user.locked_until != null &&
    new Date(user.locked_until).getTime() > Date.now();

  return (
    String(user.status || "").toLowerCase() === "active" &&
    String(user.account_status || "").toLowerCase() === "approved" &&
    user.is_deleted !== true &&
    !isLocked
  );
}


// ============================================================
// AUTH SERVICE
// ============================================================

function createAuthService(config, dependencies = {}) {
  const authModel = dependencies.userModel || userModel;

  const sendResetEmail =
    dependencies.sendPasswordResetEmail || sendPasswordResetEmail;

    

  return {
    // ========================================================
    // REGISTER
    // ========================================================

    async register(payload = {}, files = {}) {
      const normalizedPayload = payload || {};

      const email = String(normalizedPayload.email || "")
        .trim()
        .toLowerCase();

      const fullName = String(
        normalizedPayload.name ||
          normalizedPayload.fullName ||
          ""
      ).trim();

      const phone = String(normalizedPayload.phone || "").trim();
      const password = String(normalizedPayload.password || "");

      const addressLine1 = String(
        normalizedPayload.addressLine1 ||
          normalizedPayload.address_line1 ||
          ""
      ).trim();

      const addressLine2 = String(
        normalizedPayload.addressLine2 ||
          normalizedPayload.address_line2 ||
          ""
      ).trim();

      const location = String(
        normalizedPayload.location || ""
      ).trim();

      const state = String(normalizedPayload.state || "").trim();
      const city = String(normalizedPayload.city || "").trim();

      const pinCode = String(
        normalizedPayload.pinCode ||
          normalizedPayload.pin_code ||
          ""
      ).trim();

      const privacyAccepted = normalizePrivacyAccepted(
        normalizedPayload.privacyAccepted
      );

      if (!privacyAccepted) {
        throw new ApiError(
          400,
          "Privacy policy must be accepted"
        );
      }

      if (
        !email ||
        !fullName ||
        !phone ||
        !addressLine1 ||
        !location ||
        !state ||
        !city ||
        !pinCode ||
        !password
      ) {
        throw new ApiError(
          400,
          "All required profile fields must be provided"
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "A valid email is required");
      }

      if (!validatePassword(password)) {
        throw new ApiError(
          400,
          "Password must be at least 8 characters long and include uppercase, lowercase, and number characters"
        );
      }

      if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) {
        throw new ApiError(
          400,
          "A valid phone number is required"
        );
      }

      const existingUser = await authModel.findByEmail(email);

      if (existingUser) {
        throw new ApiError(
          409,
          "An account with this email already exists"
        );
      }

      const duplicatePhone = await pool.query(
        `SELECT id
         FROM public.users
         WHERE phone = $1 AND is_deleted = FALSE
         LIMIT 1`,
        [phone]
      );

      if (duplicatePhone.rowCount) {
        throw new ApiError(
          409,
          "An account with this phone number already exists"
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const userResult = await client.query(
          `INSERT INTO public.users
             (email, full_name, phone, password_hash,
              status, account_status, is_deleted)
           VALUES ($1, $2, $3, $4, 'active', 'pending', FALSE)
           RETURNING id, email, full_name, account_status`,
          [email, fullName, phone, passwordHash]
        );

        const user = userResult.rows[0];

        await client.query(
          `INSERT INTO public.user_profiles
             (user_id, full_name, address_line1, address_line2,
              location, state, city, pin_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            fullName,
            addressLine1,
            addressLine2 || null,
            location,
            state,
            city,
            pinCode,
          ]
        );

        const panRaw = String(
          normalizedPayload.panNumber ||
            normalizedPayload.pan ||
            ""
        ).trim();

        const aadhaarRaw = String(
          normalizedPayload.aadhaarNumber ||
            normalizedPayload.aadhaar ||
            ""
        ).trim();

        const panLast4 = panRaw
          ? panRaw.replace(/\s+/g, "").slice(-4)
          : null;

        const aadhaarLast4 = aadhaarRaw
          ? aadhaarRaw.replace(/\s+/g, "").slice(-4)
          : null;

        await client.query(
          `INSERT INTO public.user_kyc
             (user_id, pan_last4, aadhaar_last4,
              verification_status, review_notes)
           VALUES ($1, $2, $3, 'pending', $4)`,
          [
            user.id,
            panLast4,
            aadhaarLast4,
            "Registration submitted",
          ]
        );

        const upiId = String(
          normalizedPayload.paymentUpi ||
            normalizedPayload.upiId ||
            normalizedPayload.upi ||
            ""
        ).trim();

        const accountName = String(
          normalizedPayload.accountName || ""
        ).trim();

        const accountNumber = String(
          normalizedPayload.accountNumber || ""
        ).trim();

        const ifscCode = String(
          normalizedPayload.ifscCode || ""
        ).trim();

        if (upiId || accountName || accountNumber || ifscCode) {
          await client.query(
            `INSERT INTO public.user_bank_accounts
               (user_id, upi_id, account_name,
                account_number_encrypted, account_last4,
                ifsc_code, verification_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [
              user.id,
              upiId || null,
              accountName || null,
              Buffer.from(accountNumber || ""),
              accountNumber
                ? accountNumber.slice(-4)
                : null,
              ifscCode || null,
            ]
          );
        }

        const panDocument = getMultipartFile(files, "panCard");
        const aadhaarDocument = getMultipartFile(
          files,
          "aadhaarCard"
        );

        for (const [
          documentType,
          documentFile,
          fieldName,
        ] of [
          ["pan_card", panDocument, "panCard"],
          ["aadhaar_card", aadhaarDocument, "aadhaarCard"],
        ]) {
          if (!documentFile) continue;

          const originalName = String(
            documentFile.originalname ||
              fieldName ||
              documentType
          ).trim();

          const mimeType = String(
            documentFile.mimetype ||
              "application/octet-stream"
          ).trim();

          const fileSize = Number(documentFile.size || 0);

          if (!originalName || !mimeType || fileSize <= 0) {
            continue;
          }

          await client.query(
            `INSERT INTO public.user_documents
               (user_id, document_type, storage_key,
                original_filename, mime_type, file_size_bytes,
                verification_status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [
              user.id,
              documentType,
              `${documentType}/${crypto.randomUUID()}`,
              originalName,
              mimeType,
              fileSize,
            ]
          );
        }

        await client.query(
          `INSERT INTO public.registration_reviews
             (user_id, reviewed_by, decision, notes)
           VALUES ($1, NULL, 'pending', $2)`,
          [
            user.id,
            "Application submitted for review",
          ]
        );

        await client.query("COMMIT");

        return {
          userId: user.id,
          applicationId: user.id,
          accountStatus: "pending",
          message:
            "Registration submitted successfully and is pending review.",
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    // ========================================================
    // LOGIN
    // ========================================================

    async login(email, password, metadata = {}) {
      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

      await authModel.ensureRequiredPermissions();

      const user = await authModel.findByEmail(normalizedEmail);

      if (!user) {
        throw new ApiError(
          401,
          "Email or password is incorrect"
        );
      }

      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
        throw new ApiError(
          401,
          "Email or password is incorrect"
        );
      }

      if (user.is_deleted || user.status !== "active") {
        throw new ApiError(
          401,
          "Account is disabled or inactive"
        );
      }

      const accountStatus = normalizeAccountStatus(
        user.account_status
      );

      if (accountStatus !== "approved") {
        throw new ApiError(
          401,
          getAccountStatusMessage(accountStatus)
        );
      }

      const roles = await authModel.getRolesForUser(user.id);
      const permissions = await authModel.getPermissionsForUser(
        user.id
      );

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

      await authModel.saveRefreshToken(
        user.id,
        refreshHash,
        {
          expiresAt: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 7
          ),
          userAgent: metadata.userAgent || "unknown",
          ipAddress: metadata.ipAddress || null,
        }
      );

      await authModel.touchLastLogin(user.id);

      return {
        token: accessToken,
        accessToken,
        refreshToken,
        user: safeUser,
      };
    },

    // ========================================================
    // LOGOUT
    // ========================================================

    async logout(payload = {}) {
      if (payload.refreshToken) {
        const refreshHash = hashToken(payload.refreshToken);

        await authModel.revokeRefreshToken(
          payload.userId,
          refreshHash
        );
      } else {
        await authModel.revokeAllRefreshTokens(payload.userId);
      }

      return { revoked: true };
    },

    // ========================================================
    // CURRENT USER
    // ========================================================

    async getCurrentUser(userId) {
      const profile = await authModel.getUserProfile(userId);

      if (!profile) {
        throw new ApiError(
          401,
          "Authenticated user no longer exists"
        );
      }

      if (profile.status !== "active") {
        throw new ApiError(
          401,
          "Account is disabled or inactive"
        );
      }

      const accountStatus = normalizeAccountStatus(
        profile.account_status
      );

      if (accountStatus !== "approved") {
        throw new ApiError(
          401,
          getAccountStatusMessage(accountStatus)
        );
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

    // ========================================================
    // REGISTRATION STATUS
    // ========================================================

    async getRegistrationStatus(userId) {
      const user = await authModel.getRegistrationStatus(userId);

      if (!user) {
        throw new ApiError(404, "User not found");
      }

      return {
        userId: user.id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
        account_status: normalizeAccountStatus(
          user.account_status
        ),
        approved_by: user.approved_by || null,
        rejection_reason: user.rejection_reason || null,
        last_login_at: user.last_login_at,
      };
    },

    // ========================================================
    // REFRESH ACCESS TOKEN
    // ========================================================

    async refreshAccessToken(refreshToken, metadata = {}) {
      if (!refreshToken) {
        throw new ApiError(401, "Refresh token is required");
      }

      const tokenHash = hashToken(refreshToken);

      const session = await authModel.getActiveRefreshToken(
        tokenHash
      );

      if (!session) {
        throw new ApiError(
          401,
          "Refresh token is invalid or expired"
        );
      }

      let payload;

      try {
        payload = jwt.verify(
          refreshToken,
          config.jwtRefreshSecret,
          {
            issuer: config.jwtIssuer,
            audience: config.jwtAudience,
          }
        );

        if (payload.type !== "refresh") {
          throw new Error("Invalid token type");
        }
      } catch {
        throw new ApiError(
          401,
          "Refresh token is invalid or expired"
        );
      }

      const user = await authModel.findById(payload.sub);

      if (
        !user ||
        user.status !== "active" ||
        user.is_deleted
      ) {
        throw new ApiError(
          401,
          "Authenticated user no longer exists"
        );
      }

      const accountStatus = normalizeAccountStatus(
        user.account_status
      );

      if (accountStatus !== "approved") {
        throw new ApiError(
          401,
          getAccountStatusMessage(accountStatus)
        );
      }

      await authModel.revokeRefreshToken(
        user.id,
        tokenHash
      );

      const roles = await authModel.getRolesForUser(user.id);
      const permissions = await authModel.getPermissionsForUser(
        user.id
      );

      const safeUser = {
        ...user,
        roles,
        permissions,
      };

      const accessToken = signAccessToken(safeUser, config);
      const newRefreshToken = signRefreshToken(
        safeUser,
        config
      );

      const newRefreshHash = hashToken(newRefreshToken);

      await authModel.saveRefreshToken(
        user.id,
        newRefreshHash,
        {
          expiresAt: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 7
          ),
          userAgent: metadata.userAgent || "unknown",
          ipAddress: metadata.ipAddress || null,
        }
      );

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

    // ========================================================
    // CHANGE PASSWORD
    // ========================================================

    async changePassword(
      userId,
      currentPassword,
      newPassword
    ) {
      if (!validatePassword(newPassword)) {
        throw new ApiError(
          400,
          "Password must be at least 8 characters long and include uppercase, lowercase, and number characters"
        );
      }

      const user = await authModel.findById(userId);

      if (!user) {
        throw new ApiError(
          401,
          "Authenticated user no longer exists"
        );
      }

      const matches = await bcrypt.compare(
        currentPassword,
        user.password_hash
      );

      if (!matches) {
        throw new ApiError(
          401,
          "Current password is incorrect"
        );
      }

      const passwordHash = await bcrypt.hash(
        newPassword,
        12
      );

      await authModel.updatePassword(
        userId,
        passwordHash
      );

      await authModel.revokeAllRefreshTokens(userId);

      return { changed: true };
    },

    // ========================================================
    // VERIFY PASSWORD RESET TOKEN
    // ========================================================

    async verifyPasswordResetToken(resetToken) {
      const normalizedToken = String(resetToken || "").trim();

      if (!normalizedToken) {
        throw new ApiError(400, "Password reset token is required");
      }

      if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
        throw new ApiError(400, "Password reset token is malformed");
      }

      const tokenHash = hashToken(normalizedToken);
      const tokenRecord = await authModel.getValidPasswordResetToken(tokenHash);

      if (!tokenRecord) {
        return { valid: false };
      }

      return { valid: true };
    },

    // ========================================================
    // REQUEST PASSWORD RESET
    // ========================================================

    async requestPasswordReset(email) {
      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

      if (!normalizedEmail) {
        throw new ApiError(
          400,
          "Please enter your email address."
        );
      }

      // 1. Find the account, including its latest registration review.
      const user = await authModel.findPasswordResetUserByEmail(
        normalizedEmail
      );

      if (!user) {
        throw new ApiError(
          404,
          "No account was found with this email address. Please check your email or register first."
        );
      }

      // 2. Check account and registration approval.
      const reviewStatus = String(
        user.registration_status || ""
      )
        .trim()
        .toLowerCase();

      const accountStatus = String(
        user.account_status || ""
      )
        .trim()
        .toLowerCase();

      const userStatus = String(
        user.status || ""
      )
        .trim()
        .toLowerCase();

      if (reviewStatus === "rejected" || accountStatus === "rejected") {
        throw new ApiError(
          403,
          "Your registration request has been rejected. Please contact the administrator."
        );
      }

      if (
        reviewStatus === "pending" ||
        reviewStatus === "under_review" ||
        !reviewStatus ||
        accountStatus === "pending" ||
        accountStatus === "under_review"
      ) {
        throw new ApiError(
          403,
          "Your registration is awaiting admin approval. You can reset your password after your account is approved."
        );
      }

      if (
        reviewStatus !== "approved" ||
        accountStatus !== "approved" ||
        userStatus !== "active" ||
        user.is_deleted === true
      ) {
        throw new ApiError(
          403,
          "Your account is not eligible for password reset. Please contact the administrator."
        );
      }

      // 3. Do not allow password resets for temporarily locked accounts.
      if (
        user.locked_until &&
        new Date(user.locked_until).getTime() > Date.now()
      ) {
        throw new ApiError(
          403,
          "Your account is temporarily locked. Please contact the administrator."
        );
      }

      // 4. Generate a cryptographically secure reset token.
      const resetToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(resetToken);

      const expiryMinutes = Math.max(
        1,
        Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 15
      );

      const expiresAt = new Date(
        Date.now() + expiryMinutes * 60 * 1000
      );

      // 5. Save only the token hash in the database.
      const saved = await authModel.savePasswordResetTokenIfEligible(
        user.id,
        tokenHash,
        { expiresAt }
      );

      if (!saved) {
        throw new ApiError(
          403,
          "Your account is no longer eligible for password reset. Please contact the administrator."
        );
      }

      // 6. Build the reset link for the frontend.
      const frontendUrl =
        config.frontendUrl || process.env.FRONTEND_URL;

      if (!frontendUrl) {
        await authModel.invalidatePasswordResetTokens(user.id);

        throw new ApiError(
          500,
          "Password reset could not be completed because the frontend URL is not configured."
        );
      }

      let resetUrl;

      try {
        const resetUrlObject = new URL(
          "/reset-password",
          frontendUrl
        );

        resetUrlObject.searchParams.set("token", resetToken);
        resetUrl = resetUrlObject.toString();
      } catch {
        await authModel.invalidatePasswordResetTokens(user.id);

        throw new ApiError(
          500,
          "The password reset URL is incorrectly configured."
        );
      }

      // 7. Send the reset email.
try {
        // The email utility should throw if sending fails.
        // Do not require a particular return-object format.
        await sendResetEmail(user.email, resetUrl);
      } catch (error) {
        // Invalidate the token if email delivery fails.
        try {
          await authModel.invalidatePasswordResetTokens(user.id);
        } catch (cleanupError) {
          console.error(
            "Failed to invalidate password reset tokens:",
            cleanupError.message
          );
        }

        console.error("Password reset email delivery failed:", {
          message: error.message,
          code: error.code,
        });

        throw new ApiError(
          502,
          "Unable to send the password reset email. Please try again later."
        );
      }

      // 8. Return success after the email utility completes.
      return {
        requested: true,
        emailSent: true,
        message: "Password reset email sent successfully. Please check your inbox.",
      };
    },


    // ========================================================
    // RESET PASSWORD
    // ========================================================

    async resetPassword(resetToken, newPassword) {
      const normalizedToken = String(resetToken || "").trim();

      if (
        !normalizedToken ||
        typeof normalizedToken !== "string"
      ) {
        throw new ApiError(
          400,
          "Password reset token is required"
        );
      }

      if (!/^[a-f0-9]{64}$/i.test(normalizedToken)) {
        throw new ApiError(
          400,
          "Password reset token is malformed"
        );
      }

      if (!validatePassword(newPassword)) {
        throw new ApiError(
          400,
          "Password must be at least 8 characters long and include uppercase, lowercase, and number characters"
        );
      }

      const tokenHash = hashToken(normalizedToken);

      const passwordHash = await bcrypt.hash(
        newPassword,
        12
      );

      // The model consumes the token and changes the password
      // within one transaction, and revokes existing refresh tokens.
      const consumed =
        await authModel.consumePasswordResetToken(
          tokenHash,
          passwordHash
        );

      if (!consumed) {
        throw new ApiError(
          401,
          "Password reset token is invalid, expired, already used, or the account is not eligible"
        );
      }

      return { reset: true };
    },
  };
}

module.exports = createAuthService;
