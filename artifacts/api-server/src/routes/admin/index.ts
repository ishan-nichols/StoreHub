/**
 * Admin routes — only accessible to users with role = 'superadmin'
 * Provides full visibility and control over all stores.
 */

import { Router } from "express";
import { eq, sql, desc, and, gt, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  users, storeProfiles, products, sales, expenses,
  employees, shifts, suppliers, analyticsEvents, businesses,
  auditLogs, refreshTokens,
} from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import {
  hashPassword, generateOpaqueToken, validatePasswordStrength,
  signAccessToken,
} from "../../lib/auth.js";
import { logAudit } from "../../lib/audit.js";

const router = Router();
router.use(requireAdmin);

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  const [{ totalStores }] = await db
    .select({ totalStores: sql<number>`count(*)::int` })
    .from(storeProfiles);

  const [{ totalRevenue }] = await db
    .select({ totalRevenue: sql<number>`coalesce(sum(total), 0)` })
    .from(sales);

  const [{ onboardedCount }] = await db
    .select({ onboardedCount: sql<number>`count(*)::int` })
    .from(storeProfiles)
    .where(eq(storeProfiles.onboardingCompleted, true));

  const [{ newThisMonth }] = await db
    .select({ newThisMonth: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`created_at >= date_trunc('month', now())`);

  const [{ totalProducts }] = await db
    .select({ totalProducts: sql<number>`count(*)::int` })
    .from(products);

  res.json({
    totalStores,
    totalRevenue,
    onboardedCount,
    newThisMonth,
    totalProducts,
    avgRevenuePerStore: totalStores > 0 ? totalRevenue / totalStores : 0,
  });
});

// ─── List All Stores ──────────────────────────────────────────────────────────

router.get("/stores", async (_req, res) => {
  // Join from storeProfiles so ALL stores appear regardless of user role
  // (business_owner users who self-onboarded also have a storeProfile row).
  const rows = await db
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
      email:               users.email,
      fullName:            users.fullName,
      role:                users.role,
      businessId:          users.businessId,
      userCreatedAt:       users.createdAt,
      lastLoginAt:         users.lastLoginAt,
      profileMissing:      sql<boolean>`false`,
    })
    .from(storeProfiles)
    .leftJoin(users, eq(storeProfiles.userId, users.id))
    .orderBy(desc(storeProfiles.createdAt));

  // Attach quick stats per store
  const withStats = await Promise.all(
    rows.map(async (store: (typeof rows)[number]) => {
      const [{ revenue }] = await db
        .select({ revenue: sql<number>`coalesce(sum(total), 0)` })
        .from(sales)
        .where(eq(sales.userId, store.userId));

      const [{ productCount }] = await db
        .select({ productCount: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.userId, store.userId));

      const [{ employeeCount }] = await db
        .select({ employeeCount: sql<number>`count(*)::int` })
        .from(employees)
        .where(eq(employees.userId, store.userId));

      return { ...store, revenue, productCount, employeeCount };
    })
  );

  res.json(withStats);
});

// ─── Get Single Store (full detail) ──────────────────────────────────────────

router.get("/stores/:userId", async (req, res) => {
  const { userId } = req.params;

  const [user] = await db.select({
    id: users.id, email: users.email, fullName: users.fullName,
    role: users.role, emailVerified: users.emailVerified,
    phoneNumber: users.phoneNumber, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
  }).from(users).where(eq(users.id, userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  const [profile] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));

  const [{ revenue }] = await db
    .select({ revenue: sql<number>`coalesce(sum(total), 0)` })
    .from(sales).where(eq(sales.userId, userId));

  const [{ expenseTotal }] = await db
    .select({ expenseTotal: sql<number>`coalesce(sum(amount), 0)` })
    .from(expenses).where(eq(expenses.userId, userId));

  const [{ saleCount }] = await db
    .select({ saleCount: sql<number>`count(*)::int` })
    .from(sales).where(eq(sales.userId, userId));

  const [{ productCount }] = await db
    .select({ productCount: sql<number>`count(*)::int` })
    .from(products).where(eq(products.userId, userId));

  const [{ employeeCount }] = await db
    .select({ employeeCount: sql<number>`count(*)::int` })
    .from(employees).where(eq(employees.userId, userId));

  const [{ supplierCount }] = await db
    .select({ supplierCount: sql<number>`count(*)::int` })
    .from(suppliers).where(eq(suppliers.userId, userId));

  return res.json({
    user,
    profile: profile ?? null,
    profileMissing: !profile,
    stats: { revenue, expenseTotal, saleCount, productCount, employeeCount, supplierCount },
  });
});

