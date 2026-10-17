const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { sendPasswordResetEmail } = require('./email.service');

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

exports.requestReset = async (email) => {
  const { rows } = await pool.query(
    'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  const user = rows[0];
  if (!user) throw new ApiError(404, 'No account found with this email address');

  const expiryMinutes = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15);
  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
    [user.id]
  );
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
    [user.id, hashToken(token), expiryMinutes]
  );

  const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, link);
};

exports.resetPassword = async (token, newPassword) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [hashToken(token)]
    );
    const record = rows[0];
    if (!record) throw new ApiError(400, 'Reset link is invalid or has expired');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};