// emailService.ts — frontend email stub
// All email sending is handled server-side via Brevo (brevoEmailService.ts).
// Never put BREVO_API_KEY in frontend code — it must stay server-side.
//
// To send transactional emails from the frontend, call the backend endpoint:
//   POST /api/campaigns/send-email
//   Body: { to, subject, htmlContent }
//   The backend calls brevoEmailService.sendTransactionalEmail()

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<EmailResult> {
  try {
    const res = await fetch("/api/campaigns/send-email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, htmlContent: htmlBody }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false, error };
    }
    const data = await res.json();
    return { ok: true, id: data.messageId };
  } catch (e) {
    console.error("[emailService] send failed", e);
    return { ok: false, error: (e as Error).message };
  }
}

export default { sendEmail };
