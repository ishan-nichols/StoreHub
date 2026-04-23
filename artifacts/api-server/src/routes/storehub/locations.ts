import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storeLocations, storeProfiles } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(storeLocations)
    .where(eq(storeLocations.userId, req.userId!));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [profile] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, req.userId!));
  const businessId = profile?.businessId ?? null;
  const isDefault = Boolean(body.isDefault);

  const createdRows = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx
        .update(storeLocations)
        .set({ isDefault: false })
        .where(eq(storeLocations.userId, req.userId!));
    }
    return tx
      .insert(storeLocations)
      .values({
        userId: req.userId!,
        businessId,
        name,
        isDefault,
        addressLine1: typeof body.addressLine1 === "string" ? body.addressLine1 : null,
        city: typeof body.city === "string" ? body.city : null,
        stateCode: typeof body.stateCode === "string" ? body.stateCode : null,
        postalCode: typeof body.postalCode === "string" ? body.postalCode : null,
        country: typeof body.country === "string" ? body.country.slice(0, 2).toUpperCase() : null,
        latitude: typeof body.latitude === "number" ? body.latitude : null,
        longitude: typeof body.longitude === "number" ? body.longitude : null,
        taxRateOverride: typeof body.taxRateOverride === "number" ? body.taxRateOverride : null,
      })
      .returning();
  });

  const created = createdRows[0];
  res.status(201).json(created);
});

router.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const isDefault = body.isDefault === true;

  const updatedRow = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(storeLocations)
      .where(and(eq(storeLocations.id, id), eq(storeLocations.userId, req.userId!)));
    if (!existing) return null;

    if (isDefault) {
      await tx
        .update(storeLocations)
        .set({ isDefault: false })
        .where(eq(storeLocations.userId, req.userId!));
    }

    const patch: Partial<typeof storeLocations.$inferInsert> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.addressLine1 === "string") patch.addressLine1 = body.addressLine1;
    if (typeof body.city === "string") patch.city = body.city;
    if (typeof body.stateCode === "string") patch.stateCode = body.stateCode;
    if (typeof body.postalCode === "string") patch.postalCode = body.postalCode;
    if (typeof body.country === "string") patch.country = body.country.slice(0, 2).toUpperCase();
    if (typeof body.latitude === "number") patch.latitude = body.latitude;
    if (typeof body.longitude === "number") patch.longitude = body.longitude;
    if (typeof body.taxRateOverride === "number") patch.taxRateOverride = body.taxRateOverride;
    if (body.isDefault !== undefined) patch.isDefault = Boolean(body.isDefault);

    const [u] = await tx
      .update(storeLocations)
      .set(patch)
      .where(and(eq(storeLocations.id, id), eq(storeLocations.userId, req.userId!)))
      .returning();
    return u ?? null;
  });

  if (!updatedRow) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updatedRow);
});

router.delete("/:id", async (req, res) => {
  const [row] = await db
    .delete(storeLocations)
    .where(and(eq(storeLocations.id, req.params.id), eq(storeLocations.userId, req.userId!)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
