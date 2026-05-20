// emailService.ts — minimal SendGrid/Mailgun wrapper (client-side stub)
// NOTE: Send emails from server-side with provider API keys in secrets; do not embed keys in client bundles.

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<EmailResult> {
  console.log(`[emailService] sendEmail to=${to} subject=${subject}`);
  try {
    // In production call server endpoint which calls SendGrid/Mailgun SDK with API key.
    // Example SendGrid (server):
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, from: process.env.MAIL_FROM, subject, html: htmlBody });

    return { ok: true, id: `sim-${Date.now()}` };
  } catch (e) {
    console.error('[emailService] send failed', e);
    return { ok: false, error: (e as Error).message };
  }
}

export default { sendEmail };
