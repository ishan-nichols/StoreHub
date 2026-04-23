import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { businesses, storeProfiles, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router: IRouter = Router();

function nextOnboardingStep(step: string | undefined, answers: Record<string, unknown>) {
  const s = step || "welcome";
  if (s === "welcome") {
    return { nextStep: "business", actions: ["POST /api/onboarding/business with businessName"] };
  }
  if (s === "business") {
    return { nextStep: "store_profile", actions: ["POST /api/onboarding/ensure-store-profile with storeName, ownerName"] };
  }
  if (s === "store_profile") {
    const hasLocation = Boolean(answers.hasLocation ?? answers.storeCity);
    if (!hasLocation) {
      return { nextStep: "location", actions: ["Collect storeCity, country, stateCode; optionally POST /api/store/locations"] };
    }
    return { nextStep: "tax", actions: ["POST /api/store/sales-tax/estimate then confirm-jurisdiction if prompts apply"] };
  }
  if (s === "tax") {
    return { nextStep: "done", actions: ["Set onboardingCompleted on profile via PUT /api/store/profile"] };
  }
  return { nextStep: "done", actions: [] };
}

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

    // Check if user has already created a business during onboarding (re-take support)
    const existingUser = await db
      .select({ businessId: users.businessId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let newBusiness;

    if (existingUser[0]?.businessId) {
      // Re-take: update the existing business instead of creating a new one
      const [updated] = await db
        .update(businesses)
        .set({
          name: businessName,
          description: businessDescription || null,
          website: businessWebsite || null,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, existingUser[0].businessId))
        .returning();
      newBusiness = updated;
    } else {
      // First-time onboarding: create the business
      const [created] = await db
        .insert(businesses)
        .values({
          businessOwnerId: userId,
          name: businessName,
          description: businessDescription || null,
          website: businessWebsite || null,
        })
        .returning();
      newBusiness = created;
    }

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

// ─── Onboarding session (persisted on store_profiles) ───────────────────────

router.get("/session", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const [profile] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, req.userId!));
    if (!profile) {
      res.json({
        exists: false,
        currentStep: null,
        progress: {},
        onboardingCompleted: false,
      });
      return;
    }
    res.json({
      exists: true,
      currentStep: profile.onboardingCurrentStep ?? null,
      progress: profile.onboardingProgress ?? {},
      onboardingCompleted: profile.onboardingCompleted,
      storeName: profile.storeName,
      businessType: profile.businessType,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch("/progress", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { patch, currentStep } = (req.body ?? {}) as {
      patch?: Record<string, unknown>;
      currentStep?: string;
    };
    const [existing] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, req.userId!));
    const prev = (existing?.onboardingProgress ?? {}) as Record<string, unknown>;
    const nextProgress = { ...prev, ...(patch ?? {}) };

    if (existing) {
      const [row] = await db
        .update(storeProfiles)
        .set({
          onboardingProgress: nextProgress,
          ...(currentStep !== undefined ? { onboardingCurrentStep: currentStep } : {}),
          lastUpdated: new Date(),
        })
        .where(eq(storeProfiles.userId, req.userId!))
        .returning();
      res.json({ profile: row });
      return;
    }

    res.status(404).json({ error: "Store profile not found — create business first or call ensure-store-profile" });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/decision", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { step, answers } = (req.body ?? {}) as { step?: string; answers?: Record<string, unknown> };
    const plan = nextOnboardingStep(step, answers ?? {});
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

/**
 * Idempotent: ensures a store_profiles row exists for the current user (DB + session consistency).
 * Use after signup / business onboarding before marking onboarding complete.
 */
router.post("/ensure-store-profile", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { storeName, ownerName, businessType, businessId } = (req.body ?? {}) as {
      storeName?: string;
      ownerName?: string;
      businessType?: string;
      businessId?: string;
    };

    const [existing] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));
    if (existing) {
      const [row] = await db
        .update(storeProfiles)
        .set({
          ...(storeName?.trim() ? { storeName: storeName.trim() } : {}),
          ...(ownerName?.trim() ? { ownerName: ownerName.trim() } : {}),
          ...(businessType ? { businessType } : {}),
          ...(businessId ? { businessId } : {}),
          lastUpdated: new Date(),
        })
        .where(eq(storeProfiles.userId, userId))
        .returning();
      res.json({ created: false, profile: row });
      return;
    }

    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const resolvedBusinessId = businessId ?? u?.businessId ?? null;

    const [row] = await db
      .insert(storeProfiles)
      .values({
        userId,
        ...(resolvedBusinessId ? { businessId: resolvedBusinessId } : {}),
        storeName: storeName?.trim() || "My store",
        ownerName: ownerName?.trim() || u?.fullName || "Owner",
        businessType: businessType || "other",
        onboardingCompleted: false,
        storageMode: "cloud",
        lastUpdated: new Date(),
      })
      .returning();

    res.status(201).json({ created: true, profile: row });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
