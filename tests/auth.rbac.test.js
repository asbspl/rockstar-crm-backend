const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const pool = require("../src/config/db");
const { getConfig } = require("../src/config/env");
const createAuthService = require("../src/services/auth.service");
const userModel = require("../src/models/user.model");
const { authorizePermission } = require("../src/middlewares/auth.middleware");

const config = getConfig();
const authService = createAuthService(config);

async function ensureTestUser(email, password, status = "active", roleCode = "SUPER_ADMIN") {
  const hashed = await bcrypt.hash(password, 12);
  const inserted = await pool.query(
    `INSERT INTO public.users (email, full_name, password_hash, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, status = EXCLUDED.status, updated_at = NOW()
     RETURNING id`,
    [email, "Test User", hashed, status]
  );

  if (roleCode) {
    const role = await pool.query(`SELECT id FROM public.roles WHERE code = $1 LIMIT 1`, [roleCode]);
    if (role.rowCount) {
      await pool.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [inserted.rows[0].id, role.rows[0].id]
      );
    }
  }

  return inserted.rows[0].id;
}

async function withApiServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("registration creates a pending user and review record", async () => {
  const email = `register.${Date.now()}@example.com`;
  const payload = {
    name: "New Applicant",
    phone: "+1 555 123 4567",
    email,
    password: "StrongPass123",
    addressLine1: "123 Main Street",
    addressLine2: "Suite 42",
    location: "Downtown",
    state: "CA",
    city: "San Francisco",
    pinCode: "94105",
    panNumber: "ABCDE1234F",
    aadhaarNumber: "123456789012",
    paymentUpi: "test@upi",
    accountName: "New Applicant",
    accountNumber: "1234567890",
    ifscCode: "HDFC0001234",
    privacyAccepted: true,
  };

  const formData = new FormData();
  for (const [field, value] of Object.entries(payload)) {
    formData.append(field, String(value));
  }
  formData.append("panCard", new Blob(["pan document"], { type: "application/pdf" }), "pan.pdf");
  formData.append("aadhaarCard", new Blob(["aadhaar document"], { type: "application/pdf" }), "aadhaar.pdf");

  let result;
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      body: formData,
    });
    assert.equal(response.status, 201);
    const responseBody = await response.json();
    result = responseBody.data;
  });

  assert.equal(result.accountStatus, "pending");
  assert.ok(result.userId);

  const userResult = await pool.query('SELECT id, status, account_status, phone FROM public.users WHERE email = $1', [email]);
  assert.equal(userResult.rowCount, 1);
  assert.equal(userResult.rows[0].account_status, "pending");
  assert.equal(userResult.rows[0].phone, payload.phone);

  const reviewResult = await pool.query('SELECT decision, reviewed_by FROM public.registration_reviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userResult.rows[0].id]);
  assert.equal(reviewResult.rowCount, 1);
  assert.equal(reviewResult.rows[0].decision, "pending");
  assert.equal(reviewResult.rows[0].reviewed_by, null);

  const documentResult = await pool.query('SELECT document_type FROM public.user_documents WHERE user_id = $1 ORDER BY document_type', [userResult.rows[0].id]);
  assert.equal(documentResult.rowCount, 2);
  assert.deepEqual(documentResult.rows.map((row) => row.document_type).sort(), ["aadhaar_card", "pan_card"]);

  await pool.query('DELETE FROM public.users WHERE email = $1', [email]);
});

test("login returns access and refresh tokens for an active user", async () => {
  const email = `login.${Date.now()}@example.com`;
  const password = "StrongPass123";
  await ensureTestUser(email, password, "active");

  const result = await authService.login(email, password, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });

  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.email, email);
  assert.equal(result.user.status, "active");
});

test("invalid credentials are rejected", async () => {
  const email = `bad.${Date.now()}@example.com`;
  const password = "StrongPass123";
  await ensureTestUser(email, password, "active");

  await assert.rejects(() => authService.login(email, "WrongPassword123"), /Email or password is incorrect/);
});

test("inactive users cannot log in", async () => {
  const email = `inactive.${Date.now()}@example.com`;
  const password = "StrongPass123";
  await ensureTestUser(email, password, "inactive");

  await assert.rejects(() => authService.login(email, password), /disabled or inactive/);
});

