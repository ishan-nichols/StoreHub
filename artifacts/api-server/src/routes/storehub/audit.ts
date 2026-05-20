import { Router } from "express";
import { eq, and, desc, gte, lte, like, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogs } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();
router.use(requireAuth as any);

// GET /api/store/audit-logs
// Query params: page, limit, action, resourceType, from, to, actorId

router.get("/", async (req, res) => {
  const {
    page  = "1",
    limit = "50",
    action,
    resourceType,
    from,
    to,
    actorId,
  } = req.query as Record<string, string | undefined>;

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [eq(auditLogs.storeUserId, req.userId!)];

  if (action)       conditions.push(like(auditLogs.action, `${action}%`));
  if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
  if (actorId)      conditions.push(eq(auditLogs.actorId, actorId));
  if (from)         conditions.push(gte(auditLogs.createdAt, new Date(from)));
  if (to)           conditions.push(lte(auditLogs.createdAt, new Date(to)));

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id:           auditLogs.id,
        actorId:      auditLogs.actorId,
        actorRole:    auditLogs.actorRole,
        action:       auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId:   auditLogs.resourceId,
        oldValue:     auditLogs.oldValue,
        newValue:     auditLogs.newValue,
        ipAddress:    auditLogs.ipAddress,
        metadata:     auditLogs.metadata,
        createdAt:    auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitNum)
      .offset(offset),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);

  return res.json({
    data:       rows,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

export default router;
