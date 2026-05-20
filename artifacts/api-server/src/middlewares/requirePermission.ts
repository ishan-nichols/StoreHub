import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { employees } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { hasPermission, type Permission } from "../lib/rbac.js";

/**
 * Route-level RBAC guard for employee (portal) requests.
 *
 * Usage:
 *   router.post("/refund", requireAuth, requirePermission("pos.refund"), handler)
 *
 * Store owners always pass (they hold all permissions by definition).
 * Superadmins always pass.
 * Employees are checked against their resolved RBAC permissions.
 *
 * The portal JWT carries employeeId; this middleware resolves permissions from DB.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const role = req.userRole;

    // Store owners and superadmins bypass permission checks
    if (role === "store_owner" || role === "superadmin" || role === "business_owner") {
      next();
      return;
    }

    // For employee portal requests — employeeId injected by portal auth middleware
    const employeeId = (req as Request & { employeeId?: string }).employeeId;
    if (!employeeId || !req.userId) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    try {
      // Fetch legacy permissions from the employees table for backward compat
      const [emp] = await db
        .select({ permissions: employees.permissions })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.userId, req.userId)))
        .limit(1);

      const legacyPerms = (emp?.permissions ?? null) as Record<string, boolean> | null;

      const allowed = await hasPermission(employeeId, req.userId, permission, legacyPerms);
      if (!allowed) {
        res.status(403).json({ error: `Permission denied: ${permission}` });
        return;
      }

      next();
    } catch (err) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}
