const nodemailer = require('nodemailer');

// Generic SMTP transporter — works with Gmail (App Password) or any other
// email provider (Outlook, Hostinger, cPanel mail, etc.) by just changing
// the SMTP_* values in .env. No code change needed to switch providers.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587/25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPasswordResetAlert({ userName, username, branchName }) {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    console.error('SUPER_ADMIN_EMAIL is not set in .env — cannot send password reset alert.');
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: superAdminEmail,
    subject: `Password Reset Request — ${branchName}`,
    text:
      `${userName} (username: ${username}) at ${branchName} has requested a password reset.\n\n` +
      `Please log in to the Admin panel (Administration → Users & Roles → Change Password) ` +
      `to set a new password for this user, then share it with them directly.`,
  });
}

// Sent whenever anyone deletes an inventory item, vendor, cashbook entry, or
// sale. The item is only soft-deleted (moved to Trash for 3 days, kept in
// the database forever) — this email just keeps the super admin informed of
// who deleted what, from which branch.
async function sendDeletionAlert({ username, branchName, itemType, itemDescription }) {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!superAdminEmail) {
    console.error('SUPER_ADMIN_EMAIL is not set in .env — cannot send deletion alert.');
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: superAdminEmail,
    subject: `Item Deleted — ${branchName}`,
    text:
      `${username} at ${branchName} deleted a ${itemType}:\n${itemDescription}\n\n` +
      `This has been moved to Trash and will remain visible there for 3 days before disappearing ` +
      `from the Trash view. The record itself is never permanently removed from the database.`,
  });
}

module.exports = { sendPasswordResetAlert, sendDeletionAlert };
