import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { analyticsEvents } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router: IRouter = Router();

/**
 * POST /api/analytics/event
 * Lightweight product analytics (onboarding funnel, feature usage, etc.).
 */
router.post("/event", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { name, properties } = (req.body ?? {}) as {
      name?: string;
      properties?: Record<string, unknown>;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [row] = await db
      .insert(analyticsEvents)
      .values({
        userId: req.userId!,
        actorUserId: req.userId!,
        eventName: name.trim().slice(0, 120),
        properties: properties ?? {},
      })
      .returning();
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
