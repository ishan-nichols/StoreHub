import { Router } from "express";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { customers, sales } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lapsedCutoff(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d;
}

function withLapsed<T extends { lastVisitAt: Date | null; visitCount: number }>(
  rows: T[],
): (T & { isLapsed: boolean })[] {
  const cutoff = lapsedCutoff();
  return rows.map((c) => ({
    ...c,
    isLapsed: c.visitCount > 2 && c.lastVisitAt !== null && c.lastVisitAt < cutoff,
  }));
}

// ─── GET / — list all customers ───────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, req.userId!))
      .orderBy(desc(customers.totalSpent));
    res.json(withLapsed(rows));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── GET /top — top 20 by totalSpent ─────────────────────────────────────────

router.get("/top", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, req.userId!))
      .orderBy(desc(customers.totalSpent))
      .limit(20);
    res.json(withLapsed(rows));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── GET /lapsed — lapsed customers ──────────────────────────────────────────

router.get("/lapsed", async (req, res) => {
  try {
    const cutoff = lapsedCutoff();
    const rows = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.userId, req.userId!),
          sql`${customers.visitCount} > 2`,
          lt(customers.lastVisitAt, cutoff),
        ),
      )
      .orderBy(desc(customers.totalSpent));
    res.json(withLapsed(rows));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── POST /lookup — find by phone ─────────────────────────────────────────────

router.post("/lookup", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.userId, req.userId!), eq(customers.phone, phone.trim())))
      .limit(1);
    res.json(row ? { ...row, isLapsed: withLapsed([row])[0].isLapsed } : null);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── POST / — create customer ─────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const { name, phone, email, notes } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  };
  try {
    const [row] = await db
      .insert(customers)
      .values({
        userId: req.userId!,
        name: name?.trim() ?? "",
        phone: phone?.trim() ?? null,
        email: email?.trim() ?? null,
        notes: notes?.trim() ?? null,
      })
      .returning();
    res.status(201).json({ ...row, isLapsed: false });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── GET /:id — get customer + purchase history ───────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)));
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const history = customer.phone
      ? await db
          .select()
          .from(sales)
          .where(and(eq(sales.userId, req.userId!), eq(sales.customerPhone, customer.phone)))
          .orderBy(desc(sales.createdAt))
          .limit(50)
      : [];

    res.json({
      ...customer,
      isLapsed: withLapsed([customer])[0].isLapsed,
      purchaseHistory: history,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── PATCH /:id — update customer ────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const { name, phone, email, notes, loyaltyPoints } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
    loyaltyPoints?: number;
  };
  try {
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (name !== undefined) patch.name = name.trim();
    if (phone !== undefined) patch.phone = phone.trim() || null;
    if (email !== undefined) patch.email = email.trim() || null;
    if (notes !== undefined) patch.notes = notes.trim() || null;
    if (loyaltyPoints !== undefined) patch.loyaltyPoints = loyaltyPoints;

    const [row] = await db
      .update(customers)
      .set(patch)
      .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...row, isLapsed: withLapsed([row])[0].isLapsed });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── POST /:id/add-points ─────────────────────────────────────────────────────

router.post("/:id/add-points", async (req, res) => {
  const { points } = req.body as { points?: number };
  if (typeof points !== "number" || points <= 0) {
    res.status(400).json({ error: "points must be a positive number" });
    return;
  }
  try {
    const [row] = await db
      .update(customers)
      .set({ loyaltyPoints: sql`${customers.loyaltyPoints} + ${points}` })
      .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ loyaltyPoints: row.loyaltyPoints });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── POST /:id/redeem-points ──────────────────────────────────────────────────

router.post("/:id/redeem-points", async (req, res) => {
  const { points } = req.body as { points?: number };
  if (typeof points !== "number" || points <= 0) {
    res.status(400).json({ error: "points must be a positive number" });
    return;
  }
  try {
    const [existing] = await db
      .select({ loyaltyPoints: customers.loyaltyPoints })
      .from(customers)
      .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)));

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.loyaltyPoints < points) {
      res.status(400).json({ error: "Insufficient points", available: existing.loyaltyPoints });
      return;
    }

    const [row] = await db
      .update(customers)
      .set({ loyaltyPoints: sql`${customers.loyaltyPoints} - ${points}` })
      .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)))
      .returning();

    res.json({ loyaltyPoints: row.loyaltyPoints });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── POST /:id/offer — generate AI personalized offer ────────────────────────

router.post("/:id/offer", async (req, res) => {
  const { customer } = req.body as {
    customer?: {
      name?: string;
      totalSpent?: number;
      visitCount?: number;
      purchaseHistory?: Array<{ items?: Array<{ productName?: string; name?: string }> }>;
    };
  };

  if (!customer) {
    res.status(400).json({ error: "customer data is required" });
    return;
  }

  // Verify customer belongs to this user
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, req.params.id), eq(customers.userId, req.userId!)));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Build product summary from purchase history
  const productCounts: Record<string, number> = {};
  if (customer.purchaseHistory) {
    for (const sale of customer.purchaseHistory) {
      for (const item of sale.items ?? []) {
        const name = item.productName ?? item.name ?? "Unknown";
        productCounts[name] = (productCounts[name] ?? 0) + 1;
      }
    }
  }
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)
    .join(", ");

  const prompt = `Customer: ${customer.name ?? "Valued Customer"}
Total spent: $${(customer.totalSpent ?? 0).toFixed(2)}
Visit count: ${customer.visitCount ?? 0}
Frequently buys: ${topProducts || "various items"}

Generate a short, warm personalized offer for this customer. Include their name, what they usually buy, and a specific deal. Max 2 sentences.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const offer =
      message.content[0].type === "text" ? message.content[0].text : "Thank you for being a valued customer!";

    res.json({ offer });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
