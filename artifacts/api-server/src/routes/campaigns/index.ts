// campaigns/index.ts — backend endpoint for sending campaign emails via Brevo
import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { sendTransactionalEmail, sendBulkEmail } from "../../lib/brevoEmailService.js";

const router = Router();
router.use(requireAuth);

// POST /api/campaigns/send-email
// Sends a single transactional email via Brevo.
// Body: { to: string, subject: string, htmlContent: string }
router.post("/send-email", async (req, res) => {
  const { to, subject, htmlContent } = req.body as {
    to?: string;
    subject?: string;
    htmlContent?: string;
  };

  if (!to || !subject || !htmlContent) {
    res.status(400).json({ error: "to, subject, and htmlContent are required" });
    return;
  }

  try {
    await sendTransactionalEmail(to, subject, htmlContent);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/campaigns/send-bulk
// Sends a bulk marketing email to a list of contacts via Brevo.
// Body: { contacts: string[], subject: string, htmlContent: string }
router.post("/send-bulk", async (req, res) => {
  const { contacts, subject, htmlContent } = req.body as {
    contacts?: string[];
    subject?: string;
    htmlContent?: string;
  };

  if (!Array.isArray(contacts) || !subject || !htmlContent) {
    res.status(400).json({ error: "contacts (array), subject, and htmlContent are required" });
    return;
  }

  try {
    await sendBulkEmail(contacts, subject, htmlContent);
    res.json({ ok: true, sent: contacts.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