// ─── Store's products ─────────────────────────────────────────────────────────

router.get("/stores/:userId/products", async (req, res) => {
  const rows = await db.select().from(products)
    .where(eq(products.userId, req.params.userId))
    .orderBy(desc(products.createdAt));
  res.json(rows);
});

// ─── Store's sales ────────────────────────────────────────────────────────────

router.get("/stores/:userId/sales", async (req, res) => {
  const rows = await db.select().from(sales)
    .where(eq(sales.userId, req.params.userId))
    .orderBy(desc(sales.createdAt));
  res.json(rows);
});

// ─── Store's employees ────────────────────────────────────────────────────────

router.get("/stores/:userId/employees", async (req, res) => {
  const rows = await db.select({
    id: employees.id, name: employees.name, role: employees.role,
    hourlyWage: employees.hourlyWage, createdAt: employees.createdAt,
  }).from(employees).where(eq(employees.userId, req.params.userId));
  res.json(rows);
});

// ─── Store's expenses ─────────────────────────────────────────────────────────

router.get("/stores/:userId/expenses", async (req, res) => {
  const rows = await db.select().from(expenses)
    .where(eq(expenses.userId, req.params.userId))
    .orderBy(desc(expenses.date));
  res.json(rows);
});

// ─── Store's suppliers ────────────────────────────────────────────────────────

router.get("/stores/:userId/suppliers", async (req, res) => {
  const rows = await db.select().from(suppliers)
    .where(eq(suppliers.userId, req.params.userId));
  res.json(rows);
});

// ─── Update store profile ─────────────────────────────────────────────────────

router.patch("/stores/:userId", async (req, res) => {
  const { userId } = req.params;
  const { userId: _u, createdAt: _c, ...patch } = req.body as Record<string, unknown>;
  void _u; void _c;

  const [existing] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));
  if (!existing) return res.status(404).json({ error: "Store not found" });

  const [updated] = await db.update(storeProfiles)
    .set({ ...patch, lastUpdated: new Date() })
    .where(eq(storeProfiles.userId, userId))
    .returning();

  return res.json(updated);
});

// ─── Create new store account ─────────────────────────────────────────────────

router.post("/stores", async (req, res) => {
  const { email, fullName, storeName, businessType, password } = req.body as {
    email: string; fullName: string; storeName: string;
    businessType?: string; password?: string;
  };

  if (!email || !fullName || !storeName) {
    return res.status(400).json({ error: "email, fullName, and storeName are required" });
  }

  if (password !== undefined && password !== null) {
    const pw = String(password).trim();
    if (pw.length === 0) {
      return res.status(400).json({ error: "Password cannot be blank" });
    }
    const strength = validatePasswordStrength(pw);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.reason ?? "Password does not meet policy" });
    }
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const tempPassword = password !== undefined && password !== null && String(password).trim() !== ""
    ? String(password).trim()
    : generateOpaqueToken(8);
  const passwordHash = await hashPassword(tempPassword);

  const [user] = await db.insert(users).values({
    email: email.toLowerCase(),
    fullName: fullName.trim(),
    passwordHash,
    emailVerified: true, // admin-created accounts skip email verification
    role: "store_owner",
  }).returning();

  await db.insert(storeProfiles).values({
    userId: user.id,
    storeName: storeName.trim(),
    ownerName: fullName.trim(),
    businessType: businessType ?? "other",
    onboardingCompleted: false,
    storageMode: "cloud",
    lastUpdated: new Date(),
  });

  return res.status(201).json({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    tempPassword,
    message:
      "Store account created. Passwords cannot be retrieved later (one-way hash). Share this temporary password securely, or use POST /admin/stores/:userId/reset-password to issue a new one.",
  });
});

// ─── Update user account (email, name, phone, role) ─────────────────────────

