import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth.js";
import { db } from "@storehub/db";
import { users } from "@storehub/db/schema";
import { eq } from "drizzle-orm";

export async function requireBusinessOwnerOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  // Check if user is superadmin or business_owner
  if (!["superadmin", "business_owner"].includes(payload.role)) {
    res.status(403).json({ error: "Business owner or admin access required" });
    return;
  }

  req.userId = payload.userId;
  req.userRole = payload.role;

  // Fetch businessId for business owners
  if (payload.role === "business_owner") {
    try {
      const user = await db
        .select({ businessId: users.businessId })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (user[0]?.businessId) {
        req.businessId = user[0].businessId;
      }
    } catch (error) {
      console.error("Error fetching businessId:", error);
    }
  }

  next();
}
