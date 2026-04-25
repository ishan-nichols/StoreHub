/**
 * /api/businesses  —  Business management routes
 *
 * All routes that need business-owner or admin access chain:
 *   requireAuth  →  requireBusinessOwnerOrAdmin
 *
 * requireAuth    : verifies JWT, populates req.userId / req.userRole / req.businessId
 * requireBOorAdmin : guards that role is business_owner | superadmin
 * requireAdmin   : guards that role is superadmin (for admin-only routes)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  businesses, storeProfiles, users,
  sales, products, employees,
} from "@workspace/db/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireBusinessOwnerOrAdmin } from "../../middlewares/requireBusinessOwnerOrAdmin.js";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import {
  generateOpaqueToken, hashPassword, validatePasswordStrength,
} from "../../lib/auth.js";

const router = Router();

// ── Authorization helpers ─────────────────────────────────────────────────────

/** True when the caller may read/write the given businessId. */
function canAccess(req: Request, businessId: string): boolean {
  return req.userRole === "superadmin" || req.businessId === businessId;
}

function notAuthorized(res: Response): void {
  res.status(403).json({ error: "You do not have access to this business" });
}

// ── GET /api/businesses ───────────────────────────────────────────────────────
// Superadmin → all businesses.
// Business owner → their own business (empty array if none set up yet).

router.get(
  "/",
  requireAuth as any,
  requireBusinessOwnerOrAdmin as any,
  async (req: Request, res: Response) => {
    try {
      if (req.userRole === "superadmin") {
        const all = await db
          .select()
          .from(businesses)
          .where(isNull(businesses.deletedAt));
        res.json({ businesses: all });
        return;
      }

      // Business owner with no business yet — not an error, just nothing to show.
      if (!req.businessId) {
        res.json({ businesses: [] });
        return;
      }

      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, req.businessId))
        .limit(1);

      res.json({ businesses: biz ? [biz] : [] });
    } catch (err) {
      console.error("[GET /businesses]", err);
      res.status(500).json({ error: "Failed to load businesses" });
    }
  },
);

// ── POST /api/businesses ──────────────────────────────────────────────────────
// Superadmin only: create a new business and its owner account.

router.post(
  "/",
  requireAuth as any,
  requireAdmin as any,
  async (req: Request, res: Response) => {
    try {
      const { name, description, website, ownerEmail, ownerName } = req.body as {
        name?: string; description?: string; website?: string;
        ownerEmail?: string; ownerName?: string;
      };

      if (!name?.trim() || !ownerEmail?.trim() || !ownerName?.trim()) {
        res.status(400).json({ error: "name, ownerEmail, and ownerName are required" });
        return;
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, ownerEmail.toLowerCase()))
        .limit(1);

      if (existing) {
        res.status(409).json({ error: "An account with that email already exists" });
        return;
      }

      const tempPassword = generateOpaqueToken(12);
      const passwordHash = await hashPassword(tempPassword);

      const [newUser] = await db.insert(users).values({
        email: ownerEmail.toLowerCase(),
        fullName: ownerName.trim(),
        passwordHash,
        role: "business_owner",
        emailVerified: true,
      }).returning();

      const [newBusiness] = await db.insert(businesses).values({
        businessOwnerId: newUser.id,
        name: name.trim(),
        description: description?.trim() ?? null,
        website: website?.trim() ?? null,
      }).returning();

      await db.update(users)
        .set({ businessId: newBusiness.id })
        .where(eq(users.id, newUser.id));

      res.status(201).json({ business: newBusiness, user: newUser, tempPassword });
    } catch (err) {
      console.error("[POST /businesses]", err);
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// ── GET /api/businesses/:businessId ──────────────────────────────────────────

router.get(
  "/:businessId",
  requireAuth as any,
  requireBusinessOwnerOrAdmin as any,
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    if (!canAccess(req, businessId)) { notAuthorized(res); return; }

    try {
      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);

      if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

      const stores = await db
        .select()
        .from(storeProfiles)
        .where(eq(storeProfiles.businessId, businessId));

      res.json({ business: biz, stores });
    } catch (err) {
      console.error("[GET /businesses/:id]", err);
      res.status(500).json({ error: "Failed to load business" });
    }
  },
);

// ── PATCH /api/businesses/:businessId ────────────────────────────────────────

router.patch(
  "/:businessId",
  requireAuth as any,
  requireBusinessOwnerOrAdmin as any,
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    if (!canAccess(req, businessId)) { notAuthorized(res); return; }

    try {
      const { name, description, website } = req.body as {
        name?: string; description?: string | null; website?: string | null;
      };

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name?.trim())             patch.name        = name.trim();
      if (description !== undefined) patch.description = description || null;
      if (website !== undefined)     patch.website     = website || null;

      const [updated] = await db
        .update(businesses)
        .set(patch)
        .where(eq(businesses.id, businessId))
        .returning();

      if (!updated) { res.status(404).json({ error: "Business not found" }); return; }

      res.json({ business: updated });
    } catch (err) {
      console.error("[PATCH /businesses/:id]", err);
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// ── DELETE /api/businesses/:businessId ───────────────────────────────────────
// Superadmin only — soft delete.

router.delete(
  "/:businessId",
  requireAuth as any,
  requireAdmin as any,
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    try {
      const [deleted] = await db
        .update(businesses)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(businesses.id, businessId))
        .returning();

      if (!deleted) { res.status(404).json({ error: "Business not found" }); return; }
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /businesses/:id]", err);
      res.status(500).json({ error: "Failed to delete business" });
    }
  },
);

