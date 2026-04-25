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

interface PriceHistoryProduct {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  costPrice: number;
  priceHistory: Array<{
    date: string;
    costPrice: number;
    supplierId: string;
    supplierName: string;
    note?: string;
  }>;
  estimatedAnnualUnits?: number;
}

// ─── POST /api/suppliers/negotiate ───────────────────────────────────────────

router.post("/negotiate", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { supplierName, products, storeData } = req.body as {
      supplierName: string;
      products: PriceHistoryProduct[];
      storeData?: Record<string, unknown>;
    };

    if (!supplierName || !products || products.length === 0) {
      res.status(400).json({ error: "supplierName and products are required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const prompt = `You are an expert retail business advisor helping a store owner negotiate with their supplier.

Supplier: ${supplierName}

Products supplied and their price history:
${JSON.stringify(products, null, 2)}

${storeData ? `Store context:\n${JSON.stringify(storeData, null, 2)}` : ""}

Analyze the price history for these products from this supplier. Generate a comprehensive negotiation report.

Consider:
- Which products have had significant price increases (>5%)?
- What is the total annual financial impact of recent price increases?
- Are there likely alternative suppliers based on product categories?
- What is a realistic target price for negotiation?

Return ONLY valid JSON (no markdown, no explanation) with exactly this structure:
{
  "summary": "2-3 sentence executive summary of the negotiation situation and recommended approach",
  "priceIncreases": [
    {
      "productName": "string",
      "oldPrice": 0.00,
      "newPrice": 0.00,
      "changePct": 0.0,
      "annualImpact": 0.00
    }
  ],
  "cheaperAlternatives": [
    {
      "productName": "string",
      "currentSupplier": "string",
      "alternativeSupplier": "string",
      "savings": 0.00
    }
  ],
  "negotiationScript": "Full multi-paragraph draft conversation script for negotiating with this supplier. Include: opening pleasantries, stating the concern professionally, presenting the data, making a specific ask, handling objections, and closing. Make it realistic and friendly but firm.",
  "recommendedTargetPrice": 0.00,
  "totalAnnualImpact": 0.00
}

For priceIncreases, only include products where price went up. For cheaperAlternatives, suggest realistic alternative supplier types based on product categories (even if hypothetical — e.g., "regional wholesaler", "direct manufacturer"). The negotiationScript should be 4-6 paragraphs and sound like a real conversation.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Claude returned invalid format" });
      return;
    }

    const report = JSON.parse(jsonMatch[0]);
    res.json({ report, generatedAt: new Date().toISOString() });
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
