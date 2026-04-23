import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { businesses, storeProfiles, users, sales, products, employees } from "@workspace/db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { requireBusinessOwnerOrAdmin } from "../../middlewares/requireBusinessOwnerOrAdmin.js";
import { generateOpaqueToken, hashPassword, validatePasswordStrength } from "../../lib/auth.js";

const router: IRouter = Router();

// GET /api/businesses - List businesses (superadmin: all, business_owner: own)
router.get("/", requireBusinessOwnerOrAdmin as any, async (req: Request, res: Response) => {
  try {
    if (req.userRole === "superadmin") {
      const allBusinesses = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          description: businesses.description,
          website: businesses.website,
          businessOwnerIdId: businesses.businessOwnerId,
          createdAt: businesses.createdAt,
          updatedAt: businesses.updatedAt,
        })
        .from(businesses)
        .where(isNull(businesses.deletedAt));
      res.json({ businesses: allBusinesses });
    } else if (req.userRole === "business_owner" && req.businessId) {
      const business = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, req.businessId))
        .limit(1);
      res.json({ businesses: business });
    } else {
      res.status(403).json({ error: "Business owner or admin access required" });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/businesses - Create new business (superadmin only)
router.post("/", requireAdmin as any, async (req: Request, res: Response) => {
  try {
    const { name, description, website, ownerEmail, ownerName } = req.body;

    if (!name || !ownerEmail || !ownerName) {
      res.status(400).json({ error: "name, ownerEmail, and ownerName are required" });
      return;
    }

    // Create business owner user
    const tempPassword = generateOpaqueToken(12);
    const passwordHash = await hashPassword(tempPassword);

    const [newUser] = await db
      .insert(users)
      .values({
        email: ownerEmail,
        fullName: ownerName,
        passwordHash,
        role: "business_owner",
        emailVerified: true,
      })
      .returning();

    // Create business
    const [newBusiness] = await db
      .insert(businesses)
      .values({
        businessOwnerId: newUser.id,
        name,
        description: description || null,
        website: website || null,
      })
      .returning();

    // Link user to business
    await db
      .update(users)
      .set({ businessId: newBusiness.id })
      .where(eq(users.id, newUser.id));

    res.status(201).json({
      business: newBusiness,
      user: newUser,
      tempPassword,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /api/businesses/:businessId - Get business details
router.get("/:businessId", requireBusinessOwnerOrAdmin as any, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    // Check authorization
    if (req.userRole === "business_owner" && req.businessId !== businessId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const business = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!business[0]) {
      res.status(404).json({ error: "Business not found" });
      return;
    }

    // Get associated stores
    const stores = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.businessId, businessId));

    res.json({
      business: business[0],
      stores,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /api/businesses/:businessId - Update business
router.patch("/:businessId", requireBusinessOwnerOrAdmin as any, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;
    const { name, description, website } = req.body;

    // Check authorization
    if (req.userRole === "business_owner" && req.businessId !== businessId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const [updated] = await db
      .update(businesses)
      .set({
        name: name || undefined,
        description: description || undefined,
        website: website || undefined,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Business not found" });
      return;
    }

    res.json({ business: updated });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/businesses/:businessId - Soft delete business (superadmin only)
router.delete("/:businessId", requireAdmin as any, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    const [deleted] = await db
      .update(businesses)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Business not found" });
      return;
    }

    // Also mark associated stores as deleted (soft delete)
    await db
      .update(storeProfiles)
      .set({
        lastUpdated: new Date(),
      })
      .where(eq(storeProfiles.businessId, businessId));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/businesses/:businessId/stores - Business owner creates a new store
router.post("/:businessId/stores", requireBusinessOwnerOrAdmin as any, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    // Check authorization
    if (req.userRole === "business_owner" && req.businessId !== businessId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    // Verify business exists
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!business) {
      res.status(404).json({ error: "Business not found" });
      return;
    }

    const { email, fullName, storeName, businessType, password } = req.body as {
      email?: string;
      fullName?: string;
      storeName?: string;
      businessType?: string;
      password?: string;
    };

    if (!email || !fullName || !storeName) {
      res.status(400).json({ error: "email, fullName, and storeName are required" });
      return;
    }

    if (password !== undefined && password !== null) {
      const pw = String(password).trim();
      if (pw.length === 0) {
        res.status(400).json({ error: "Password cannot be blank" });
        return;
      }
      const strength = validatePasswordStrength(pw);
      if (!strength.valid) {
        res.status(400).json({ error: strength.reason ?? "Password does not meet policy" });
        return;
      }
    }

    // Check for existing user
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with that email already exists" });
      return;
    }

    const tempPassword =
      password !== undefined && password !== null && String(password).trim() !== ""
        ? String(password).trim()
        : generateOpaqueToken(10);
    const passwordHash = await hashPassword(tempPassword);

    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        fullName: fullName.trim(),
        passwordHash,
        emailVerified: true,
        role: "store_owner",
        businessId,
      })
      .returning();

    await db.insert(storeProfiles).values({
      userId: newUser.id,
      storeName: storeName.trim(),
      ownerName: fullName.trim(),
      businessType: businessType ?? "other",
      onboardingCompleted: false,
      storageMode: "cloud",
      businessId,
      lastUpdated: new Date(),
    });

    res.status(201).json({
      userId: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      tempPassword,
      message: "Store created. Share the temporary password with the store manager.",
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /api/businesses/:businessId/stats - Aggregated stats for a business
router.get("/:businessId/stats", requireBusinessOwnerOrAdmin as any, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.params;

    if (req.userRole === "business_owner" && req.businessId !== businessId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    // Get all stores in this business
    const stores = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.businessId, businessId));

    if (stores.length === 0) {
      res.json({ totalStores: 0, totalRevenue: 0, totalProducts: 0, totalEmployees: 0, stores: [] });
      return;
    }

    // Aggregate stats across all stores
    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const [revenueRow] = await db
          .select({ revenue: sql<number>`coalesce(sum(total), 0)` })
          .from(sales)
          .where(eq(sales.userId, store.userId));

        const [productRow] = await db
          .select({ productCount: sql<number>`count(*)::int` })
          .from(products)
          .where(eq(products.userId, store.userId));

        const [employeeRow] = await db
          .select({ employeeCount: sql<number>`count(*)::int` })
          .from(employees)
          .where(eq(employees.userId, store.userId));

        return {
          ...store,
          revenue: revenueRow?.revenue ?? 0,
          productCount: productRow?.productCount ?? 0,
          employeeCount: employeeRow?.employeeCount ?? 0,
        };
      })
    );

    const totalRevenue   = storesWithStats.reduce((sum, st) => sum + st.revenue,       0);
    const totalProducts  = storesWithStats.reduce((sum, st) => sum + st.productCount,  0);
    const totalEmployees = storesWithStats.reduce((sum, st) => sum + st.employeeCount, 0);

    res.json({
      totalStores: stores.length,
      totalRevenue,
      totalProducts,
      totalEmployees,
      stores: storesWithStats,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