// ── POST /api/businesses/:businessId/stores ───────────────────────────────────
// Business owner creates a new store (sub-account) under their business.

router.post(
  "/:businessId/stores",
  requireAuth as any,
  requireBusinessOwnerOrAdmin as any,
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    if (!canAccess(req, businessId)) { notAuthorized(res); return; }

    try {
      // Confirm business exists and is not deleted.
      const [biz] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
        .limit(1);

      if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

      const { email, fullName, storeName, businessType, password } = req.body as {
        email?: string; fullName?: string; storeName?: string;
        businessType?: string; password?: string;
      };

      if (!storeName?.trim()) {
        res.status(400).json({ error: "storeName is required" });
        return;
      }

      // Determine if a manager is being explicitly assigned or if the business
      // owner is acting as the initial manager themselves.
      const assigningManager = !!(email?.trim() && fullName?.trim());

      // Validate custom password if provided.
      const customPw = password?.trim();
      if (customPw) {
        const check = validatePasswordStrength(customPw);
        if (!check.valid) {
          res.status(400).json({ error: check.reason ?? "Password does not meet requirements" });
          return;
        }
      }

      let storeOwnerName: string;
      let storeEmail: string | null;

      if (assigningManager) {
        // Explicit manager — reject if email already exists.
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email!.toLowerCase()))
          .limit(1);
        if (existing) {
          res.status(409).json({ error: "An account with that email already exists" });
          return;
        }
        storeOwnerName = fullName!.trim();
        storeEmail     = email!.toLowerCase();
      } else {
        // No manager assigned — use the business owner's own name.
        const [owner] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, req.userId!))
          .limit(1);
        storeOwnerName = owner?.fullName ?? "Store Owner";
        storeEmail     = null; // email-less sub-account; owner accesses via store-view mode
      }

      const storePassword = customPw || generateOpaqueToken(10);
      const passwordHash  = await hashPassword(storePassword);

      const [newUser] = await db.insert(users).values({
        email:         storeEmail,
        fullName:      storeOwnerName,
        passwordHash,
        emailVerified: true,
        role:          "store_owner",
        businessId,
      }).returning();

      await db.insert(storeProfiles).values({
        userId:              newUser.id,
        storeName:           storeName.trim(),
        ownerName:           storeOwnerName,
        businessType:        businessType ?? "other",
        businessId,
        onboardingCompleted: false,
        storageMode:         "cloud",
        lastUpdated:         new Date(),
      });

      res.status(201).json({
        userId:          newUser.id,
        email:           newUser.email,
        fullName:        newUser.fullName,
        tempPassword:    assigningManager ? storePassword : null,
        selfManaged:     !assigningManager,
        message:         assigningManager
          ? "Store created. Share the credentials with the store manager."
          : "Store created. You are the initial manager — enter the store to complete setup.",
      });
    } catch (err) {
      console.error("[POST /businesses/:id/stores]", err);
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

// ── GET /api/businesses/:businessId/stats ─────────────────────────────────────
// Returns per-store stats (revenue, product count, employee count) plus totals.

router.get(
  "/:businessId/stats",
  requireAuth as any,
  requireBusinessOwnerOrAdmin as any,
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    if (!canAccess(req, businessId)) { notAuthorized(res); return; }

    try {
      const stores = await db
        .select({
          userId:              storeProfiles.userId,
          storeName:           storeProfiles.storeName,
          ownerName:           storeProfiles.ownerName,
          businessType:        storeProfiles.businessType,
          onboardingCompleted: storeProfiles.onboardingCompleted,
          storageMode:         storeProfiles.storageMode,
          storeCity:           storeProfiles.storeCity,
          createdAt:           storeProfiles.createdAt,
          lastUpdated:         storeProfiles.lastUpdated,
        })
        .from(storeProfiles)
        .where(eq(storeProfiles.businessId, businessId));

      // Aggregate per-store metrics in parallel.
      const storesWithStats = await Promise.all(
        stores.map(async (store) => {
          const [revRow] = await db
            .select({ v: sql<number>`coalesce(sum(total), 0)` })
            .from(sales)
            .where(eq(sales.userId, store.userId));

          const [prodRow] = await db
            .select({ v: sql<number>`count(*)::int` })
            .from(products)
            .where(eq(products.userId, store.userId));

          const [empRow] = await db
            .select({ v: sql<number>`count(*)::int` })
            .from(employees)
            .where(eq(employees.userId, store.userId));

          return {
            ...store,
            revenue:       Number(revRow?.v  ?? 0),
            productCount:  Number(prodRow?.v ?? 0),
            employeeCount: Number(empRow?.v  ?? 0),
          };
        }),
      );

      res.json({
        totalStores:    storesWithStats.length,
        totalRevenue:   storesWithStats.reduce((s, r) => s + r.revenue,       0),
        totalProducts:  storesWithStats.reduce((s, r) => s + r.productCount,  0),
        totalEmployees: storesWithStats.reduce((s, r) => s + r.employeeCount, 0),
        stores:         storesWithStats,
      });
    } catch (err) {
      console.error("[GET /businesses/:id/stats]", err);
      res.status(500).json({ error: "Failed to load stats" });
    }
  },
);

export default router;
