import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/conversations", async (req, res) => {
  const rows = await db.select().from(conversations)
    .where(eq(conversations.userId, req.userId!))
    .orderBy(conversations.createdAt);
  res.json(rows);
});

router.post("/conversations", async (req, res) => {
  const { title } = req.body as { title: string };
  const [row] = await db.insert(conversations).values({ title, userId: req.userId! }).returning();
  res.status(201).json(row);
});

router.get("/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, req.userId!)));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, req.userId!)));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id);
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, req.userId!)));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id);
  const { content, systemContext } = req.body as { content: string; systemContext?: string };

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, req.userId!)));
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(messages).values({ conversationId: id, role: "user", content });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const SYSTEM_PROMPT = systemContext ?? `You are StoreHub AI, a helpful assistant built into StoreHub — a smart small business management app. You help small business owners (grocery stores, bakeries, butchers, clothing stores, restaurants, pharmacies, and general stores) manage their operations effectively.

StoreHub features you can help with:
- Dashboard: Shows today's revenue, expenses, profit, low-stock alerts, and smart tips
- Inventory: Add/edit/delete products with name, SKU, category, price, quantity, low-stock threshold, unit, supplier links
- Point of Sale (POS): Tap products to add to cart, process sales, and generate receipts
- Sales History: View all past transactions with full receipt details
- Expense Tracker: Log business expenses by category with date
- Suppliers: Manage supplier contacts with phone, email, and product links
- Employees: Add team members with roles, hourly wage, and 4-digit PIN for the employee portal
- Clock In/Out: Employees can clock in and out with a live running timer showing current shift duration
- Employee Portal: A separate PIN-protected view where staff can see their own hours, pay, and schedule
- Settings: Change store name, currency, language, tax rate, and toggle dark mode

How to add products: Go to Inventory → click "Add Product" → fill in name, SKU, price, quantity, and category.
How to make a sale: Go to POS → tap products to add to cart → click Checkout → enter amount paid.
How to add employees: Go to Employees → click "Add Employee" → enter name, role, hourly wage, and PIN.
How to clock in/out: On the Employees page, click the Clock In button next to the employee name.
How to access the employee portal: Go to /employee or click "Employee Sign In" — enter name and PIN.

You are friendly, concise, and practical. Always give step-by-step instructions when explaining how to do something. Respond in the same language the user writes in (English or Spanish).`;

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: "AI error", done: true })}\n\n`);
  }

  res.end();
});

export default router;
