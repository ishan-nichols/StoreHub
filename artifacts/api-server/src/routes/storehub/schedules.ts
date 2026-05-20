import { Router } from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { schedules, scheduleAvailability, scheduleTemplates } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { logAudit } from "../../lib/audit.js";
import { publishStore } from "../../lib/websocket.js";

const router = Router();
router.use(requireAuth as any);

// ─── Schedules CRUD ───────────────────────────────────────────────────────────

// GET /api/store/schedules?from=ISO&to=ISO&employeeId=
router.get("/", async (req, res) => {
  const { from, to, employeeId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(schedules.storeUserId, req.userId!)];
  if (from) conditions.push(gte(schedules.startsAt, new Date(from)));
  if (to)   conditions.push(lte(schedules.endsAt,   new Date(to)));
  if (employeeId) conditions.push(eq(schedules.employeeId, employeeId));

  const rows = await db
    .select()
    .from(schedules)
    .where(and(...conditions))
    .orderBy(schedules.startsAt);

  return res.json(rows);
});

// POST /api/store/schedules
router.post("/", async (req, res) => {
  const { employeeId, employeeName, locationId, startsAt, endsAt, role, notes } = req.body as {
    employeeId: string; employeeName?: string; locationId?: string;
    startsAt: string; endsAt: string; role?: string; notes?: string;
  };

  if (!employeeId || !startsAt || !endsAt) {
    return res.status(400).json({ error: "employeeId, startsAt, endsAt are required" });
  }

  const [schedule] = await db
    .insert(schedules)
    .values({
      storeUserId:  req.userId!,
      employeeId,
      employeeName: employeeName ?? null,
      locationId:   locationId  ?? null,
      startsAt:     new Date(startsAt),
      endsAt:       new Date(endsAt),
      role:         role  ?? null,
      notes:        notes ?? null,
      createdBy:    req.userId!,
    })
    .returning();

  logAudit({ req }, { action: "schedule.create", resourceType: "schedule", resourceId: schedule.id });
  publishStore(req.userId!, "schedule.created", schedule);
  return res.status(201).json(schedule);
});

// PATCH /api/store/schedules/:id
router.patch("/:id", async (req, res) => {
  const { startsAt, endsAt, role, notes, status, locationId, employeeName } = req.body as {
    startsAt?: string; endsAt?: string; role?: string; notes?: string;
    status?: string; locationId?: string; employeeName?: string;
  };

  const [existing] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, req.params.id), eq(schedules.storeUserId, req.userId!)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Schedule not found" });

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (startsAt)     update.startsAt     = new Date(startsAt);
  if (endsAt)       update.endsAt       = new Date(endsAt);
  if (role)         update.role         = role;
  if (notes)        update.notes        = notes;
  if (locationId)   update.locationId   = locationId;
  if (employeeName) update.employeeName = employeeName;

  if (status) {
    update.status = status;
    if (status === "published")    update.publishedAt    = new Date();
    if (status === "acknowledged") update.acknowledgedAt = new Date();
  }

  const [updated] = await db
    .update(schedules)
    .set(update as any)
    .where(eq(schedules.id, req.params.id))
    .returning();

  logAudit({ req }, { action: "schedule.update", resourceType: "schedule", resourceId: req.params.id, oldValue: existing, newValue: updated });
  publishStore(req.userId!, "schedule.updated", updated);
  return res.json(updated);
});

// DELETE /api/store/schedules/:id
router.delete("/:id", async (req, res) => {
  await db
    .delete(schedules)
    .where(and(eq(schedules.id, req.params.id), eq(schedules.storeUserId, req.userId!)));

  logAudit({ req }, { action: "schedule.delete", resourceType: "schedule", resourceId: req.params.id });
  publishStore(req.userId!, "schedule.deleted", { id: req.params.id });
  return res.json({ success: true });
});

// POST /api/store/schedules/publish — publish all draft schedules in date range
router.post("/publish", async (req, res) => {
  const { from, to } = req.body as { from: string; to: string };
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });

  const updated = await db
    .update(schedules)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schedules.storeUserId, req.userId!),
        eq(schedules.status, "draft"),
        gte(schedules.startsAt, new Date(from)),
        lte(schedules.endsAt,   new Date(to)),
      )
    )
    .returning({ id: schedules.id });

  logAudit({ req }, { action: "schedule.publish_batch", metadata: { from, to, count: updated.length } });
  publishStore(req.userId!, "schedule.batch_published", { count: updated.length });
  return res.json({ published: updated.length });
});

// ─── Availability ─────────────────────────────────────────────────────────────

// GET /api/store/schedules/availability?employeeId=
router.get("/availability", async (req, res) => {
  const { employeeId } = req.query as { employeeId?: string };
  const conditions = [eq(scheduleAvailability.storeUserId, req.userId!)];
  if (employeeId) conditions.push(eq(scheduleAvailability.employeeId, employeeId));

  const rows = await db
    .select()
    .from(scheduleAvailability)
    .where(and(...conditions));

  return res.json(rows);
});

// PUT /api/store/schedules/availability/:employeeId
router.put("/availability/:employeeId", async (req, res) => {
  const { employeeId } = req.params;
  const { availability } = req.body as {
    availability: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isAvailable?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string;
    }>;
  };

  if (!Array.isArray(availability)) {
    return res.status(400).json({ error: "availability must be an array" });
  }

  // Replace all availability records for this employee
  await db
    .delete(scheduleAvailability)
    .where(and(eq(scheduleAvailability.employeeId, employeeId), eq(scheduleAvailability.storeUserId, req.userId!)));

  if (availability.length > 0) {
    await db.insert(scheduleAvailability).values(
      availability.map((a) => ({
        storeUserId:   req.userId!,
        employeeId,
        dayOfWeek:     a.dayOfWeek,
        startTime:     a.startTime,
        endTime:       a.endTime,
        isAvailable:   a.isAvailable ?? true,
        effectiveFrom: a.effectiveFrom ?? null,
        effectiveTo:   a.effectiveTo   ?? null,
      }))
    );
  }

  return res.json({ success: true, count: availability.length });
});

// ─── Templates ────────────────────────────────────────────────────────────────

router.get("/templates", async (req, res) => {
  const rows = await db
    .select()
    .from(scheduleTemplates)
    .where(eq(scheduleTemplates.storeUserId, req.userId!));
  return res.json(rows);
});

router.post("/templates", async (req, res) => {
  const { name, pattern } = req.body as { name: string; pattern: unknown[] };
  if (!name) return res.status(400).json({ error: "name is required" });

  const [tmpl] = await db
    .insert(scheduleTemplates)
    .values({ storeUserId: req.userId!, name, pattern: pattern ?? [] })
    .returning();

  return res.status(201).json(tmpl);
});

export default router;