router.patch("/stores/:userId/user", async (req, res) => {
  const { userId } = req.params;
  const { fullName, email, phoneNumber, role } = req.body as Record<string, string | undefined>;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "superadmin" && role && role !== "superadmin") {
    return res.status(403).json({ error: "Cannot demote a superadmin here" });
  }

  const patch: Record<string, unknown> = {};
  if (fullName?.trim())   patch.fullName    = fullName.trim();
  if (email?.trim())      patch.email       = email.trim().toLowerCase();
  if (phoneNumber !== undefined) patch.phoneNumber = phoneNumber?.trim() || null;
  if (role && ["business_owner", "store_owner"].includes(role)) patch.role = role;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return res.json({ user: updated });
});

// ─── Reset store owner password (one-time plaintext in response — same as create) ─

router.post("/stores/:userId/reset-password", async (req, res) => {
  const { userId } = req.params;
  const { password } = (req.body ?? {}) as { password?: string };

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "Store not found" });
  if (user.role === "superadmin") return res.status(403).json({ error: "Cannot reset admin passwords here" });

  let plain: string;
  if (password !== undefined && password !== null && String(password).trim() !== "") {
    const pw = String(password).trim();
    const strength = validatePasswordStrength(pw);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.reason ?? "Password does not meet policy" });
    }
    plain = pw;
  } else {
    plain = generateOpaqueToken(12);
  }

  const passwordHash = await hashPassword(plain);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  return res.json({
    tempPassword: plain,
    message:
      "Passwords are stored with a one-way hash and cannot be viewed. This response is the only time the new password appears — copy it now or trigger email reset when available.",
  });
});

// ─── Delete store account ─────────────────────────────────────────────────────

router.delete("/stores/:userId", async (req, res) => {
  const { userId } = req.params;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "Store not found" });
  if (user.role === "superadmin") return res.status(403).json({ error: "Cannot delete admin accounts" });

  await db.insert(analyticsEvents).values({
    userId,
    actorUserId: req.userId,
    eventName: "account_deleted",
    properties: { email: user.email, role: user.role, deletedBy: "superadmin" },
  });

  await db.delete(users).where(eq(users.id, userId)); // cascades to all store data
  return res.json({ ok: true });
});

// ─── List all users (all roles) ──────────────────────────────────────────────

router.get("/users", async (req, res) => {
  const { role } = req.query as { role?: string };
  let query = db.select({
    id: users.id, email: users.email, fullName: users.fullName,
    role: users.role, emailVerified: users.emailVerified, phoneNumber: users.phoneNumber,
    businessId: users.businessId,
    createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
  }).from(users).$dynamic();

  if (role) query = query.where(eq(users.role, role));
  const rows = await query.orderBy(desc(users.createdAt));
  res.json(rows);
});

// ─── Delete cascade preview ───────────────────────────────────────────────────

router.get("/users/:id/cascade", async (req, res) => {
  const { id } = req.params;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.role === "superadmin") {
    return res.json({ blocked: true, reason: "Cannot delete superadmin accounts" });
  }

  // For store_owner — their own store profile
  if (user.role === "store_owner") {
    const [profile] = await db.select({ storeName: storeProfiles.storeName })
      .from(storeProfiles).where(eq(storeProfiles.userId, id)).limit(1);
    const [{ pc }] = await db.select({ pc: sql<number>`count(*)::int` }).from(products).where(eq(products.userId, id));
    const [{ sc }] = await db.select({ sc: sql<number>`count(*)::int` }).from(sales).where(eq(sales.userId, id));
    return res.json({
      blocked: false,
      stores: profile ? [{ storeName: profile.storeName }] : [],
      businesses: [],
      dataSummary: { products: pc, sales: sc },
    });
  }

  // For business_owner — find their businesses and all stores within those businesses
  const ownedBusinesses = await db.select({ id: businesses.id, name: businesses.name })
    .from(businesses).where(eq(businesses.businessOwnerId, id));

  const businessIds = ownedBusinesses.map(b => b.id);
  let storeList: { storeName: string; businessName: string }[] = [];

  if (businessIds.length > 0) {
    const sp = await db.select({ storeName: storeProfiles.storeName, businessId: storeProfiles.businessId })
      .from(storeProfiles).where(sql`${storeProfiles.businessId} = ANY(${sql.raw(`ARRAY[${businessIds.map(id => `'${id}'`).join(",")}]::uuid[]`)})`)
    storeList = sp.map(s => ({
      storeName: s.storeName,
      businessName: ownedBusinesses.find(b => b.id === s.businessId)?.name ?? "",
    }));
  }

  // Also count the business_owner's own store profile if any
  const [selfProfile] = await db.select({ storeName: storeProfiles.storeName })
    .from(storeProfiles).where(eq(storeProfiles.userId, id)).limit(1);
  if (selfProfile) {
    storeList.push({ storeName: selfProfile.storeName, businessName: "(own account)" });
  }

  return res.json({
    blocked: false,
    businesses: ownedBusinesses.map(b => b.name),
    stores: storeList,
    dataSummary: {},
  });
});

