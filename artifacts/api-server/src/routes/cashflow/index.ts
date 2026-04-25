import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyForecast {
  weekStart: string;
  weekEnd: string;
  projectedIncome: number;
  projectedExpenses: number;
  netCash: number;
  runningBalance: number;
  notes: string;
}

interface CashGapAlert {
  weekStart: string;
  gapAmount: number;
  cause: string;
  suggestions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-placeholder")) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  return new Anthropic({ apiKey });
}

// ─── POST /api/cashflow/forecast ──────────────────────────────────────────────

router.post("/forecast", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { storeData } = req.body as {
      storeData: {
        recentSales: unknown[];
        recurringExpenses: unknown[];
        suppliers: unknown[];
        employees: unknown[];
        taxDeadlines: unknown[];
        currentCashEstimate: number;
        avgWeeklyRevenue: number;
        laborEstimate: number;
      };
    };

    if (!storeData) {
      res.status(400).json({ error: "storeData is required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const prompt = `You are a cash flow forecasting expert for a small retail store. Today is ${todayStr}.

Here is the store's current financial data:
${JSON.stringify(storeData, null, 2)}

Generate a 5-week (35-day) cash flow forecast starting from today. The currentCashEstimate is the starting balance.

For each week, project realistic income and expenses based on the patterns in the data.
- Use avgWeeklyRevenue as the baseline for income, with slight variation (+/- 15%)
- Include recurring expenses and estimate their weekly impact
- Include labor costs based on employee data (laborEstimate per week)
- Flag any weeks where the running balance may go negative or dangerously low (under $500)

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "forecast": [
    {
      "weekStart": "YYYY-MM-DD",
      "weekEnd": "YYYY-MM-DD",
      "projectedIncome": number,
      "projectedExpenses": number,
      "netCash": number,
      "runningBalance": number,
      "notes": "brief note about this week"
    }
  ],
  "alerts": [
    {
      "weekStart": "YYYY-MM-DD",
      "gapAmount": number,
      "cause": "brief explanation of what causes the gap",
      "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
    }
  ]
}

Rules:
- Generate exactly 5 weekly entries
- runningBalance is cumulative: starts at currentCashEstimate, then adds netCash each week
- netCash = projectedIncome - projectedExpenses
- Only create alerts for weeks where runningBalance < 500 or netCash < 0
- Each alert must have exactly 3 suggestions
- Keep notes under 15 words`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

    // Extract JSON object
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude returned invalid format" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      forecast: WeeklyForecast[];
      alerts: CashGapAlert[];
    };

    // Validate structure
    if (!Array.isArray(parsed.forecast) || !Array.isArray(parsed.alerts)) {
      res.status(500).json({ error: "Claude returned unexpected structure" });
      return;
    }

    res.json({
      forecast: parsed.forecast,
      alerts: parsed.alerts,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