test("refresh token rotation returns a new access token", async () => {
  const email = `refresh.${Date.now()}@example.com`;
  const password = "StrongPass123";
  await ensureTestUser(email, password, "active");

  const login = await authService.login(email, password, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });

  const refreshed = await authService.refreshAccessToken(login.refreshToken, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });

  assert.ok(refreshed.accessToken);
  assert.ok(refreshed.refreshToken);
  assert.notEqual(refreshed.accessToken, login.accessToken);
});

test("password reset flow accepts a valid token and updates the password", async () => {
  const email = `reset.${Date.now()}@example.com`;
  const oldPassword = "StrongPass123";
  const newPassword = "ResetPass456";

  const userId = await ensureTestUser(email, oldPassword, "active", "READ_ONLY");
  await pool.query(
    `INSERT INTO public.registration_reviews (user_id, decision, notes)
     VALUES ($1, 'approved', 'Approved for password reset flow test')
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  await pool.query(
    `UPDATE public.users
     SET account_status = 'approved', updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );

  let capturedResetUrl;
  const resetAuthService = createAuthService(config, {
    sendPasswordResetEmail: async (_to, resetUrl) => {
      capturedResetUrl = resetUrl;
    },
  });

  const requestResult = await resetAuthService.requestPasswordReset(email);
  assert.equal(requestResult.emailSent, true);
  assert.ok(capturedResetUrl);

  const resetToken = new URL(capturedResetUrl).searchParams.get("token");
  assert.ok(resetToken);

  const verification = await resetAuthService.verifyPasswordResetToken(resetToken);
  assert.equal(verification.valid, true);

  const resetResult = await resetAuthService.resetPassword(resetToken, newPassword);
  assert.deepEqual(resetResult, { reset: true });

  const loginWithOldPassword = await assert.rejects(
    () => authService.login(email, oldPassword, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    /Email or password is incorrect/
  );
  assert.ok(loginWithOldPassword);

  const loginWithNewPassword = await authService.login(email, newPassword, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  assert.equal(loginWithNewPassword.user.email, email);

  await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
});

test("authorizePermission denies when a requirement is missing", async () => {
  const req = {
    method: "GET",
    originalUrl: "/api/users",
    auth: {
      permissions: ["dashboard.read"],
    },
  };

  const middleware = authorizePermission("users.read");
  await new Promise((resolve) => {
    middleware(req, {}, (error) => {
      assert.ok(error);
      assert.equal(error.statusCode, 403);
      resolve();
    });
  });
});

test("dashboard summary rejects authenticated users without dashboard.read permission", async () => {
  const email = `dashboard-no-permission.${Date.now()}@example.com`;
  const password = "StrongPass123";
  const userId = await ensureTestUser(email, password, "active", null);

  try {
    const login = await authService.login(email, password, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    });

    await withApiServer(async (baseUrl) => {
      const profile = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${login.accessToken}` },
      });
      const profileBody = await profile.json();
      assert.equal(profile.status, 200);
      assert.deepEqual(profileBody.data.roles, []);
      assert.deepEqual(profileBody.data.permissions, []);

      const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
        headers: { authorization: `Bearer ${login.accessToken}` },
      });

      assert.equal(response.status, 403);
      const body = await response.json();
      assert.match(body.message, /permission/i);
    });
  } finally {
    await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
  }
});

test("dashboard authorization admits an active role with dashboard.read", async () => {
  const email = `dashboard-authorized.${Date.now()}@example.com`;
  const password = "StrongPass123";
  const userId = await ensureTestUser(email, password, "active", "READ_ONLY");

  try {
    const login = await authService.login(email, password, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    });
    assert.ok(login.user.permissions.includes("dashboard.read"));

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
        headers: { authorization: `Bearer ${login.accessToken}` },
      });
      assert.notEqual(response.status, 403);
      assert.ok([200, 503].includes(response.status));
    });
  } finally {
    await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
  }
});

test("login HTTP contract validates input, authenticates, and accepts its token", async () => {
  const email = `http-login.${Date.now()}@example.com`;
  const password = "StrongPass123";
  await ensureTestUser(email, password, "active");

  await withApiServer(async (baseUrl) => {
    const missingPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(missingPassword.status, 400);

    const missingEmail = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(missingEmail.status, 400);

    const unknownUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `unknown.${Date.now()}@example.com`, password }),
    });
    const unknownBody = await unknownUser.json();
    assert.equal(unknownUser.status, 401);
    assert.equal(unknownBody.message, "Email or password is incorrect");

    const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "WrongPassword123" }),
    });
    const wrongPasswordBody = await wrongPassword.json();
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPasswordBody.message, unknownBody.message);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await login.json();
    assert.equal(login.status, 200);
    assert.equal(loginBody.success, true);
    assert.ok(loginBody.data.token);
    assert.ok(loginBody.data.accessToken);
    assert.equal(loginBody.data.accessToken, loginBody.data.token);
    assert.ok(loginBody.data.refreshToken);
    assert.ok(loginBody.data.user.roles.includes("SUPER_ADMIN"));
    assert.ok(loginBody.data.user.permissions.includes("dashboard.read"));

    const profile = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.data.token}` },
    });
    const profileBody = await profile.json();
    assert.equal(profile.status, 200);
    assert.equal(profileBody.data.email, email);
    assert.deepEqual(profileBody.data.roles, loginBody.data.user.roles);
    assert.deepEqual(profileBody.data.permissions, loginBody.data.user.permissions);
  });
});

