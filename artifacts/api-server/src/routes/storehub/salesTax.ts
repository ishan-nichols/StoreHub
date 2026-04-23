import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storeProfiles } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { estimateSalesTax } from "../../lib/salesTaxEstimate.js";

const router: IRouter = Router();
router.use(requireAuth);

/**
 * POST /api/store/sales-tax/estimate
 * Body: { latitude?, longitude?, storeCity?, dismissedPromptIds? }
 * Uses saved profile country/state/businessType + optional geo hints.
 */
router.post("/estimate", async (req, res) => {
  try {
    const [profile] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, req.userId!));
    if (!profile) {
      res.status(404).json({ error: "Store profile not found" });
      return;
    }

    const body = (req.body ?? {}) as {
      latitude?: number;
      longitude?: number;
      storeCity?: string;
      dismissedPromptIds?: string[];
    };

    const progress = (profile.onboardingProgress ?? {}) as Record<string, unknown>;
    const dismissedFromProfile = Array.isArray(progress.dismissedTaxPromptIds)
      ? (progress.dismissedTaxPromptIds as string[])
      : [];

    const dismissed = [...new Set([...(body.dismissedPromptIds ?? []), ...dismissedFromProfile])];

    const result = estimateSalesTax({
      country: profile.country,
      stateCode: profile.stateCode,
      businessType: profile.businessType,
      storeCity: body.storeCity ?? profile.storeCity,
      latitude: body.latitude ?? profile.storeLatitude,
      longitude: body.longitude ?? profile.storeLongitude,
      dismissedPromptIds: dismissed,
      confirmedJurisdictionKey: profile.taxJurisdictionKey,
      taxJurisdictionConfirmedAt: profile.taxJurisdictionConfirmedAt,
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * POST /api/store/sales-tax/confirm-jurisdiction
 * Persists confirmation so clients can suppress duplicate prompts.
 */
router.post("/confirm-jurisdiction", async (req, res) => {
  try {
    const { jurisdictionKey } = (req.body ?? {}) as { jurisdictionKey?: string };
    if (!jurisdictionKey?.trim()) {
      res.status(400).json({ error: "jurisdictionKey is required" });
      return;
    }
    const [row] = await db
      .update(storeProfiles)
      .set({
        taxJurisdictionKey: jurisdictionKey.trim().slice(0, 64),
        taxJurisdictionConfirmedAt: new Date(),
        lastUpdated: new Date(),
      })
      .where(eq(storeProfiles.userId, req.userId!))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Store profile not found" });
      return;
    }
    res.json({ ok: true, profile: row });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
