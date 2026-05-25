// brevoEmailService.ts — Brevo email service (transactional, bulk, contacts, campaigns)
//
// REQUIRED SECRETS — add these to artifacts/api-server/.env:
//   BREVO_API_KEY   = "xkeysib-xxxxxxxx..."   ← get from Brevo dashboard → API Keys
//   BREVO_FROM_EMAIL = "noreply@yourstore.com"
//   BREVO_FROM_NAME  = "StoreHub"
//
// The BREVO_API_KEY plugs in here:
//   new BrevoClient({ apiKey: process.env.BREVO_API_KEY })
//
// In dev, if BREVO_API_KEY is not set, all functions log to console instead of sending.

import { BrevoClient } from "@getbrevo/brevo";
import { logger } from "./logger.js";

const FROM_EMAIL = process.env.BREVO_FROM_EMAIL ?? "noreply@storehub.app";
const FROM_NAME  = process.env.BREVO_FROM_NAME  ?? "StoreHub";

function getClient(): BrevoClient {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });
}

function isConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

// ─── Transactional Email ──────────────────────────────────────────────────────
// Use for single triggered emails: welcome, password reset, verification, payslips, etc.

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlContent: string,
): Promise<void> {
  if (!isConfigured()) {
    logger.info({ to, subject }, "[DEV] Brevo transactional email (no BREVO_API_KEY set)");
    logger.info(htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    return;
  }
  try {
    await getClient().transactionalEmails.sendTransacEmail({
      sender:      { email: FROM_EMAIL, name: FROM_NAME },
      to:          [{ email: to }],
      subject,
      htmlContent,
    });
    logger.info({ to, subject }, "Brevo transactional email sent");
  } catch (err) {
    logger.error({ err, to, subject }, "Brevo transactional email failed");
    throw err;
  }
}

// ─── Bulk Email ───────────────────────────────────────────────────────────────
// Use for marketing blasts to a list of contacts (each gets an individual send).

export async function sendBulkEmail(
  contacts: string[],
  subject: string,
  htmlContent: string,
): Promise<void> {
  if (!isConfigured()) {
    logger.info({ count: contacts.length, subject }, "[DEV] Brevo bulk email (no BREVO_API_KEY set)");
    return;
  }
  await Promise.all(contacts.map((email) => sendTransactionalEmail(email, subject, htmlContent)));
}

// ─── Contact Management ───────────────────────────────────────────────────────
// Use to sync customers into Brevo's contact list for marketing.
// Custom attributes (STORE_NAME, TOTAL_SPEND, etc.) must be created in
// Brevo dashboard → Contacts → Settings → Contact attributes before use.

type BrevoAttrValue = string | number | boolean | string[];
type BrevoAttrs = Record<string, BrevoAttrValue>;

export async function createContact(
  email: string,
  firstName?: string,
  phone?: string,
  attributes?: Record<string, BrevoAttrValue>,
): Promise<void> {
  if (!isConfigured()) {
    logger.info({ email }, "[DEV] Brevo createContact (no BREVO_API_KEY set)");
    return;
  }
  const attrs: BrevoAttrs = {
    ...(firstName ? { FIRSTNAME: firstName } : {}),
    ...(phone     ? { SMS: phone }           : {}),
    ...attributes,
  };
  try {
    await getClient().contacts.createContact({ email, attributes: attrs });
    logger.info({ email }, "Brevo contact created");
  } catch (err: any) {
    // Contact already exists — update instead
    if (err?.statusCode === 400 || err?.error?.code === "duplicate_parameter") {
      await updateContact(email, attrs);
      return;
    }
    logger.error({ err, email }, "Brevo createContact failed");
    throw err;
  }
}

export async function updateContact(
  email: string,
  attributes: Record<string, BrevoAttrValue>,
): Promise<void> {
  if (!isConfigured()) {
    logger.info({ email }, "[DEV] Brevo updateContact (no BREVO_API_KEY set)");
    return;
  }
  try {
    await getClient().contacts.updateContact({ identifier: email, attributes });
    logger.info({ email }, "Brevo contact updated");
  } catch (err) {
    logger.error({ err, email }, "Brevo updateContact failed");
    throw err;
  }
}

// ─── Email Campaign ───────────────────────────────────────────────────────────
// Use to send or schedule a marketing campaign to a Brevo contact list.
// listId corresponds to a list in Brevo dashboard → Contacts → Lists.
// scheduledAt is an ISO 8601 string; omit it to send immediately.

export async function sendCampaign(
  listId: number,
  subject: string,
  htmlContent: string,
  scheduledAt?: string,
): Promise<number> {
  if (!isConfigured()) {
    logger.info({ listId, subject }, "[DEV] Brevo campaign (no BREVO_API_KEY set)");
    return 0;
  }
  try {
    const response = await getClient().emailCampaigns.createEmailCampaign({
      name:       subject,
      subject,
      sender:     { email: FROM_EMAIL, name: FROM_NAME },
      htmlContent,
      recipients: { listIds: [listId] },
      ...(scheduledAt ? { scheduledAt } : {}),
    });

    const campaignId = response.id;
    if (!scheduledAt && campaignId) {
      await getClient().emailCampaigns.sendEmailCampaignNow({ campaignId });
    }

    logger.info({ campaignId, listId, subject }, "Brevo campaign created");
    return campaignId ?? 0;
  } catch (err) {
    logger.error({ err, listId, subject }, "Brevo sendCampaign failed");
    throw err;
  }
}
