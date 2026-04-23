/**
 * POST /api/upc/lookup
 *
 * Asks Claude to identify the exact product for a given UPC barcode number.
 * Uses a strong, specific prompt — no vision, pure knowledge lookup.
 */

import { Router } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

const SYSTEM_PROMPT = `You are a retail product identification expert with a comprehensive knowledge of UPC barcodes for products sold in US convenience stores, gas stations, grocery stores, and retail chains.

When given a UPC number, identify the EXACT product. Be as specific as possible:
- For cigarettes: exact brand (Newport, Marlboro, Winston, Camel, etc.), variant (Menthol, Red, Blue, Gold, etc.), style (King, 100s, Short), pack type (Box, Soft Pack), and count (20ct)
- For beverages: exact brand, flavor, size in oz/ml
- For snacks: exact brand, flavor, size/weight
- For other products: exact brand, product name, size/variant

Return ONLY a valid JSON object with these fields:
{
  "name": "<full product name including brand, variant, size — everything>",
  "brand": "<brand name only>",
  "category": "<category like Tobacco, Beverage, Snack, etc.>",
  "description": "<one sentence description>",
  "srp": <suggested US retail price as a number, or null>
}

No markdown. No explanation. No code fences. JSON only. If you truly cannot identify the product, return null.`;

router.post("/lookup", async (req, res) => {
  const { barcode } = req.body as { barcode?: string };
  const upc = (barcode ?? "").replace(/\D/g, "");
  if (!upc) { res.status(400).json({ error: "barcode is required" }); return; }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let raw = "";
  try {
    const msg = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-5",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `UPC barcode: ${upc}\n\nIdentify this exact product.`,
          },
        ],
      },
      { signal: controller.signal },
    );
    raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  } catch (err) {
    console.error("[UPC] Claude error:", err);
    res.json({ found: false });
    return;
  } finally {
    clearTimeout(timer);
  }

  console.log(`[UPC] ${upc} → ${raw.slice(0, 120)}`);

  const cleaned = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
  if (!cleaned || cleaned === "null") { res.json({ found: false }); return; }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.json({ found: false }); return; }

  try {
    const p = JSON.parse(jsonMatch[0]) as {
      name?: string; brand?: string; category?: string; description?: string; srp?: number;
    };
    if (!p.name?.trim()) { res.json({ found: false }); return; }
    res.json({
      found: true,
      name: p.name.trim(),
      brand: p.brand?.trim() || undefined,
      category: p.category?.trim() || undefined,
      description: p.description?.trim() || undefined,
      srp: typeof p.srp === "number" ? p.srp : undefined,
    });
  } catch {
    res.json({ found: false });
  }
});

export default router;
