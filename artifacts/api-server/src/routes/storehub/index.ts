import { Router, type IRouter } from "express";
import { eq, and, sql, gte, lte, sum, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  storeProfiles, products, sales, expenses, suppliers,
  employees, shifts, recurringExpenses, scheduledPriceChanges,
  ingredients, recipes, recipeIngredients, menuItems,
  dailyPayRecords,
} from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { buildCrudRouter } from "./crud.js";
import salesTaxRouter from "./salesTax.js";
import locationsRouter from "./locations.js";
import supplierIntelligenceRouter from "../suppliers/index.js";
import employeePermissionsRouter from "./employee-permissions.js";

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
router.use("/sales-tax", salesTaxRouter);
router.use("/locations", locationsRouter);
router.use("/supplier-intelligence", supplierIntelligenceRouter);

// ─── Standard per-user collections via factory ─────────────────────────────
router.use("/products",           buildCrudRouter({ table: products,              userIdCol: products.userId,              idCol: products.id,              orderByCol: products.createdAt }));
router.use("/sales",              buildCrudRouter({ table: sales,                 userIdCol: sales.userId,                 idCol: sales.id,                 orderByCol: sales.createdAt }));
router.use("/expenses",           buildCrudRouter({ table: expenses,              userIdCol: expenses.userId,              idCol: expenses.id,              orderByCol: expenses.date }));
router.use("/suppliers",          buildCrudRouter({ table: suppliers,             userIdCol: suppliers.userId,             idCol: suppliers.id,             orderByCol: suppliers.createdAt }));
router.use("/employees",          employeePermissionsRouter);
router.use("/employees",          buildCrudRouter({ table: employees,             userIdCol: employees.userId,             idCol: employees.id,             orderByCol: employees.createdAt }));
router.use("/shifts",             buildCrudRouter({ table: shifts,                userIdCol: shifts.userId,                idCol: shifts.id,                orderByCol: shifts.shiftStart }));
router.use("/recurring-expenses", buildCrudRouter({ table: recurringExpenses,     userIdCol: recurringExpenses.userId,     idCol: recurringExpenses.id,     orderByCol: recurringExpenses.createdAt }));
router.use("/scheduled-prices",   buildCrudRouter({ table: scheduledPriceChanges, userIdCol: scheduledPriceChanges.userId, idCol: scheduledPriceChanges.id, orderByCol: scheduledPriceChanges.createdAt }));
router.use("/daily-pay-records",  buildCrudRouter({ table: dailyPayRecords,       userIdCol: dailyPayRecords.userId,       idCol: dailyPayRecords.id,       orderByCol: dailyPayRecords.createdAt }));

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

// ─── Restaurant: CRUD routers ──────────────────────────────────────────────
router.use("/ingredients", buildCrudRouter({ table: ingredients, userIdCol: ingredients.userId, idCol: ingredients.id, orderByCol: ingredients.createdAt }));
router.use("/menu-items",  buildCrudRouter({ table: menuItems,   userIdCol: menuItems.userId,   idCol: menuItems.id,   orderByCol: menuItems.createdAt }));

// Recipes use custom routes (transaction-aware insert/update), so no buildCrudRouter for POST/PATCH.
// We still wire GET list and DELETE via a small sub-router.
const recipesListDeleteRouter: IRouter = Router();
recipesListDeleteRouter.use(requireAuth);

recipesListDeleteRouter.get("/", async (req, res) => {
  const rows = await db.select().from(recipes).where(eq(recipes.userId, req.userId!));
  res.json(rows);
});

