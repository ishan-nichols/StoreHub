import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-placeholder")) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  return new Anthropic({ apiKey });
}

// ─── POST /api/tips/generate ─────────────────────────────────────────────────
// Accepts full store data JSON, returns 3 prioritized tips from Claude.

router.post("/generate", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { storeData, dismissedTipIds = [] } = req.body as {
      storeData: Record<string, unknown>;
      dismissedTipIds?: string[];
    };

    if (!storeData) {
      res.status(400).json({ error: "storeData is required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const dismissedNote = dismissedTipIds.length > 0
      ? `\n\nThe owner has previously dismissed tips with these IDs: ${dismissedTipIds.join(", ")}. Do NOT repeat those types of tips.`
      : "";

    const prompt = `You are a smart business advisor for a small store. Here is everything happening in this store right now:

${JSON.stringify(storeData, null, 2)}

Based on this data, generate the 3 most important actionable tips this owner should act on today. Each tip must be:
- SPECIFIC to their actual data — never generic
- Written in plain, friendly language — like a smart friend who knows their business
- Ranked by urgency and financial impact${dismissedNote}

Return ONLY a valid JSON array (no markdown, no explanation) with exactly this structure:
[
  {
    "id": "tip_<unique 8-char hex>",
    "title": "Short punchy title (under 10 words)",
    "explanation": "Why this matters based on their specific numbers (2-3 sentences)",
    "action": "One specific thing they can do right now (1 sentence, starts with a verb)",
    "urgency": "critical" | "high" | "medium" | "low",
    "estimatedImpact": "e.g. +$200/week or Save 2 hours",
    "category": "inventory" | "pricing" | "sales" | "suppliers" | "employees" | "cashflow" | "seasonal" | "compliance",
    "emoji": "single relevant emoji"
  }
]

Categories to cover (pick the 3 most relevant to THIS store's data):
- inventory: running low, slow moving, overstocked
- pricing: margins too low, pricing opportunities
- sales: patterns, best/worst products, trends
- suppliers: reorder timing, cost changes
- employees: scheduling, peak hours
- cashflow: expenses rising, profit dropping
- seasonal: upcoming events, seasonal stock
- compliance: tax deadlines, license reminders`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

    // Extract JSON array even if Claude wraps it in markdown
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude returned invalid format" });
      return;
    }

    const tips = JSON.parse(jsonMatch[0]);
    res.json({ tips, generatedAt: new Date().toISOString() });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ─── POST /api/tips/chat ─────────────────────────────────────────────────────
// Follow-up chat on a specific tip. Returns a streaming explanation.

router.post("/chat", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { tip, question, storeData } = req.body as {
      tip: { title: string; explanation: string; action: string; category: string };
      question: string;
      storeData?: Record<string, unknown>;
    };

    if (!tip || !question) {
      res.status(400).json({ error: "tip and question are required" });
      return;
    }

    const anthropic = getAnthropicClient();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const systemPrompt = `You are a smart, friendly business advisor for a small store owner.
You previously gave them this tip:
- Title: ${tip.title}
- Explanation: ${tip.explanation}
- Suggested action: ${tip.action}
${storeData ? `\nTheir store data:\n${JSON.stringify(storeData, null, 2)}` : ""}

Answer their follow-up question using their actual data whenever possible.
Be conversational, direct, and helpful — like a knowledgeable friend.
Keep your answer under 200 words.
Always add: "For complex decisions, consider consulting a professional."`;

    const stream = await anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    const msg = (error as Error).message;
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ error: msg, done: true })}\n\n`);
      res.end();
    }
  }
});

// ─── POST /api/tips/weekly ────────────────────────────────────────────────────
// Weekly business summary — called every Monday.

router.post("/weekly", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { storeData } = req.body as { storeData: Record<string, unknown> };
    if (!storeData) { res.status(400).json({ error: "storeData is required" }); return; }

    const anthropic = getAnthropicClient();

    const prompt = `You are a business advisor reviewing a full week of store performance. Here is the complete store data:

${JSON.stringify(storeData, null, 2)}

Generate a weekly business summary with exactly 5 insights. This is a Monday morning review covering last week.

Return ONLY a valid JSON object (no markdown):
{
  "weekSummary": "2-3 sentence overview of the week (specific numbers)",
  "insights": [
    {
      "title": "Short title",
      "finding": "What happened last week (use actual numbers)",
      "recommendation": "What to do differently this week",
      "category": "inventory|pricing|sales|suppliers|employees|cashflow"
    }
  ]
}

Be specific, data-driven, and actionable. Use actual numbers from the data.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.status(500).json({ error: "Claude returned invalid format" }); return; }

    const summary = JSON.parse(jsonMatch[0]);
    res.json({ summary, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
