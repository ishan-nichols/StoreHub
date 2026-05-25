// email.ts — transactional email functions powered by Brevo
// All sends go through brevoEmailService → Brevo API.
// In dev with no BREVO_API_KEY set, emails are logged to console.

import { sendTransactionalEmail } from "./brevoEmailService.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

// ─── Template helpers ─────────────────────────────────────────────────────────

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:40px 20px}
  .card{background:#fff;border-radius:12px;padding:40px;max-width:480px;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:22px;color:#18181b;margin:0 0 8px}
  p{color:#52525b;line-height:1.6;margin:0 0 20px}
  .btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px}
  .footer{text-align:center;color:#a1a1aa;font-size:12px;margin-top:32px}
</style>
</head>
<body><div class="card">${body}</div>
<p class="footer">StoreHub · Powered by Brevo</p>
</body></html>`;
}

// ─── Transactional email functions ────────────────────────────────────────────

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${APP_URL}/verify-email?token=${token}`;
  await sendTransactionalEmail(to, "Verify your StoreHub email", layout(`
    <h1>Verify your email</h1>
    <p>Click the button below to verify your email address and activate your account.</p>
    <a href="${url}" class="btn">Verify Email</a>
    <p style="margin-top:20px;font-size:13px;color:#a1a1aa">Link expires in 24 hours.</p>
  `));
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${token}`;
  await sendTransactionalEmail(to, "Reset your StoreHub password", layout(`
    <h1>Reset your password</h1>
    <p>We received a request to reset the password for your account. Click below to choose a new password.</p>
    <a href="${url}" class="btn">Reset Password</a>
    <p style="margin-top:20px;font-size:13px;color:#a1a1aa">Link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `));
}

export async function sendEmployeeInviteEmail(opts: {
  to: string;
  storeName: string;
  inviterName: string;
  token: string;
  roleName?: string;
  prefillName?: string;
}): Promise<void> {
  const url  = `${APP_URL}/join?token=${opts.token}&email=${encodeURIComponent(opts.to)}`;
  const role = opts.roleName ? ` as <strong>${opts.roleName}</strong>` : "";
  await sendTransactionalEmail(
    opts.to,
    `You're invited to join ${opts.storeName} on StoreHub`,
    layout(`
      <h1>You're invited!</h1>
      <p><strong>${opts.inviterName}</strong> has invited you to join <strong>${opts.storeName}</strong>${role} on StoreHub.</p>
      ${opts.prefillName ? `<p>Hi ${opts.prefillName},</p>` : ""}
      <a href="${url}" class="btn">Accept Invitation</a>
      <p style="margin-top:20px;font-size:13px;color:#a1a1aa">This invitation expires in 7 days. If you weren't expecting this, you can ignore it.</p>
    `),
  );
}

export async function sendMfaBackupCodes(to: string, codes: string[]): Promise<void> {
  const list = codes.map((c) => `<li style="font-family:monospace;font-size:16px">${c}</li>`).join("");
  await sendTransactionalEmail(to, "Your StoreHub MFA backup codes", layout(`
    <h1>MFA Backup Codes</h1>
    <p>Save these backup codes in a safe place. Each code can be used once if you lose access to your authenticator app.</p>
    <ul style="padding-left:20px">${list}</ul>
    <p style="color:#ef4444;font-size:13px">These codes will not be shown again.</p>
  `));
}

export async function sendPayslipEmail(opts: {
  to: string;
  employeeName: string;
  storeName: string;
  periodStart: string;
  periodEnd: string;
  grossPay: string;
  netPay: string;
}): Promise<void> {
  await sendTransactionalEmail(opts.to, `Payslip — ${opts.periodStart} to ${opts.periodEnd}`, layout(`
    <h1>Payslip</h1>
    <p>Hi ${opts.employeeName}, here is your payslip for <strong>${opts.storeName}</strong>.</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#52525b">Pay period</td><td style="text-align:right">${opts.periodStart} – ${opts.periodEnd}</td></tr>
      <tr><td style="padding:8px 0;color:#52525b">Gross pay</td><td style="text-align:right">${opts.grossPay}</td></tr>
      <tr style="font-weight:700"><td style="padding:8px 0;border-top:1px solid #e4e4e7">Net pay</td><td style="text-align:right;border-top:1px solid #e4e4e7">${opts.netPay}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#a1a1aa">Log in to StoreHub to view your full payslip details.</p>
  `));
}
