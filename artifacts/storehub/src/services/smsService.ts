// smsService.ts — minimal Twilio integration wrapper (client-side stub)
// NOTE: For production, send SMS from a trusted backend using server-side Twilio credentials.
// Place your Twilio credentials in server-side secrets; do NOT put them in client JS.

// Twilio credential placeholders (server-side only):
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

export interface SmsResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(to: string, body: string): Promise<SmsResult> {
  console.log(`[smsService] sendSMS to=${to} body=${body}`);
  try {
    // Client-side stub: in production call your server endpoint which calls Twilio REST API.
    // Example server-side code (Node/Express):
    // const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // const msg = await client.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to });
    // return { ok: true, messageId: msg.sid };

    // For now, simulate success.
    return { ok: true, messageId: `sim-${Date.now()}` };
  } catch (e) {
    console.error('[smsService] send failed', e);
    return { ok: false, error: (e as Error).message };
  }
}

export default { sendSMS };
