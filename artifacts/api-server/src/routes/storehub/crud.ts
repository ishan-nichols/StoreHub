import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import type { PgColumn } from "drizzle-orm/pg-core";
import { requireAuth } from "../../middlewares/requireAuth.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface CrudTable {
  table: any;
  userIdCol: PgColumn;
  idCol: PgColumn;
  businessIdCol?: PgColumn;
  orderByCol?: PgColumn;
}

/**
 * Build a CRUD router with role-based filtering.
 * - Superadmin: no filtering (sees all data)
 * - Business owner: filtered by businessId
 * - Store owner: filtered by userId
 *
 * GET    /         → list rows for current user/business
 * POST   /         → insert row (userId injected)
 * PATCH  /:id      → partial update (with permission check)
 * DELETE /:id      → delete row (with permission check)
 */
export function buildCrudRouter(opts: CrudTable): IRouter {
  const { table, userIdCol, idCol, businessIdCol, orderByCol } = opts;
  const router: IRouter = Router();
  router.use(requireAuth);

  // Helper to build WHERE clause based on role
  function buildWhereClause(userId: string, userRole?: string, businessId?: string) {
    if (userRole === "superadmin") {
      return undefined; // no filtering for superadmin
    }
    if (userRole === "business_owner" && businessIdCol && businessId) {
      return eq(businessIdCol, businessId);
    }
    // store_owner or default: filter by userId
    return eq(userIdCol, userId);
  }

  router.get("/", async (req, res) => {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const requestedOffset = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const whereClause = buildWhereClause(req.userId!, req.userRole, req.businessId);
    let query = (db as any).select().from(table);
    if (whereClause) {
      query = query.where(whereClause);
    }
    const rows = await query
      .orderBy(orderByCol ? desc(orderByCol) : desc(idCol))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  });

  router.post("/", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { id: _i, userId: _u, createdAt: _c, updatedAt: _ud, ...rest } = body;
    void _i; void _u; void _c; void _ud;
    try {
      const [row] = await (db as any)
        .insert(table)
        .values({ ...rest, userId: req.userId! })
        .returning();
      res.status(201).json(row);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.patch("/:id", async (req, res) => {
    const id = req.params.id;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { id: _i, userId: _u, createdAt: _c, ...patch } = body;
    void _i; void _u; void _c;
    try {
      const whereClause = buildWhereClause(req.userId!, req.userRole, req.businessId);
      let query = (db as any).update(table).set(patch).where(eq(idCol, id));
      if (whereClause) {
        query = query.where(and(eq(idCol, id), whereClause));
      }
      const [row] = await query.returning();
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.delete("/:id", async (req, res) => {
    const id = req.params.id;
    const whereClause = buildWhereClause(req.userId!, req.userRole, req.businessId);
    let query = (db as any).delete(table).where(eq(idCol, id));
    if (whereClause) {
      query = query.where(and(eq(idCol, id), whereClause));
    }
    const [row] = await query.returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
