import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  storeProfiles, products, sales, expenses, suppliers,
  employees, shifts, recurringExpenses, scheduledPriceChanges,
} from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { buildCrudRouter } from "./crud.js";

const router: IRouter = Router();

// ─── Profile (single row keyed by userId) ──────────────────────────────────
const profileRouter: IRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res) => {
  const [row] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, req.userId!));
  res.json(row ?? null);
});

profileRouter.put("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { userId: _ignored, createdAt: _ignored2, ...patch } = body;
  void _ignored; void _ignored2;
  const userId = req.userId!;
  const [existing] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));
  if (existing) {
    const [row] = await db.update(storeProfiles)
      .set({ ...patch, lastUpdated: new Date() })
      .where(eq(storeProfiles.userId, userId))
      .returning();
    res.json(row);
    return;
  }
  const [row] = await db.insert(storeProfiles)
    .values({ ...patch, userId, lastUpdated: new Date() })
    .returning();
  res.status(201).json(row);
});

router.use("/profile", profileRouter);

// ─── Standard per-user collections via factory ─────────────────────────────
router.use("/products",          buildCrudRouter({ table: products,              userIdCol: products.userId,              idCol: products.id,              orderByCol: products.createdAt }));
router.use("/sales",             buildCrudRouter({ table: sales,                 userIdCol: sales.userId,                 idCol: sales.id,                 orderByCol: sales.createdAt }));
router.use("/expenses",          buildCrudRouter({ table: expenses,              userIdCol: expenses.userId,              idCol: expenses.id,              orderByCol: expenses.date }));
router.use("/suppliers",         buildCrudRouter({ table: suppliers,             userIdCol: suppliers.userId,             idCol: suppliers.id,             orderByCol: suppliers.createdAt }));
router.use("/employees",         buildCrudRouter({ table: employees,             userIdCol: employees.userId,             idCol: employees.id,             orderByCol: employees.createdAt }));
router.use("/shifts",            buildCrudRouter({ table: shifts,                userIdCol: shifts.userId,                idCol: shifts.id,                orderByCol: shifts.shiftStart }));
router.use("/recurring-expenses",buildCrudRouter({ table: recurringExpenses,     userIdCol: recurringExpenses.userId,     idCol: recurringExpenses.id,     orderByCol: recurringExpenses.createdAt }));
router.use("/scheduled-prices",  buildCrudRouter({ table: scheduledPriceChanges, userIdCol: scheduledPriceChanges.userId, idCol: scheduledPriceChanges.id, orderByCol: scheduledPriceChanges.createdAt }));

// ─── Replace entire collection (atomic per-table sync) ────────────────────
const COLLECTION_TABLES: Record<string, { table: any; userIdCol: any }> = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  products:              { table: products,              userIdCol: products.userId              },
  sales:                 { table: sales,                 userIdCol: sales.userId                 },
  expenses:              { table: expenses,              userIdCol: expenses.userId              },
  suppliers:             { table: suppliers,             userIdCol: suppliers.userId             },
  employees:             { table: employees,             userIdCol: employees.userId             },
  shifts:                { table: shifts,                userIdCol: shifts.userId                },
  recurringExpenses:     { table: recurringExpenses,     userIdCol: recurringExpenses.userId     },
  scheduledPriceChanges: { table: scheduledPriceChanges, userIdCol: scheduledPriceChanges.userId },
};

router.post("/replace/:entity", requireAuth, async (req, res) => {
  const entity = String(req.params.entity);
  const cfg = COLLECTION_TABLES[entity];
  if (!cfg) {
    res.status(400).json({ error: `Unknown entity: ${entity}` });
    return;
  }
  const userId = req.userId!;
  const items = (req.body?.items ?? []) as Record<string, unknown>[];

  const stripped = items.map(({ userId: _u, createdAt: _c, updatedAt: _ud, ...rest }) => {
    void _u; void _c; void _ud;
    return { ...rest, userId };
  });

  try {
    await db.transaction(async (tx) => {
      await tx.delete(cfg.table).where(eq(cfg.userIdCol, userId));
      if (stripped.length > 0) {
        await tx.insert(cfg.table).values(stripped);
      }
    });
    res.json({ ok: true, count: stripped.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Bulk import (for migrating localStorage → cloud) ──────────────────────
router.post("/migrate", requireAuth, async (req, res) => {
  const body = req.body as {
    profile?: Record<string, unknown>;
    products?: Record<string, unknown>[];
    sales?: Record<string, unknown>[];
    expenses?: Record<string, unknown>[];
    suppliers?: Record<string, unknown>[];
    employees?: Record<string, unknown>[];
    shifts?: Record<string, unknown>[];
    recurringExpenses?: Record<string, unknown>[];
    scheduledPriceChanges?: Record<string, unknown>[];
  };

  const userId = req.userId!;
  const counts: Record<string, number> = {};

  function strip<T extends Record<string, unknown>>(arr: T[] | undefined) {
    if (!arr || arr.length === 0) return [];
    return arr.map(({ id: _i, userId: _u, createdAt: _c, updatedAt: _ud, ...rest }) => {
      void _i; void _u; void _c; void _ud;
      return { ...rest, userId };
    });
  }

  try {
    if (body.profile) {
      const { userId: _ignored, createdAt: _c, ...patch } = body.profile;
      void _ignored; void _c;
      const [existing] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));
      if (existing) {
        await db.update(storeProfiles).set({ ...patch, lastUpdated: new Date() }).where(eq(storeProfiles.userId, userId));
      } else {
        await db.insert(storeProfiles).values({ ...patch, userId, lastUpdated: new Date() });
      }
      counts.profile = 1;
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const tables: [string, any, Record<string, unknown>[] | undefined][] = [
      ["suppliers",          suppliers,             body.suppliers],
      ["products",           products,              body.products],
      ["sales",              sales,                 body.sales],
      ["expenses",           expenses,              body.expenses],
      ["employees",          employees,             body.employees],
      ["shifts",             shifts,                body.shifts],
      ["recurringExpenses",  recurringExpenses,     body.recurringExpenses],
      ["scheduledPrices",    scheduledPriceChanges, body.scheduledPriceChanges],
    ];

    for (const [name, table, rows] of tables) {
      const stripped = strip(rows);
      if (stripped.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(table as any).values(stripped as any);
        counts[name] = stripped.length;
      }
    }

    res.json({ ok: true, counts });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
