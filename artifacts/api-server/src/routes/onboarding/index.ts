import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { businesses, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router: IRouter = Router();

/**
 * POST /api/onboarding/business
 * Create a new business during onboarding.
 * Called after signup/login, before store profile creation.
 *
 * Creates:
 * 1. Business record (businessOwnerId = current user)
 * 2. Updates user role to "business_owner"
 * 3. Links user to business via businessId
 */
router.post("/business", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { businessName, businessDescription, businessWebsite } = req.body;

    if (!businessName) {
      res.status(400).json({ error: "businessName is required" });
      return;
    }

    const userId = req.userId!;

    // Check if user has already created a business during onboarding
    const existingUser = await db
      .select({ businessId: users.businessId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser[0]?.businessId) {
      res.status(400).json({ error: "User has already created a business" });
      return;
    }

    // Create business
    const [newBusiness] = await db
      .insert(businesses)
      .values({
        businessOwnerId: userId,
        name: businessName,
        description: businessDescription || null,
        website: businessWebsite || null,
      })
      .returning();

    // Update user: set role to business_owner and link to business
    const [updatedUser] = await db
      .update(users)
      .set({
        role: "business_owner",
        businessId: newBusiness.id,
      })
      .where(eq(users.id, userId))
      .returning();

    res.status(201).json({
      business: newBusiness,
      user: updatedUser,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