recipesListDeleteRouter.delete("/:id", async (req, res) => {
  const [row] = await db.delete(recipes)
    .where(and(eq(recipes.id, req.params.id), eq(recipes.userId, req.userId!)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

router.use("/recipes", recipesListDeleteRouter);

// ─── Restaurant: Ingredient stock adjustment ────────────────────────────────
router.post("/ingredients/:id/adjust-stock", requireAuth, async (req, res) => {
  const { delta, note: _note } = req.body as { delta: number; note?: string };
  if (typeof delta !== "number") { res.status(400).json({ error: "delta must be a number" }); return; }

  try {
    const [updated] = await db
      .update(ingredients)
      .set({
        stockQuantity: sql`GREATEST(0, ${ingredients.stockQuantity} + ${String(delta)})`,
      })
      .where(and(eq(ingredients.id, req.params.id), eq(ingredients.userId, req.userId!)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Restaurant: Recipe full detail (with ingredients) ─────────────────────
router.get("/recipes/:id/full", requireAuth, async (req, res) => {
  const [recipe] = await db.select().from(recipes)
    .where(and(eq(recipes.id, req.params.id), eq(recipes.userId, req.userId!)));
  if (!recipe) { res.status(404).json({ error: "Not found" }); return; }

  const ris = await db.select({
    id:           recipeIngredients.id,
    recipeId:     recipeIngredients.recipeId,
    ingredientId: recipeIngredients.ingredientId,
    quantity:     recipeIngredients.quantity,
    name:         ingredients.name,
    unit:         ingredients.unit,
    costPerUnit:  ingredients.costPerUnit,
  })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(eq(recipeIngredients.recipeId, recipe.id));

  const yieldQty = parseFloat(recipe.yieldQuantity as string) || 1;
  const estimatedCost = ris.reduce((sum, ri) => {
    return sum + (parseFloat(ri.quantity as string) * parseFloat(ri.costPerUnit as string)) / yieldQty;
  }, 0);

  res.json({ ...recipe, recipeIngredients: ris, estimatedCost });
});

// ─── Restaurant: Create recipe (with ingredients in transaction) ────────────
router.post("/recipes", requireAuth, async (req, res) => {
  const { name, description, category, yieldQuantity, yieldUnit, ingredients: ings } =
    req.body as {
      name: string;
      description?: string;
      category?: string;
      yieldQuantity?: number;
      yieldUnit?: string;
      ingredients?: { ingredientId: string; quantity: number }[];
    };

  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [recipe] = await tx.insert(recipes).values({
        userId: req.userId!,
        name: name.trim(),
        description: description ?? null,
        category: category ?? null,
        yieldQuantity: String(yieldQuantity ?? 1),
        yieldUnit: yieldUnit ?? "serving",
      }).returning();

      const ris: typeof recipeIngredients.$inferSelect[] = [];
      if (ings && ings.length > 0) {
        const inserted = await tx.insert(recipeIngredients).values(
          ings.map((i) => ({ recipeId: recipe.id, ingredientId: i.ingredientId, quantity: String(i.quantity) })),
        ).returning();
        ris.push(...inserted);
      }
      return { ...recipe, recipeIngredients: ris };
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ─── Restaurant: Update recipe (with ingredients in transaction) ────────────
router.patch("/recipes/:id", requireAuth, async (req, res) => {
  const { name, description, category, yieldQuantity, yieldUnit, ingredients: ings } =
    req.body as {
      name?: string;
      description?: string;
      category?: string;
      yieldQuantity?: number;
      yieldUnit?: string;
      ingredients?: { ingredientId: string; quantity: number }[];
    };

  try {
    const result = await db.transaction(async (tx) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined)          patch.name = name.trim();
      if (description !== undefined)   patch.description = description;
      if (category !== undefined)      patch.category = category;
      if (yieldQuantity !== undefined) patch.yieldQuantity = String(yieldQuantity);
      if (yieldUnit !== undefined)     patch.yieldUnit = yieldUnit;

      const [recipe] = await tx.update(recipes)
        .set(patch)
        .where(and(eq(recipes.id, req.params.id), eq(recipes.userId, req.userId!)))
        .returning();
      if (!recipe) return null;

      // Replace all recipe ingredients
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipe.id));
      const ris: typeof recipeIngredients.$inferSelect[] = [];
      if (ings && ings.length > 0) {
        const inserted = await tx.insert(recipeIngredients).values(
          ings.map((i) => ({ recipeId: recipe.id, ingredientId: i.ingredientId, quantity: String(i.quantity) })),
        ).returning();
        ris.push(...inserted);
      }
      return { ...recipe, recipeIngredients: ris };
    });

    if (!result) { res.status(404).json({ error: "Not found" }); return; }
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ─── Restaurant: Menu items with recipe name joined ─────────────────────────
router.get("/menu/with-recipes", requireAuth, async (req, res) => {
  const rows = await db.select({
    id:          menuItems.id,
    userId:      menuItems.userId,
    name:        menuItems.name,
    description: menuItems.description,
    category:    menuItems.category,
    price:       menuItems.price,
    recipeId:    menuItems.recipeId,
    available:   menuItems.available,
    createdAt:   menuItems.createdAt,
    recipeName:  recipes.name,
  })
    .from(menuItems)
    .leftJoin(recipes, eq(menuItems.recipeId, recipes.id))
    .where(eq(menuItems.userId, req.userId!));
  res.json(rows);
});

// ─── Restaurant: Sell (POS for restaurant) ──────────────────────────────────
router.post("/menu/sell", requireAuth, async (req, res) => {
  const { items, paymentMethod, note } = req.body as {
    items: { menuItemId: string; quantity: number }[];
    paymentMethod: string;
    note?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items array is required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Load only requested menu items
      const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
      const loadedMenuItems = await tx.select().from(menuItems)
        .where(and(eq(menuItems.userId, req.userId!), inArray(menuItems.id, menuItemIds)));
      const menuItemMap = new Map(loadedMenuItems.map((m) => [m.id, m]));

      // Validate all items belong to user
      for (const item of items) {
        if (!menuItemMap.has(item.menuItemId)) {
          throw new Error(`Menu item ${item.menuItemId} not found`);
        }
      }

      // Collect recipe IDs and load recipes
      const recipeIds = [...new Set(
        items.map((i) => menuItemMap.get(i.menuItemId)?.recipeId).filter(Boolean) as string[],
      )];

      const recipeMap = new Map<string, typeof recipes.$inferSelect>();
      const riMap = new Map<string, (typeof recipeIngredients.$inferSelect)[]>();
      if (recipeIds.length > 0) {
        const loadedRecipes = await tx.select().from(recipes).where(inArray(recipes.id, recipeIds));
        for (const recipe of loadedRecipes) {
          recipeMap.set(recipe.id, recipe);
        }
        const loadedRecipeIngredients = await tx
          .select()
          .from(recipeIngredients)
          .where(inArray(recipeIngredients.recipeId, recipeIds));
        for (const ri of loadedRecipeIngredients) {
          const current = riMap.get(ri.recipeId) ?? [];
          current.push(ri);
          riMap.set(ri.recipeId, current);
        }
      }

      // Deduct ingredients
      const ingredientDeltas = new Map<string, number>();
      for (const item of items) {
        const menuItem = menuItemMap.get(item.menuItemId)!;
        if (!menuItem.recipeId) continue;
        const recipe = recipeMap.get(menuItem.recipeId);
        if (!recipe) continue;
        const ris = riMap.get(menuItem.recipeId) ?? [];
        const yieldQty = parseFloat(recipe.yieldQuantity as string) || 1;
        for (const ri of ris) {
          const deduct = (parseFloat(ri.quantity as string) * item.quantity) / yieldQty;
          ingredientDeltas.set(ri.ingredientId, (ingredientDeltas.get(ri.ingredientId) ?? 0) + deduct);
        }
      }

      for (const [ingId, deduct] of ingredientDeltas) {
        await tx.update(ingredients)
          .set({ stockQuantity: sql`GREATEST(0, ${ingredients.stockQuantity} - ${String(deduct)})` })
          .where(eq(ingredients.id, ingId));
      }

      // Calculate total
      let total = 0;
      const saleItems: { name: string; price: number; quantity: number }[] = [];
      for (const item of items) {
        const menuItem = menuItemMap.get(item.menuItemId)!;
        const price = parseFloat(menuItem.price as string);
        total += price * item.quantity;
        saleItems.push({ name: menuItem.name, price, quantity: item.quantity });
      }

      // Insert sale
      const receiptNumber = `R${Date.now()}`;
      const [sale] = await tx.insert(sales).values({
        userId:        req.userId!,
        items:         saleItems,
        subtotal:      total,
        tax:           0,
        total,
        amountPaid:    total,
        change:        0,
        note:          note ?? "",
        receiptNumber,
      }).returning();

      // Check low-stock ingredients
      const lowStockWarnings = await tx.select().from(ingredients)
        .where(and(
          eq(ingredients.userId, req.userId!),
          sql`${ingredients.stockQuantity}::numeric <= ${ingredients.lowStockThreshold}::numeric`,
        ));

      return { sale, lowStockWarnings };
    });

    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Payroll report ────────────────────────────────────────────────────────
router.get("/payroll/report", requireAuth, async (req, res) => {
  const { start, end } = req.query as { start?: string; end?: string };
  const userId = req.userId!;

  try {
    // Load all employees for this user
    const emps = await db.select().from(employees).where(eq(employees.userId, userId));

    // Load shifts in date range (for hourly employees)
    const shiftsQuery = db.select().from(shifts).where(
      and(
        eq(shifts.userId, userId),
        start ? gte(shifts.shiftStart, new Date(start)) : undefined,
        end   ? lte(shifts.shiftStart, new Date(end + "T23:59:59Z")) : undefined,
      )
    );
    const shiftsInRange = await shiftsQuery;

    // Load daily_pay_records in date range (for daily/salary employees)
    const dailyQuery = db.select().from(dailyPayRecords).where(
      and(
        eq(dailyPayRecords.userId, userId),
        start ? gte(dailyPayRecords.workDate, start) : undefined,
        end   ? lte(dailyPayRecords.workDate, end)   : undefined,
      )
    );
    const dailyInRange = await dailyQuery;

    const shiftsByEmployee = new Map<string, typeof shifts.$inferSelect[]>();
    for (const shift of shiftsInRange) {
      if (shift.hoursWorked === null) continue;
      const current = shiftsByEmployee.get(shift.employeeId) ?? [];
      current.push(shift);
      shiftsByEmployee.set(shift.employeeId, current);
    }
    const dailyByEmployee = new Map<string, typeof dailyPayRecords.$inferSelect[]>();
    for (const daily of dailyInRange) {
      const current = dailyByEmployee.get(daily.employeeId) ?? [];
      current.push(daily);
      dailyByEmployee.set(daily.employeeId, current);
    }

    const report = emps.map((emp) => {
      const empPayrollType = emp.payrollType ?? "hourly";
      if (empPayrollType === "hourly") {
        const empShifts = shiftsByEmployee.get(emp.id) ?? [];
        const hoursWorked = empShifts.reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
        const estimatedPay = hoursWorked * (emp.hourlyWage ?? 0);
        return {
          employee: { id: emp.id, name: emp.name, role: emp.role, payrollType: empPayrollType },
          hoursWorked,
          estimatedPay,
          shifts: empShifts,
        };
      } else {
        const empDailyRecords = dailyByEmployee.get(emp.id) ?? [];
        const estimatedPay = empDailyRecords.reduce((sum, d) => sum + parseFloat(d.totalPay as string), 0);
        return {
          employee: { id: emp.id, name: emp.name, role: emp.role, payrollType: empPayrollType },
          estimatedPay,
          dailyRecords: empDailyRecords,
        };
      }
    });

    res.json(report);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Tax summary ────────────────────────────────────────────────────────────
router.get("/tax-summary", requireAuth, async (req, res) => {
  const userId = req.userId!;

  try {
    const [profile] = await db.select().from(storeProfiles).where(eq(storeProfiles.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString();
    const todayEnd   = now.toISOString();

    // Current month totals
    const [monthSales] = await db.select({ total: sum(sales.total) }).from(sales)
      .where(and(eq(sales.userId, userId), gte(sales.createdAt, new Date(monthStart)), lte(sales.createdAt, new Date(todayEnd))));
    const [monthExpenses] = await db.select({ total: sum(expenses.amount) }).from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, new Date(monthStart)), lte(expenses.date, new Date(todayEnd))));

    // Year to date totals
    const [ytdSales] = await db.select({ total: sum(sales.total) }).from(sales)
      .where(and(eq(sales.userId, userId), gte(sales.createdAt, new Date(yearStart)), lte(sales.createdAt, new Date(todayEnd))));
    const [ytdExpenses] = await db.select({ total: sum(expenses.amount) }).from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, new Date(yearStart)), lte(expenses.date, new Date(todayEnd))));

    const taxRate = profile.taxRate ?? 0;

    const monthSalesTotal    = parseFloat(monthSales?.total as string ?? "0") || 0;
    const monthExpenseTotal  = parseFloat(monthExpenses?.total as string ?? "0") || 0;
    const ytdSalesTotal      = parseFloat(ytdSales?.total as string ?? "0") || 0;
    const ytdExpenseTotal    = parseFloat(ytdExpenses?.total as string ?? "0") || 0;

    res.json({
      profile: {
        country:   profile.country,
        stateCode: profile.stateCode,
        taxRate,
        currency:  profile.currency,
      },
      currentMonth: {
        totalSales:    monthSalesTotal,
        taxCollected:  monthSalesTotal * taxRate,
        totalExpenses: monthExpenseTotal,
      },
      ytd: {
        totalSales:    ytdSalesTotal,
        taxCollected:  ytdSalesTotal * taxRate,
        totalExpenses: ytdExpenseTotal,
      },
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
