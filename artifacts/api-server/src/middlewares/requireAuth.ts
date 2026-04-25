import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth.js";
import { db } from "@workspace/db";
import { users, storeProfiles } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

// ── Business-ID cache ─────────────────────────────────────────────────────────

const TTL = 2 * 60 * 1000;

interface CacheEntry {
  businessId: string;
  expiresAt:  number;
}

const cache = new Map<string, CacheEntry>();

export function invalidateBusinessIdCache(userId: string): void {
  cache.delete(userId);
}

async function resolveBusinessId(userId: string): Promise<string | undefined> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.businessId;

  const [row] = await db
    .select({ businessId: users.businessId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const id = row?.businessId ?? undefined;
  if (id) cache.set(userId, { businessId: id, expiresAt: Date.now() + TTL });
  return id;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function requireAuth(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  // Idempotent — sub-routers call requireAuth again; only process the JWT once.
  if ((req as any)._authDone) { next(); return; }
  (req as any)._authDone = true;

  const token = req.cookies?.sh_access as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Session expired — please log in again" });
    return;
  }

  req.userId   = payload.userId;
  req.userRole = payload.role;

  // Superadmin store-view: X-Store-User-Id scopes the request to a specific store.
  // No ownership check required — superadmin can enter any store.
  if (payload.role === "superadmin") {
    const targetStoreId = (req.headers["x-store-user-id"] as string) || undefined;
    if (targetStoreId) {
      req.userId   = targetStoreId;
      req.userRole = "store_owner";
    }
    next();
    return;
  }

  if (payload.role === "business_owner") {
    // Resolve businessId from DB (cached 2 min) so route handlers don't repeat the query.
    try {
      req.businessId = await resolveBusinessId(payload.userId);
    } catch {
      // Non-fatal: individual routes will gate access.
    }

    // Store-view mode: a business owner passes X-Store-User-Id to manage one specific
    // store. We verify ownership then impersonate the store for data-scoping purposes.
    // The business owner's JWT is never changed — only req.userId/userRole for this request.
    const targetStoreId = (req.headers["x-store-user-id"] as string) || undefined;
    if (targetStoreId && req.businessId) {
      try {
        const [sp] = await db
          .select({ userId: storeProfiles.userId })
          .from(storeProfiles)
          .where(and(
            eq(storeProfiles.userId,    targetStoreId),
            eq(storeProfiles.businessId, req.businessId),
          ))
          .limit(1);

        if (sp) {
          req.userId   = targetStoreId;
          req.userRole = "store_owner";
        }
      } catch {
        // Non-fatal: fall back to normal business-owner access.
      }
    }
  }

  next();
}
