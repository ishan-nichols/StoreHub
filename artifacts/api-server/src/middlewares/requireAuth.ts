import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth.js";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const BUSINESS_LOOKUP_TTL_MS = 2 * 60 * 1000;
const businessIdCache = new Map<string, { businessId: string; expiresAt: number }>();

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const accessToken = req.cookies?.sh_access as string | undefined;
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyAccessToken(accessToken);
  if (!payload) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  req.userId = payload.userId;
  req.userRole = payload.role;

  // Fetch businessId for business owners
  if (payload.role === "business_owner") {
    try {
      const cached = businessIdCache.get(payload.userId);
      if (cached && cached.expiresAt > Date.now()) {
        req.businessId = cached.businessId;
        next();
        return;
      }

      const user = await db
        .select({ businessId: users.businessId })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (user[0]?.businessId) {
        req.businessId = user[0].businessId;
        businessIdCache.set(payload.userId, {
          businessId: user[0].businessId,
          expiresAt: Date.now() + BUSINESS_LOOKUP_TTL_MS,
        });
      }
    } catch (error) {
      console.error("Error fetching businessId:", error);
    }
  }

  next();
}
