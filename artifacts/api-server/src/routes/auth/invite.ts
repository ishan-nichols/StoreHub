import { Router } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  employeeInvitations, users, storeProfiles, employees,
} from "@workspace/db/schema";
import {
  generateOpaqueToken, hashToken,
  hashPassword, validatePasswordStrength,
  signAccessToken, signRefreshToken, setAuthCookies,
} from "../../lib/auth.js";
import { logAudit } from "../../lib/audit.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { enqueueEmail } from "../../lib/queue.js";

const router = Router();

// ─── Send Invitation ──────────────────────────────────────────────────────────
// POST /api/auth/invite
// Body: { email, roleName?, metadata?: { name, jobTitle, hourlyWage, payrollType } }

router.post("/", requireAuth as any, async (req, res) => {
  const { email, roleName, roleId, metadata } = req.body as {
    email: string;
    roleName?: string;
    roleId?: string;
    metadata?: Record<string, unknown>;
  };

  if (!email) return res.status(400).json({ error: "email is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const storeUserId = req.userId!;

  // Fetch store profile for invite email
  const [profile] = await db
    .select({ storeName: storeProfiles.storeName, ownerName: storeProfiles.ownerName, businessId: storeProfiles.businessId })
    .from(storeProfiles)
    .where(eq(storeProfiles.userId, storeUserId))
    .limit(1);

  if (!profile) return res.status(404).json({ error: "Store profile not found" });

  // Revoke any existing pending invite for this email+store
  await db
    .update(employeeInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(employeeInvitations.email, email.toLowerCase()),
        eq(employeeInvitations.storeUserId, storeUserId),
        isNull(employeeInvitations.revokedAt),
        isNull(employeeInvitations.acceptedAt),
      )
    );

  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);

  await db.insert(employeeInvitations).values({
    storeUserId,
    businessId: profile.businessId ?? null,
    email:      email.toLowerCase(),
    roleName:   roleName ?? null,
    roleId:     roleId   ?? null,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedBy:  req.userId!,
    metadata:   metadata ?? null,
  });

  await enqueueEmail({
    type:        "invite",
    to:          email.toLowerCase(),
    storeName:   profile.storeName,
    inviterName: profile.ownerName,
    token:       rawToken,
    roleName,
    prefillName: (metadata?.name as string) ?? undefined,
  });

  logAudit({ req }, {
    action:       "invite.send",
    resourceType: "invitation",
    metadata:     { email, roleName },
  });

  return res.json({ success: true, message: "Invitation sent" });
});

// ─── Validate Token (pre-flight before showing form) ─────────────────────────
// GET /api/auth/invite/validate?token=xxx

router.get("/validate", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).json({ error: "token is required" });

  const hash = hashToken(token);
  const [invite] = await db
    .select()
    .from(employeeInvitations)
    .where(and(
      eq(employeeInvitations.tokenHash, hash),
      isNull(employeeInvitations.revokedAt),
      isNull(employeeInvitations.acceptedAt),
      gt(employeeInvitations.expiresAt, new Date()),
    ))
    .limit(1);

  if (!invite) return res.status(404).json({ error: "Invitation not found or expired" });

  const [store] = await db
    .select({ storeName: storeProfiles.storeName })
    .from(storeProfiles)
    .where(eq(storeProfiles.userId, invite.storeUserId))
    .limit(1);

  return res.json({
    valid:      true,
    email:      invite.email,
    roleName:   invite.roleName,
    storeName:  store?.storeName ?? "Unknown Store",
    metadata:   invite.metadata,
    expiresAt:  invite.expiresAt,
  });
});

// ─── Accept Invitation ────────────────────────────────────────────────────────
// POST /api/auth/invite/accept
// Body: { token, password, fullName }

