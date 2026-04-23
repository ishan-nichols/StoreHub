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
  orderByCol?: PgColumn;
}

/**
 * Build a CRUD router for a per-user table.
 * GET    /         → list rows for current user
 * POST   /         → insert row (userId injected)
 * PATCH  /:id      → partial update (only if row.userId == current user)
 * DELETE /:id      → delete row (only if row.userId == current user)
 */
export function buildCrudRouter(opts: CrudTable): IRouter {
  const { table, userIdCol, idCol, orderByCol } = opts;
  const router: IRouter = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const rows = await (db as any)
      .select()
      .from(table)
      .where(eq(userIdCol, req.userId!))
      .orderBy(orderByCol ? desc(orderByCol) : desc(idCol));
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
      const [row] = await (db as any)
        .update(table)
        .set(patch)
        .where(and(eq(idCol, id), eq(userIdCol, req.userId!)))
        .returning();
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
    const [row] = await (db as any)
      .delete(table)
      .where(and(eq(idCol, id), eq(userIdCol, req.userId!)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
