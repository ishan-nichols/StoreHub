import type { Request, Response, NextFunction } from "express";

/**
 * Role guard for routes that require business_owner or superadmin access.
 *
 * MUST be chained after requireAuth — that middleware is responsible for
 * verifying the JWT and populating req.userId, req.userRole, and req.businessId.
 */
export function requireBusinessOwnerOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.userRole !== "superadmin" && req.userRole !== "business_owner") {
    res.status(403).json({ error: "Business owner or admin access required" });
    return;
  }
  next();
}

// Kept for backwards compatibility with any import that references this name.
// The single source-of-truth cache now lives in requireAuth.ts.
export function invalidateBusinessOwnerAdminCache(_userId: string): void {
  // no-op — use invalidateBusinessIdCache from requireAuth instead
}
