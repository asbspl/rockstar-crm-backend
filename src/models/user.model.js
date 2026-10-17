
const pool = require("../config/db");
const ApiError = require("../utils/ApiError");

// ============================================================
// AUTH TABLE VALIDATION
// ============================================================

async function ensureAuthTables() {
  const requiredTables = [
    "users",
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    "refresh_tokens",
    "password_reset_tokens",
  ];

  const result = await pool.query(
    `SELECT LOWER(table_name) AS table_name
     FROM information_schema.tables
     WHERE table_schema = $1
       AND LOWER(table_name) = ANY($2)`,
    ["public", requiredTables]
  );

  const found = new Set(result.rows.map((row) => row.table_name));

  const missing = requiredTables.filter((table) => !found.has(table));

  if (missing.length) {
    throw new ApiError(
      503,
      `Authentication tables are missing: ${missing.join(", ")}`
    );
  }
}

// ============================================================
// PERMISSIONS
// ============================================================

async function ensureRequiredPermissions() {
  const requiredPermissions = [
    { key: "dashboard.read", name: "Dashboard Read" },
    { key: "users.read", name: "Users Read" },
    { key: "users.create", name: "Users Create" },
    { key: "users.update", name: "Users Update" },
    { key: "users.approve", name: "Users Approve" },
    { key: "users.reject", name: "Users Reject" },
    { key: "users.suspend", name: "Users Suspend" },
    { key: "users.assign_role", name: "Users Assign Role" },
    { key: "users.assign_permission", name: "Users Assign Permission" },
    { key: "kyc.read", name: "KYC Read" },
    { key: "kyc.review", name: "KYC Review" },
    { key: "kyc.download", name: "KYC Download" },
    { key: "settings.read", name: "Settings Read" },
    { key: "settings.update", name: "Settings Update" },
  ];

  for (const permission of requiredPermissions) {
    await pool.query(
      `INSERT INTO public.permissions
         (key, name, description, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (key)
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [
        permission.key,
        permission.name,
        `${permission.name} permission.`,
      ]
    );
  }
}

// ============================================================
// USERS
// ============================================================

async function findByEmail(email) {
  await ensureAuthTables();

  const result = await pool.query(
    `SELECT *
     FROM public.users
     WHERE LOWER(email) = LOWER($1)
       AND is_deleted = FALSE
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  await ensureAuthTables();

  const result = await pool.query(
    `SELECT *
     FROM public.users
     WHERE id = $1
       AND is_deleted = FALSE
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

// ============================================================
// PASSWORD RESET: FIND ACCOUNT
// ============================================================


async function findPasswordResetUserByEmail(email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  await ensureAuthTables();

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.status,
       u.account_status,
       u.is_deleted,
       u.locked_until,
       registration.decision AS registration_status
     FROM public.users u
     LEFT JOIN LATERAL (
       SELECT rr.decision
       FROM public.registration_reviews rr
       WHERE rr.user_id = u.id
       ORDER BY rr.created_at DESC NULLS LAST, rr.id DESC
       LIMIT 1
     ) registration ON TRUE
     WHERE LOWER(TRIM(u.email)) = $1
       AND COALESCE(u.is_deleted, FALSE) = FALSE
     LIMIT 1`,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}


// ============================================================
// USER ROLES AND PERMISSIONS
// ============================================================

async function getRolesForUser(userId) {
  const result = await pool.query(
    `SELECT DISTINCT r.code
     FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND r.is_active = TRUE
     ORDER BY r.code`,
    [userId]
  );

  return result.rows.map((row) => row.code);
}

async function getPermissionsForUser(userId) {
  const result = await pool.query(
    `SELECT DISTINCT p.key
     FROM public.user_roles ur
     JOIN public.roles r
       ON r.id = ur.role_id
       AND r.is_active = TRUE
     JOIN public.role_permissions rp ON rp.role_id = ur.role_id
     JOIN public.permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
       AND p.is_active = TRUE
     ORDER BY p.key`,
    [userId]
  );

  return result.rows.map((row) => row.key);
}

async function getUserProfile(userId) {
  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.status,
       u.account_status,
       u.phone,
       u.last_login_at,
       u.created_at,
       u.updated_at,
       COALESCE(
         ARRAY_AGG(DISTINCT r.code)
           FILTER (WHERE r.code IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles,
       COALESCE(
         ARRAY_AGG(DISTINCT p.key)
           FILTER (WHERE p.key IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
     FROM public.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r
       ON r.id = ur.role_id AND r.is_active = TRUE
     LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
     LEFT JOIN public.permissions p
       ON p.id = rp.permission_id AND p.is_active = TRUE
     WHERE u.id = $1
       AND u.is_deleted = FALSE
     GROUP BY
       u.id, u.email, u.full_name, u.status, u.account_status,
       u.phone, u.last_login_at, u.created_at, u.updated_at`,
    [userId]
  );

  return result.rows[0] || null;
}

async function touchLastLogin(userId) {
  await pool.query(
    `UPDATE public.users
     SET last_login_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

// ============================================================
// REFRESH TOKENS
// ============================================================

async function saveRefreshToken(
  userId,
  tokenHash,
  { expiresAt, userAgent, ipAddress }
) {
  await pool.query(
    `INSERT INTO public.refresh_tokens
       (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      expiresAt,
      userAgent || null,
      ipAddress || null,
    ]
  );
}

async function getActiveRefreshToken(tokenHash) {
  const result = await pool.query(
    `SELECT *
     FROM public.refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function revokeRefreshToken(userId, tokenHash) {
  await pool.query(
    `UPDATE public.refresh_tokens
     SET revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND token_hash = $2
       AND revoked_at IS NULL`,
    [userId, tokenHash]
  );
}

async function revokeAllRefreshTokens(userId) {
  await pool.query(
    `UPDATE public.refresh_tokens
     SET revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
}

// ============================================================
// PASSWORD UPDATE
// ============================================================

async function updatePassword(userId, passwordHash) {
  await pool.query(
    `UPDATE public.users
     SET password_hash = $1,
         password_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

// ============================================================
// PASSWORD RESET: SAVE TOKEN
// ============================================================

async function savePasswordResetToken(userId, tokenHash, expiresAt) {
  const result = await pool.query(
    `INSERT INTO public.password_reset_tokens
       (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token_hash, expires_at`,
    [userId, tokenHash, expiresAt]
  );

  return result.rows[0] || null;
}

// Only eligible, approved accounts can receive reset tokens.
async function savePasswordResetTokenIfEligible(
  userId,
  tokenHash,
  { expiresAt }
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT
         id,
         status,
         account_status,
         is_deleted,
         locked_until
       FROM public.users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    const user = userResult.rows[0];

    const reviewResult = await client.query(
      `SELECT decision
       FROM public.registration_reviews
       WHERE user_id = $1
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [userId]
    );

    const latestDecision = reviewResult.rows[0]?.decision ?? null;

    const isLocked =
      user.locked_until != null &&
      new Date(user.locked_until).getTime() > Date.now();

    const eligible =
      user.status === "active" &&
      user.account_status === "approved" &&
      user.is_deleted !== true &&
      latestDecision === "approved" &&
      !isLocked;

    if (!eligible) {
      await client.query("ROLLBACK");
      return false;
    }

    // Invalidate old, unused reset tokens.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId]
    );

    await client.query(
      `INSERT INTO public.password_reset_tokens
         (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Password-reset rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// PASSWORD RESET: FIND VALID TOKEN
// ============================================================

async function getValidPasswordResetToken(tokenHash) {
  const result = await pool.query(
    `SELECT *
     FROM public.password_reset_tokens
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

// ============================================================
// PASSWORD RESET: MARK TOKEN USED
// ============================================================

async function markPasswordResetTokenUsed(tokenHash) {
  await pool.query(
    `UPDATE public.password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = $1
       AND used_at IS NULL`,
    [tokenHash]
  );
}

// ============================================================
// PASSWORD RESET: INVALIDATE UNUSED TOKENS
// ============================================================

async function invalidatePasswordResetTokens(userId) {
  await pool.query(
    `UPDATE public.password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId]
  );
}

// ============================================================
// PASSWORD RESET: CONSUME TOKEN AND UPDATE PASSWORD ATOMICALLY
// ============================================================

async function consumePasswordResetToken(tokenHash, passwordHash) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenOwner = await client.query(
      `SELECT user_id
       FROM public.password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!tokenOwner.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    const userId = tokenOwner.rows[0].user_id;

    const userResult = await client.query(
      `SELECT
         id,
         status,
         account_status,
         is_deleted,
         locked_until
       FROM public.users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    // Recheck token validity while holding the user lock.
    const tokenResult = await client.query(
      `SELECT id
       FROM public.password_reset_tokens
       WHERE token_hash = $1
         AND user_id = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash, userId]
    );

    if (!tokenResult.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    const user = userResult.rows[0];

    const registrationResult = await client.query(
      `SELECT decision
       FROM public.registration_reviews
       WHERE user_id = $1
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [user.id]
    );

    const latestDecision = registrationResult.rows[0]?.decision ?? null;

    const isLocked =
      user.locked_until != null &&
      new Date(user.locked_until).getTime() > Date.now();

    const eligible =
      user.status === "active" &&
      user.account_status === "approved" &&
      user.is_deleted !== true &&
      latestDecision === "approved" &&
      !isLocked;

    if (!eligible) {
      await client.query(
        `UPDATE public.password_reset_tokens
         SET used_at = NOW()
         WHERE id = $1`,
        [tokenResult.rows[0].id]
      );

      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `UPDATE public.users
       SET password_hash = $1,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Consume the token so it cannot be reused.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenResult.rows[0].id]
    );

    // Invalidate any other reset links for this account.
    await client.query(
      `UPDATE public.password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id]
    );

    // Revoke existing refresh sessions after the password changes.
    await client.query(
      `UPDATE public.refresh_tokens
       SET revoked_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [user.id]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Password-reset transaction rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// ADMIN: LIST USERS
// ============================================================

async function listUsers() {
  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.status,
       u.account_status,
       u.created_at,
       u.updated_at,
       COALESCE(
         ARRAY_AGG(DISTINCT r.code)
           FILTER (WHERE r.code IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles
     FROM public.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     GROUP BY
       u.id, u.email, u.full_name, u.status, u.account_status,
       u.created_at, u.updated_at
     ORDER BY u.created_at DESC`
  );

  return result.rows;
}

async function createUser({
  email,
  fullName,
  passwordHash,
  status = "active",
  accountStatus = "pending",
}) {
  const result = await pool.query(
    `INSERT INTO public.users
       (email, full_name, password_hash, status, account_status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id, email, full_name, status, account_status,
       created_at, updated_at`,
    [email, fullName, passwordHash, status, accountStatus]
  );

  return result.rows[0];
}

async function updateUser(userId, changes) {
  const allowedColumns = new Set([
    "email",
    "full_name",
    "status",
    "account_status",
    "phone",
    "is_deleted",
  ]);

  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;

    if (!allowedColumns.has(key)) {
      throw new ApiError(400, `Unsupported user field: ${key}`);
    }

    values.push(value);
    updates.push(`${key} = $${values.length}`);
  }

  if (!updates.length) {
    return findById(userId);
  }

  values.push(userId);

  const result = await pool.query(
    `UPDATE public.users
     SET ${updates.join(", ")},
         updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING
       id, email, full_name, status, account_status,
       created_at, updated_at`,
    values
  );

  return result.rows[0] || null;
}

// ============================================================
// ADMIN: ROLE ASSIGNMENT
// ============================================================

async function assignRolesToUser(userId, roleIds) {
  await pool.query(
    `DELETE FROM public.user_roles WHERE user_id = $1`,
    [userId]
  );

  if (!roleIds.length) return;

  const values = roleIds
    .map((roleId, index) => `($1, $${index + 2})`)
    .join(", ");

  await pool.query(
    `INSERT INTO public.user_roles (user_id, role_id)
     VALUES ${values}`,
    [userId, ...roleIds]
  );
}

async function getRoleIdByCode(code) {
  const result = await pool.query(
    `SELECT id
     FROM public.roles
     WHERE code = $1
     LIMIT 1`,
    [code]
  );

  return result.rows[0]?.id || null;
}

async function getAllRoles() {
  const result = await pool.query(
    `SELECT * FROM public.roles ORDER BY id ASC`
  );

  return result.rows;
}

async function getAllPermissions() {
  const result = await pool.query(
    `SELECT * FROM public.permissions ORDER BY key ASC`
  );

  return result.rows;
}

async function getRolePermissions(roleId) {
  const result = await pool.query(
    `SELECT p.*
     FROM public.role_permissions rp
     JOIN public.permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.key ASC`,
    [roleId]
  );

  return result.rows;
}

async function setRolePermissions(roleId, permissionKeys) {
  await pool.query(
    `DELETE FROM public.role_permissions WHERE role_id = $1`,
    [roleId]
  );

  if (!permissionKeys.length) return [];

  const permissionIds = [];

  for (const permissionKey of permissionKeys) {
    const result = await pool.query(
      `SELECT id
       FROM public.permissions
       WHERE key = $1
       LIMIT 1`,
      [permissionKey]
    );

    if (result.rows[0]) {
      permissionIds.push(result.rows[0].id);
    }
  }

  if (!permissionIds.length) return [];

  const values = permissionIds
    .map((id, index) => `($1, $${index + 2})`)
    .join(", ");

  await pool.query(
    `INSERT INTO public.role_permissions (role_id, permission_id)
     VALUES ${values}`,
    [roleId, ...permissionIds]
  );

  return permissionIds;
}

// ============================================================
// REGISTRATION STATUS
// ============================================================

async function getRegistrationStatus(userId) {
  const result = await pool.query(
    `SELECT
       id,
       email,
       full_name,
       status,
       account_status,
       approved_by,
       rejection_reason,
       last_login_at
     FROM public.users
     WHERE id = $1
       AND is_deleted = FALSE
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

// ============================================================
// ADMIN: LIST REGISTRATION APPLICATIONS
// ============================================================

async function listApplications({
  offset = 0,
  limit = 25,
  status = null,
  search = null,
} = {}) {
  const clauses = ["u.is_deleted = FALSE"];
  const values = [];

  if (status) {
    values.push(status);
    clauses.push(`u.account_status = $${values.length}`);
  }

  if (search) {
    values.push(`%${String(search).trim().toLowerCase()}%`);

    clauses.push(
      `(LOWER(u.email) LIKE $${values.length}
        OR LOWER(u.full_name) LIKE $${values.length})`
    );
  }

  values.push(Number(limit), Number(offset));

  const whereClause = `WHERE ${clauses.join(" AND ")}`;

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.phone,
       u.account_status,
       u.status,
       u.created_at,
       u.updated_at,
       up.address_line1,
       up.location,
       up.state,
       up.city,
       up.pin_code,
       COALESCE(
         ARRAY_AGG(DISTINCT r.code)
           FILTER (WHERE r.code IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles
     FROM public.users u
     LEFT JOIN public.user_profiles up ON up.user_id = u.id
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     ${whereClause}
     GROUP BY
       u.id, up.address_line1, up.location, up.state, up.city,
       up.pin_code
     ORDER BY u.created_at DESC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values
  );

  return result.rows;
}

async function getApplicationById(applicationId) {
  const result = await pool.query(
    `SELECT
       u.*,
       up.*,
       kyc.*,
       bank.*,
       COALESCE(
         ARRAY_AGG(DISTINCT r.code)
           FILTER (WHERE r.code IS NOT NULL),
         ARRAY[]::text[]
       ) AS roles
     FROM public.users u
     LEFT JOIN public.user_profiles up ON up.user_id = u.id
     LEFT JOIN public.user_kyc kyc ON kyc.user_id = u.id
     LEFT JOIN public.user_bank_accounts bank ON bank.user_id = u.id
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     WHERE u.id = $1
       AND u.is_deleted = FALSE
     GROUP BY u.id, up.id, kyc.id, bank.id`,
    [applicationId]
  );

  return result.rows[0] || null;
}

async function createRegistrationReview(
  userId,
  decision,
  reviewedBy,
  notes
) {
  const result = await pool.query(
    `INSERT INTO public.registration_reviews
       (user_id, reviewed_by, decision, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, reviewedBy, decision, notes]
  );

  return result.rows[0];
}

// ============================================================
// USER PROFILE
// ============================================================

async function upsertUserProfile(userId, profileData) {
  const existing = await pool.query(
    `SELECT id
     FROM public.user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (existing.rows[0]) {
    const result = await pool.query(
      `UPDATE public.user_profiles
       SET full_name = $2,
           address_line1 = $3,
           address_line2 = $4,
           location = $5,
           state = $6,
           city = $7,
           pin_code = $8,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        profileData.full_name,
        profileData.address_line1,
        profileData.address_line2 || null,
        profileData.location,
        profileData.state,
        profileData.city,
        profileData.pin_code,
      ]
    );

    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO public.user_profiles
       (user_id, full_name, address_line1, address_line2,
        location, state, city, pin_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      profileData.full_name,
      profileData.address_line1,
      profileData.address_line2 || null,
      profileData.location,
      profileData.state,
      profileData.city,
      profileData.pin_code,
    ]
  );

  return result.rows[0];
}

// ============================================================
// KYC RECORD
// ============================================================

async function createUserKycRecord(userId, payload) {
  const result = await pool.query(
    `INSERT INTO public.user_kyc
       (user_id, pan_last4, aadhaar_last4,
        verification_status, review_notes)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING *`,
    [
      userId,
      payload.pan_last4 || null,
      payload.aadhaar_last4 || null,
      payload.review_notes || null,
    ]
  );

  return result.rows[0];
}

// ============================================================
// BANK ACCOUNT RECORD
// ============================================================

async function createBankAccountRecord(userId, payload) {
  const result = await pool.query(
    `INSERT INTO public.user_bank_accounts
       (user_id, upi_id, account_name,
        account_number_encrypted, account_last4,
        ifsc_code, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [
      userId,
      payload.upi_id || null,
      payload.account_name || null,
      payload.account_number_encrypted || Buffer.alloc(0),
      payload.account_last4 || null,
      payload.ifsc_code || null,
    ]
  );

  return result.rows[0];
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Validation and permissions
  ensureAuthTables,
  ensureRequiredPermissions,

  // Users
  findByEmail,
  findById,
  findPasswordResetUserByEmail,
  getUserProfile,
  getRegistrationStatus,
  touchLastLogin,
  listUsers,
  createUser,
  updateUser,

  // Roles and permissions
  getRolesForUser,
  getPermissionsForUser,
  assignRolesToUser,
  getRoleIdByCode,
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  setRolePermissions,

  // Refresh tokens
  saveRefreshToken,
  getActiveRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,

  // Passwords
  updatePassword,

  // Password reset
  savePasswordResetToken,
  savePasswordResetTokenIfEligible,
  getValidPasswordResetToken,
  markPasswordResetTokenUsed,
  invalidatePasswordResetTokens,
  consumePasswordResetToken,

  // Registration applications
  listApplications,
  getApplicationById,
  createRegistrationReview,

  // Profile and verification
  upsertUserProfile,
  createUserKycRecord,
  createBankAccountRecord,
};