test("/api/auth/me rejects missing and expired bearer tokens", async () => {
  const expiredToken = jwt.sign(
    { sub: "1" },
    config.jwtSecret,
    {
      algorithm: "HS256",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: -1,
    }
  );

  await withApiServer(async (baseUrl) => {
    const missingToken = await fetch(`${baseUrl}/api/auth/me`);
    const missingBody = await missingToken.json();
    assert.equal(missingToken.status, 401);
    assert.equal(missingBody.message, "Authentication is required");

    const expired = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const expiredBody = await expired.json();
    assert.equal(expired.status, 401);
    assert.equal(expiredBody.message, "Invalid or expired authentication token");
  });
});

test("soft-deleted users cannot log in or use a previously issued token", async () => {
  const email = `deleted.${Date.now()}@example.com`;
  const password = "StrongPass123";
  const userId = await ensureTestUser(email, password, "active");
  await pool.query("UPDATE public.users SET is_deleted = TRUE WHERE id = $1", [userId]);
  const token = jwt.sign(
    { sub: String(userId) },
    config.jwtSecret,
    { algorithm: "HS256", issuer: config.jwtIssuer, audience: config.jwtAudience, expiresIn: "5m" }
  );

  try {
    await withApiServer(async (baseUrl) => {
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(login.status, 401);

      const profile = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(profile.status, 401);
    });
  } finally {
    await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
  }
});

test("/api/auth/me reports role-query database failures as safe 500 errors", async () => {
  const email = `me-db-failure.${Date.now()}@example.com`;
  const password = "StrongPass123";
  const userId = await ensureTestUser(email, password, "active");
  const login = await authService.login(email, password, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  const originalGetRolesForUser = userModel.getRolesForUser;
  userModel.getRolesForUser = async () => {
    throw Object.assign(new Error("database details must stay private"), { code: "08006" });
  };

  try {
    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${login.accessToken}` },
      });
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(body.message, "An internal server error occurred");
      assert.doesNotMatch(JSON.stringify(body), /database details|08006/);
    });
  } finally {
    userModel.getRolesForUser = originalGetRolesForUser;
    await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
  }
});

test("database errors return a generic 500 without stopping the API", async () => {
  const originalFindByEmail = userModel.findByEmail;
  userModel.findByEmail = async () => {
    throw Object.assign(new Error("database connection details must stay private"), { code: "08006" });
  };

  try {
    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "StrongPass123" }),
      });
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(body.message, "An internal server error occurred");
      assert.doesNotMatch(JSON.stringify(body), /connection details|08006/);

      const health = await fetch(`${baseUrl}/`);
      assert.equal(health.status, 200);
    });
  } finally {
    userModel.findByEmail = originalFindByEmail;
  }
});

test("JWT configuration rejects missing or short secrets", () => {
  const originalSecret = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getConfig(), /Missing required environment variables: JWT_SECRET/);
    process.env.JWT_SECRET = "too-short";
    assert.throws(() => getConfig(), /JWT_SECRET must contain at least 32 characters/);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