router.post("/accept", async (req, res) => {
  const { token, password, fullName } = req.body as {
    token: string;
    password: string;
    fullName: string;
  };

  if (!token || !password || !fullName) {
    return res.status(400).json({ error: "token, password, and fullName are required" });
  }

  const { valid, reason } = validatePasswordStrength(password);
  if (!valid) return res.status(400).json({ error: reason });

  const hash = hashToken(token);
  const [invite] = await db
    .select()
    .from(employeeInvitations)
    .where(and(
      eq(employeeInvitations.tokenHash, hash),
      isNull(employeeInvitations.revokedAt),
      isNull(employeeInvitations.acceptedAt),
      gt(employeeInvitations.expiresAt, new Date()),
    ))
    .limit(1);

  if (!invite) return res.status(404).json({ error: "Invitation not found or expired" });

  // Check if a user already exists with this email
  let [user] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);

  if (user) {
    // User exists (e.g. already has another store) — just link them
    // Don't change their password
  } else {
    const passwordHash = await hashPassword(password);
    [user] = await db.insert(users).values({
      email:         invite.email,
      fullName:      fullName.trim(),
      passwordHash,
      emailVerified: true, // trusted because they clicked invite link sent to their email
      role:          "store_owner",
    }).returning();
  }

  // Mark invite as accepted
  await db
    .update(employeeInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(employeeInvitations.id, invite.id));

  // Create employee record in the store's employee list if not existing
  const [existingEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(
      eq(employees.userId, invite.storeUserId),
      eq(employees.email!, invite.email),
    ))
    .limit(1);

  if (!existingEmp) {
    const meta = (invite.metadata ?? {}) as Record<string, unknown>;
    await db.insert(employees).values({
      userId:      invite.storeUserId,
      name:        fullName.trim(),
      email:       invite.email,
      role:        invite.roleName ?? "employee",
      jobTitle:    (meta.jobTitle as string) ?? invite.roleName ?? "Employee",
      hourlyWage:  Number(meta.hourlyWage ?? 0),
      payrollType: (meta.payrollType as string) ?? "hourly",
      dailyWage:   "0",
      pin:         "",
    });
  }

  // Issue session for the new user
  const accessToken  = signAccessToken({ userId: user.id, email: user.email!, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email!, role: user.role });
  setAuthCookies(res, accessToken, refreshToken, true);

  logAudit(
    { actorId: user.id, actorRole: user.role, storeUserId: invite.storeUserId },
    { action: "invite.accept", resourceType: "invitation", resourceId: invite.id, metadata: { email: invite.email } },
  );

  return res.json({
    success: true,
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
});

// ─── Revoke Invitation ────────────────────────────────────────────────────────
// DELETE /api/auth/invite/:id

router.delete("/:id", requireAuth as any, async (req, res) => {
  const { id } = req.params;
  const storeUserId = req.userId!;

  const [invite] = await db
    .select({ id: employeeInvitations.id, email: employeeInvitations.email })
    .from(employeeInvitations)
    .where(and(eq(employeeInvitations.id, id), eq(employeeInvitations.storeUserId, storeUserId)))
    .limit(1);

  if (!invite) return res.status(404).json({ error: "Invitation not found" });

  await db
    .update(employeeInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(employeeInvitations.id, id));

  logAudit({ req }, { action: "invite.revoke", resourceType: "invitation", resourceId: id });
  return res.json({ success: true });
});

// ─── List Pending Invitations ─────────────────────────────────────────────────
// GET /api/auth/invite

router.get("/", requireAuth as any, async (req, res) => {
  const storeUserId = req.userId!;

  const invites = await db
    .select({
      id:        employeeInvitations.id,
      email:     employeeInvitations.email,
      roleName:  employeeInvitations.roleName,
      expiresAt: employeeInvitations.expiresAt,
      createdAt: employeeInvitations.createdAt,
    })
    .from(employeeInvitations)
    .where(
      and(
        eq(employeeInvitations.storeUserId, storeUserId),
        isNull(employeeInvitations.revokedAt),
        isNull(employeeInvitations.acceptedAt),
        gt(employeeInvitations.expiresAt, new Date()),
      )
    );

  return res.json(invites);
});

export default router;
