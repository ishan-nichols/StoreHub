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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductPrediction {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  predictedDemand7d: number;
  dailyBreakdown: number[]; // 7 values Mon-Sun
  recommendedOrderQty: number;
  orderByDate: string;
  urgency: "critical" | "high" | "medium" | "low";
  reasoning: string;
  daysUntilStockout: number;
}

interface PredictionAlert {
  productId: string;
  productName: string;
  urgency: "critical" | "high";
  daysUntilStockout: number;
  currentStock: number;
  predictedDemand7d: number;
}

const PREDICTION_SYSTEM_PROMPT = `You are an expert retail demand forecasting engine.
Your job is to analyze sales history, seasonality, upcoming holidays/weekends, and day-of-week patterns to forecast per-product demand for the next 7 days.

You MUST return ONLY a valid JSON array with no markdown, no explanation, no preamble.

Each object in the array must follow this schema exactly:
{
  "productId": string,
  "productName": string,
  "category": string,
  "currentStock": number,
  "predictedDemand7d": number,
  "dailyBreakdown": [Mon, Tue, Wed, Thu, Fri, Sat, Sun] (7 numbers),
  "recommendedOrderQty": number,
  "orderByDate": "YYYY-MM-DD",
  "urgency": "critical" | "high" | "medium" | "low",
  "reasoning": "1-2 sentences explaining why",
  "daysUntilStockout": number
}

Urgency rules:
- critical: daysUntilStockout <= 2 or currentStock < predictedDemand7d * 0.5
- high: daysUntilStockout <= 5 or currentStock < predictedDemand7d
- medium: currentStock < predictedDemand7d * 1.5
- low: well-stocked with comfortable buffer

recommendedOrderQty: enough to cover 2 weeks of predicted demand minus current stock, minimum 0.
orderByDate: the last safe date to place an order (based on lead time and daysUntilStockout).
daysUntilStockout: currentStock / (predictedDemand7d / 7), round to nearest integer.`;

function buildPredictionPrompt(storeData: Record<string, unknown>, eventContext?: string): string {
  const event = eventContext ? `\n\nEVENT CONTEXT (factor this into demand): ${eventContext}` : "";
  return `Analyze this store data and generate demand predictions for all products listed.${event}

STORE DATA:
${JSON.stringify(storeData, null, 2)}

Return ONLY the JSON array of ProductPrediction objects. No markdown fences, no explanation.`;
}

// ─── POST /api/predictions/generate ──────────────────────────────────────────

router.post("/generate", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { storeData, eventContext } = req.body as {
      storeData: Record<string, unknown>;
      eventContext?: string;
    };

    if (!storeData) {
      res.status(400).json({ error: "storeData is required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: PREDICTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildPredictionPrompt(storeData, eventContext),
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

    // Extract JSON array even if Claude wraps in markdown
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude returned invalid format — could not parse predictions" });
      return;
    }

    let predictions: ProductPrediction[];
    try {
      predictions = JSON.parse(jsonMatch[0]) as ProductPrediction[];
    } catch {
      res.status(500).json({ error: "Claude returned malformed JSON" });
      return;
    }

    res.json({ predictions, generatedAt: new Date().toISOString() });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ─── POST /api/predictions/recalculate ───────────────────────────────────────

router.post("/recalculate", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { storeData, eventContext, existingPredictions } = req.body as {
      storeData: Record<string, unknown>;
      eventContext: string;
      existingPredictions?: ProductPrediction[];
    };

    if (!storeData || !eventContext) {
      res.status(400).json({ error: "storeData and eventContext are required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const contextualData = {
      ...storeData,
      existingPredictions: existingPredictions ?? [],
    };

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: PREDICTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildPredictionPrompt(contextualData, eventContext),
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude returned invalid format" });
      return;
    }

    let predictions: ProductPrediction[];
    try {
      predictions = JSON.parse(jsonMatch[0]) as ProductPrediction[];
    } catch {
      res.status(500).json({ error: "Claude returned malformed JSON" });
      return;
    }

    res.json({ predictions, generatedAt: new Date().toISOString() });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ─── POST /api/predictions/alert-check ───────────────────────────────────────
// Pure logic — no Claude call needed

router.post("/alert-check", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { predictions } = req.body as { predictions: ProductPrediction[] };

    if (!Array.isArray(predictions)) {
      res.status(400).json({ error: "predictions array is required" });
      return;
    }

    const alerts: PredictionAlert[] = predictions
      .filter(
        (p) =>
          p.daysUntilStockout <= 3 &&
          (p.urgency === "critical" || p.urgency === "high"),
      )
      .map((p) => ({
        productId: p.productId,
        productName: p.productName,
        urgency: p.urgency as "critical" | "high",
        daysUntilStockout: p.daysUntilStockout,
        currentStock: p.currentStock,
        predictedDemand7d: p.predictedDemand7d,
      }));

    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
