
const nodemailer = require("nodemailer");

function createTransporter() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_APP_PASSWORD,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_APP_PASSWORD) {
    throw new Error("SMTP configuration is missing from .env");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_APP_PASSWORD,
    },
  });
}

async function sendPasswordResetEmail(email, resetLink) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Rockstar CRM" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Reset your Rockstar CRM password",
    text: [
      "We received a request to reset your Rockstar CRM password.",
      "",
      `Open this link to reset your password: ${resetLink}`,
      "",
      "This link expires in 15 minutes and can only be used once.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Rockstar CRM Password Reset</h2>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetLink}"
             style="display:inline-block;padding:12px 20px;
                    background:#2957a4;color:#ffffff;
                    text-decoration:none;border-radius:5px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in 15 minutes and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
