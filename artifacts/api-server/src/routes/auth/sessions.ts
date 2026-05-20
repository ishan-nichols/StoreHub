import { Router } from "express";
import { eq, and, gt, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { refreshTokens } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { logAudit } from "../../lib/audit.js";

const router = Router();
router.use(requireAuth as any);

// ─── List Active Sessions ─────────────────────────────────────────────────────
// GET /api/auth/sessions

router.get("/", async (req, res) => {
  const sessions = await db
    .select({
      id:            refreshTokens.id,
      deviceName:    refreshTokens.deviceName,
      deviceType:    refreshTokens.deviceType,
      deviceInfo:    refreshTokens.deviceInfo,
      lastUsedAt:    refreshTokens.lastUsedAt,
      lastIpAddress: refreshTokens.lastIpAddress,
      createdAt:     refreshTokens.createdAt,
      expiresAt:     refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, req.userId!),
        gt(refreshTokens.expiresAt, new Date()),
      )
    )
    .orderBy(refreshTokens.lastUsedAt);

  return res.json(sessions);
});

// ─── Revoke a Specific Session ────────────────────────────────────────────────
// DELETE /api/auth/sessions/:id

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const [session] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.id, id), eq(refreshTokens.userId, req.userId!)))
    .limit(1);

  if (!session) return res.status(404).json({ error: "Session not found" });

  await db.delete(refreshTokens).where(eq(refreshTokens.id, id));

  logAudit({ req }, {
    action:       "auth.session_revoke",
    resourceType: "session",
    resourceId:   id,
  });

  return res.json({ success: true });
});

// ─── Revoke All Other Sessions ────────────────────────────────────────────────
// DELETE /api/auth/sessions  (body: { currentTokenId? })

router.delete("/", async (req, res) => {
  const { currentTokenId } = req.body as { currentTokenId?: string };

  const where = currentTokenId
    ? and(eq(refreshTokens.userId, req.userId!), ne(refreshTokens.id, currentTokenId))
    : eq(refreshTokens.userId, req.userId!);

  await db.delete(refreshTokens).where(where);

  logAudit({ req }, { action: "auth.sessions_revoke_all" });

  return res.json({ success: true });
});

export default router;
