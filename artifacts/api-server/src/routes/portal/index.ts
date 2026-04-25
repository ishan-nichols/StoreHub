/**
 * /api/portal — Public kiosk endpoints for the employee portal.
 *
 * Most routes are intentionally unauthenticated (no requireAuth).
 * The storeUserId in the URL identifies the store; a short-lived
 * portal JWT is issued after successful PIN verification and used
 * for subsequent actions (clock-in/out, shift history).
 *
 * Manager-only route (PATCH /manager-pin) still requires a regular
 * session cookie so only the store owner can set their portal PIN.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, isNull, gte, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { storeProfiles, employees, shifts } from "@workspace/db";
import {
  signPortalToken, verifyPortalToken, type PortalJWTPayload,
} from "../../lib/auth.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

// ── Portal auth middleware ────────────────────────────────────────────────────

interface PortalRequest extends Request {
  portal: PortalJWTPayload;
}

function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-portal-token"] as string | undefined;
  if (!token) { res.status(401).json({ error: "Portal token required" }); return; }
  const payload = verifyPortalToken(token);
  if (!payload) { res.status(401).json({ error: "Invalid or expired portal token" }); return; }
  (req as PortalRequest).portal = payload;
  next();
}

// ── GET /:storeUserId/info ────────────────────────────────────────────────────
// Returns public store info + employee names (no PINs). Used to render the
// kiosk before anyone has authenticated.

router.get("/:storeUserId/info", async (req: Request, res: Response) => {
  const { storeUserId } = req.params;

  const [profile] = await db
    .select({
      storeName:      storeProfiles.storeName,
      storeCity:      storeProfiles.storeCity,
      storeLatitude:  storeProfiles.storeLatitude,
      storeLongitude: storeProfiles.storeLongitude,
    })
    .from(storeProfiles)
    .where(eq(storeProfiles.userId, storeUserId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const emps = await db
    .select({ id: employees.id, name: employees.name, role: employees.role })
    .from(employees)
    .where(eq(employees.userId, storeUserId))
    .orderBy(employees.name);

  res.json({ ...profile, employees: emps });
});

// ── POST /:storeUserId/verify-pin ─────────────────────────────────────────────
// Takes { pin }, returns a portal JWT if the PIN matches an employee or the
// manager's portal PIN. PIN verification happens server-side so raw PINs are
// never exposed to the client.

router.post("/:storeUserId/verify-pin", async (req: Request, res: Response) => {
  const { storeUserId } = req.params;
  const { pin } = req.body as { pin?: string };

  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  // 1. Check employee PINs.
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.userId, storeUserId), eq(employees.pin, pin)))
    .limit(1);

  if (emp) {
    const perms = (emp.permissions ?? { pos: true }) as Record<string, boolean>;
    const token = signPortalToken({
      storeUserId,
      employeeId: emp.id,
      name:       emp.name,
      isManager:  false,
      permissions: perms,
    });
    res.json({
      token,
      identity: {
        type:        "employee" as const,
        id:          emp.id,
        name:        emp.name,
        role:        emp.role,
        isManager:   false,
        permissions: perms,
      },
    });
    return;
  }

  // 2. Check manager portal PIN (stored inside onboardingProgress JSONB).
  const [profile] = await db
    .select({ progress: storeProfiles.onboardingProgress, storeName: storeProfiles.storeName })
    .from(storeProfiles)
    .where(eq(storeProfiles.userId, storeUserId))
    .limit(1);

  const managerPin = (profile?.progress as Record<string, unknown> | null)?.portalPin as string | undefined;

  if (managerPin && managerPin === pin) {
    const token = signPortalToken({
      storeUserId,
      employeeId:  undefined,
      name:        "Manager",
      isManager:   true,
      permissions: null,
    });
    res.json({
      token,
      identity: {
        type:        "manager" as const,
        id:          null,
        name:        "Manager",
        role:        "Manager",
        isManager:   true,
        permissions: null,
      },
    });
    return;
  }

  res.status(401).json({ error: "Incorrect PIN" });
});

// ── GET /:storeUserId/active-shift ────────────────────────────────────────────

router.get(
  "/:storeUserId/active-shift",
  requirePortalAuth,
  async (req: Request, res: Response) => {
    const portal = (req as PortalRequest).portal;
    if (!portal.employeeId) { res.json(null); return; }

    const [activeShift] = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.userId,     portal.storeUserId),
          eq(shifts.employeeId, portal.employeeId),
          isNull(shifts.shiftEnd),
        ),
      )
      .limit(1);

    res.json(activeShift ?? null);
  },
);

// ── GET /:storeUserId/my-shifts ───────────────────────────────────────────────

router.get(
  "/:storeUserId/my-shifts",
  requirePortalAuth,
  async (req: Request, res: Response) => {
    const portal = (req as PortalRequest).portal;
    if (!portal.employeeId) { res.json([]); return; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.userId,     portal.storeUserId),
          eq(shifts.employeeId, portal.employeeId),
          gte(shifts.shiftStart, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(shifts.shiftStart));

    res.json(rows);
  },
);

// ── POST /:storeUserId/clock-in ───────────────────────────────────────────────

router.post(
  "/:storeUserId/clock-in",
  requirePortalAuth,
  async (req: Request, res: Response) => {
    const portal = (req as PortalRequest).portal;
    if (!portal.employeeId) {
      res.status(403).json({ error: "Managers use the main dashboard to clock in" });
      return;
    }

    const [existing] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.userId,     portal.storeUserId),
          eq(shifts.employeeId, portal.employeeId),
          isNull(shifts.shiftEnd),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Already clocked in", shiftId: existing.id });
      return;
    }

    const [shift] = await db
      .insert(shifts)
      .values({
        userId:       portal.storeUserId,
        employeeId:   portal.employeeId,
        employeeName: portal.name,
        shiftStart:   new Date(),
      })
      .returning();

    res.status(201).json(shift);
  },
);

// ── POST /:storeUserId/clock-out/:shiftId ─────────────────────────────────────

router.post(
  "/:storeUserId/clock-out/:shiftId",
  requirePortalAuth,
  async (req: Request, res: Response) => {
    const portal = (req as PortalRequest).portal;
    const { shiftId } = req.params;

    const [existing] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.userId, portal.storeUserId)))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Shift not found" }); return; }
    if (existing.shiftEnd) { res.status(409).json({ error: "Shift already ended" }); return; }

    const endTime    = new Date();
    const hoursWorked = (endTime.getTime() - new Date(existing.shiftStart).getTime()) / 3_600_000;

    const [updated] = await db
      .update(shifts)
      .set({ shiftEnd: endTime, hoursWorked: Math.round(hoursWorked * 100) / 100 })
      .where(eq(shifts.id, shiftId))
      .returning();

    res.json(updated);
  },
);

// ── PATCH /manager-pin ────────────────────────────────────────────────────────
// Authenticated — only the store owner can set their portal PIN.

router.patch("/manager-pin", requireAuth as any, async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const [profile] = await db
    .select({ progress: storeProfiles.onboardingProgress })
    .from(storeProfiles)
    .where(eq(storeProfiles.userId, req.userId!))
    .limit(1);

  if (!profile) { res.status(404).json({ error: "Store profile not found" }); return; }

  const updated = {
    ...((profile.progress ?? {}) as Record<string, unknown>),
    portalPin: pin,
  };

  await db
    .update(storeProfiles)
    .set({ onboardingProgress: updated, lastUpdated: new Date() })
    .where(eq(storeProfiles.userId, req.userId!));

  res.json({ ok: true });
});

export default router;
