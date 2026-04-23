import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { businesses, storeProfiles, users } from "@workspace/db/schema";
import { eq, isNull } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { requireBusinessOwnerOrAdmin } from "../../middlewares/requireBusinessOwnerOrAdmin.js";
import { generateOpaqueToken, hashPassword } from "../../lib/auth.js";

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

export default router;
