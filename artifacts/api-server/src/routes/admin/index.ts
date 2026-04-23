/**
 * Admin routes — only accessible to users with role = 'superadmin'
 * Provides full visibility and control over all stores.
 */

import { Router } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  users, storeProfiles, products, sales, expenses,
  employees, shifts, suppliers, analyticsEvents,
} from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import {
  hashPassword, generateOpaqueToken, validatePasswordStrength,
} from "../../lib/auth.js";

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
  const rows = await db
    .select({
      userId:              users.id,
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
      profileMissing:      sql<boolean>`${storeProfiles.userId} is null`,
    })
    .from(users)
    .leftJoin(storeProfiles, eq(users.id, storeProfiles.userId))
    .where(eq(users.role, "store_owner"))
    .orderBy(desc(users.createdAt));

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

// ─── List all admin users ─────────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  const rows = await db.select({
    id: users.id, email: users.email, fullName: users.fullName,
    role: users.role, emailVerified: users.emailVerified,
    createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
  }).from(users).where(eq(users.role, "superadmin"));
  res.json(rows);
});

// ─── Promote/demote user role ─────────────────────────────────────────────────

router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body as { role: string };
  if (!["superadmin", "store_owner"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  // Prevent self-demotion
  if (req.params.id === req.userId && role !== "superadmin") {
    return res.status(400).json({ error: "Cannot demote yourself" });
  }
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: "User not found" });
  return res.json({ id: updated.id, role: updated.role });
});

export default router;
