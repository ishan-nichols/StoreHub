import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { userIntegrations } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { generateOpaqueToken } from "../../lib/auth.js";

const router: IRouter = Router();

const POS_PROVIDERS = [
  { id: "square", name: "Square", oauth: true, docsUrl: "https://developer.squareup.com/docs/oauth-api/overview" },
  { id: "clover", name: "Clover", oauth: true, docsUrl: "https://docs.clover.com/docs/oauth-intro" },
  { id: "toast", name: "Toast", oauth: true, docsUrl: "https://doc.toasttab.com/doc/devguide/apiOAuth.html" },
  { id: "lightspeed", name: "Lightspeed (R-Series)", oauth: true, docsUrl: "https://developers.lightspeedhq.com/retail/authentication" },
  { id: "verifone", name: "Verifone / Commander", oauth: false, docsUrl: "https://developer.verifone.com/" },
] as const;

router.use(requireAuth);

router.get("/pos/providers", async (_req: Request, res: Response) => {
  res.json({ providers: POS_PROVIDERS });
});

router.get("/pos/status", async (req: Request, res: Response) => {
  const rows = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, req.userId!));
  res.json({ integrations: rows });
});

/**
 * POST /api/integrations/pos/link/start
 * Prepares OAuth state; returns placeholder URL until provider env is configured.
 */
router.post("/pos/link/start", async (req: Request, res: Response) => {
  const { systemId, redirectUri } = (req.body ?? {}) as { systemId?: string; redirectUri?: string };
  if (!systemId?.trim()) {
    res.status(400).json({ error: "systemId is required" });
    return;
  }
  const provider = POS_PROVIDERS.find((p) => p.id === systemId);
  if (!provider) {
    res.status(400).json({ error: "Unknown POS provider" });
    return;
  }

  const state = generateOpaqueToken(16);
  const sid = systemId.trim();
  const [existing] = await db
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, req.userId!), eq(userIntegrations.systemId, sid)))
    .limit(1);
  if (existing) {
    await db
      .update(userIntegrations)
      .set({
        status: "link_pending",
        metadata: { oauthState: state, redirectUri: redirectUri ?? null },
      })
      .where(eq(userIntegrations.id, existing.id));
  } else {
    await db.insert(userIntegrations).values({
      userId: req.userId!,
      systemId: sid,
      status: "link_pending",
      metadata: { oauthState: state, redirectUri: redirectUri ?? null },
    });
  }

  res.status(202).json({
    systemId: provider.id,
    oauth: provider.oauth,
    state,
    oauthUrl: null,
    message:
      provider.oauth
        ? "OAuth authorize URL is not configured on this server yet. Store oauthState client-side and complete the provider flow when credentials are provisioned."
        : "This integration uses API keys or device pairing — use provider-specific setup in the dashboard.",
  });
});

export default router;