// ─── Promote/demote user role ─────────────────────────────────────────────────

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body as { role: string };
  if (!["superadmin", "store_owner"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  if (req.params.id === req.userId && role !== "superadmin") {
    return res.status(400).json({ error: "Cannot demote yourself" });
  }
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "User not found" });
  logAudit({ req }, { action: "admin.role_change", resourceType: "user", resourceId: req.params.id, newValue: { role } });
  return res.json({ id: updated.id, role: updated.role });
});

// ─── Platform-wide Audit Log ──────────────────────────────────────────────────
// GET /api/admin/audit-logs?page=1&limit=100&action=&storeUserId=&from=&to=

router.get("/audit-logs", async (req, res) => {
  const { page = "1", limit = "100", action, storeUserId, from, to } = req.query as Record<string, string | undefined>;
  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  if (action)      conditions.push(sql`${auditLogs.action} ILIKE ${action + "%"}`);
  if (storeUserId) conditions.push(eq(auditLogs.storeUserId, storeUserId));
  if (from)        conditions.push(sql`${auditLogs.createdAt} >= ${new Date(from)}`);
  if (to)          conditions.push(sql`${auditLogs.createdAt} <= ${new Date(to)}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limitNum).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);

  return res.json({ data: rows, pagination: { page: pageNum, limit: limitNum, total } });
});

// ─── Security Events (failed logins, lockouts, MFA events) ───────────────────
// GET /api/admin/security/events

router.get("/security/events", async (_req, res) => {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(sql`${auditLogs.action} IN ('auth.login_failed', 'auth.locked', 'auth.mfa_enabled', 'auth.mfa_disabled', 'auth.sessions_revoke_all', 'auth.password_changed')`)
    .orderBy(desc(auditLogs.createdAt))
    .limit(500);
  return res.json(rows);
});

// ─── Active Sessions (count by user) ─────────────────────────────────────────
// GET /api/admin/sessions

router.get("/sessions", async (_req, res) => {
  const rows = await db
    .select({
      userId:       refreshTokens.userId,
      sessionCount: sql<number>`count(*)::int`,
      lastUsedAt:   sql<Date>`max(${refreshTokens.lastUsedAt})`,
    })
    .from(refreshTokens)
    .where(gt(refreshTokens.expiresAt, new Date()))
    .groupBy(refreshTokens.userId)
    .orderBy(sql`count(*) desc`)
    .limit(200);
  return res.json(rows);
});

// ─── Force-logout any user ────────────────────────────────────────────────────
// DELETE /api/admin/sessions/:userId

router.delete("/sessions/:userId", async (req, res) => {
  const { userId } = req.params;
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  logAudit({ req }, { action: "admin.force_logout", resourceType: "user", resourceId: userId });
  return res.json({ success: true });
});

// ─── Impersonation ────────────────────────────────────────────────────────────
// POST /api/admin/impersonate/:userId — issues a short-lived token scoped to that user

router.post("/impersonate/:userId", async (req, res) => {
  const { userId } = req.params;

  const [target] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role === "superadmin") {
    return res.status(403).json({ error: "Cannot impersonate another superadmin" });
  }

  // 15-minute impersonation token — carries switchedFromUserId for audit trail
  const token = signAccessToken({
    userId:              target.id,
    email:               target.email ?? "",
    role:                target.role,
    switchedFromUserId:  req.userId,
  });

  logAudit({ req }, {
    action:       "admin.impersonate",
    resourceType: "user",
    resourceId:   userId,
    metadata:     { targetEmail: target.email, targetRole: target.role },
  });

  return res.json({ token, expiresIn: "15m", targetUser: { id: target.id, email: target.email, role: target.role } });
});

export default router;
