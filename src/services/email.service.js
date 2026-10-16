const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env"
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === "true", // false for port 587 (STARTTLS), true for 465
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS.replace(/\s+/g, ""), // Google shows app passwords with spaces
    },
  });

  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await getTransporter().sendMail({ from, to, subject, text, html });
    console.log("[MAIL] Sent to:", to, "| messageId:", info.messageId, "| response:", info.response);
    return info;
  } catch (err) {
    console.error("[MAIL] Send failed:", err.code, err.message);
    throw err;
  }
}

async function sendPasswordResetEmail(to, resetLink) {
  const minutes = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 15);

  return sendMail({
    to,
    subject: "Rockstar CRM Password Reset",
    text:
      `We received a request to reset your password.\n\n` +
      `Reset Password: ${resetLink}\n\n` +
      `This link expires in ${minutes} minutes and can only be used once.\n\n` +
      `If you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px;">
        <h2>Rockstar CRM Password Reset</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetLink}"
             style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in ${minutes} minutes and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>`,
  });
}

module.exports = { sendMail, sendPasswordResetEmail };