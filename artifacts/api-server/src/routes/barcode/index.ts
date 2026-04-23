/**
 * GET /api/barcode/lookup?upc=...
 *
 * 1. UPCitemdb — exact database lookup (tobacco, gum, beverages, all US retail)
 *    → if found: Claude adds the SRP
 *    → if not found: Claude identifies the full product by barcode number
 */

import { Router } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Ask Claude for SRP given a known product name
async function getSRP(productName: string): Promise<number | null> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      system: "You are a US retail pricing expert. Given a product name that may include size (oz, ml, mg, g, ct, etc.), respond with ONLY a single decimal number for the typical US suggested retail price for that EXACT size and variant. Size matters — a 12oz drink and a 32oz drink have very different prices. No dollar sign, no text, no explanation. If unknown, respond with null.",
      messages: [{ role: "user", content: `SRP for: ${productName}` }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  } catch { return null; }
}


type DBResult = {
  source: string; name: string; brand?: string;
  category?: string; size?: string; imageUrl?: string;
} | null;

async function queryUPCitemdb(upc: string): Promise<DBResult> {
  try {
    const r = await fetchWithTimeout(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`,
      { headers: { "User-Agent": "StoreHub/1.0", Accept: "application/json" } },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { items?: Array<{ title?: string; brand?: string; category?: string; size?: string; images?: string[] }> };
    const item = data.items?.[0];
    if (!item?.title?.trim()) return null;
    console.log(`[barcode] UPCitemdb found: ${item.title}`);
    return {
      source: "UPCitemdb", name: item.title.trim(),
      brand: item.brand?.trim() || undefined,
      category: item.category?.split(">").pop()?.trim() || undefined,
      size: item.size || undefined, imageUrl: item.images?.[0] || undefined,
    };
  } catch (e) { console.log(`[barcode] UPCitemdb error: ${(e as Error).message}`); return null; }
}

async function queryOFF(upc: string): Promise<DBResult> {
  try {
    const r = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v0/product/${upc}.json`,
      { headers: { "User-Agent": "StoreHub/1.0" } },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { status?: number; product?: { product_name?: string; brands?: string; categories?: string; quantity?: string; image_front_url?: string } };
    if (data.status !== 1 || !data.product?.product_name?.trim()) return null;
    const p = data.product;
    console.log(`[barcode] OFF found: ${p.product_name}`);
    return {
      source: "Open Food Facts", name: p.product_name!.trim(),
      brand: p.brands?.split(",")[0]?.trim() || undefined,
      category: p.categories?.split(",")[0]?.trim() || undefined,
      size: p.quantity || undefined, imageUrl: p.image_front_url || undefined,
    };
  } catch (e) { console.log(`[barcode] OFF error: ${(e as Error).message}`); return null; }
}

router.get("/lookup", async (req, res) => {
  const upc = String(req.query["upc"] ?? "").replace(/\D/g, "");
  if (!upc) { res.status(400).json({ error: "upc required" }); return; }

  console.log(`[barcode] looking up: ${upc}`);

  // ── Step 1: Query all databases in parallel, first hit wins ──────────────
  const queries: Promise<DBResult>[] = [queryUPCitemdb(upc), queryOFF(upc)];

  const hit = await new Promise<DBResult>((resolve) => {
    let remaining = queries.length;
    for (const q of queries) {
      q.then((r) => {
        if (r) { resolve(r); return; }
        if (--remaining === 0) resolve(null);
      });
    }
    setTimeout(() => resolve(null), 7000);
  });

  // ── Step 2a: Hit → Claude adds SRP (size-aware) ──────────────────────────
  if (hit) {
    const nameWithSize = hit.size && !hit.name.toLowerCase().includes(hit.size.toLowerCase())
      ? `${hit.name} ${hit.size}`
      : hit.name;
    const srp = await getSRP(nameWithSize);
    return res.json({ found: true, barcode: upc, ...hit, srp: srp ?? undefined });
  }

  // ── Step 2b: All DBs missed → manual entry ────────────────────────────────
  console.log(`[barcode] not found in any DB: ${upc}`);
  return res.json({ found: false, barcode: upc });
});

export default router;
