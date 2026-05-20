import { Router } from "express";

const router = Router();

// ── Free barcode databases ────────────────────────────────────────────────────

async function tryOpenFoodFacts(upc: string) {
  const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`);
  const data = await res.json() as { status: number; product?: { product_name?: string; brands?: string; categories_tags?: string[]; quantity?: string } };
  if (data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  return {
    name:     p.product_name,
    brand:    p.brands?.split(",")[0]?.trim() || undefined,
    category: p.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "").replace(/-/g, " ") || undefined,
  };
}

async function tryUPCItemDB(upc: string) {
  const res  = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
  const data = await res.json() as { items?: Array<{ title?: string; brand?: string; category?: string; description?: string }> };
  const item = data.items?.[0];
  if (!item?.title) return null;
  return {
    name:        item.title,
    brand:       item.brand       || undefined,
    category:    item.category    || undefined,
    description: item.description || undefined,
  };
}

async function tryOpenBeautyFacts(upc: string) {
  const res  = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${upc}.json`);
  const data = await res.json() as { status: number; product?: { product_name?: string; brands?: string; categories_tags?: string[] } };
  if (data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  return {
    name:     p.product_name,
    brand:    p.brands?.split(",")[0]?.trim() || undefined,
    category: p.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "").replace(/-/g, " ") || undefined,
  };
}

async function tryOpenProductData(upc: string) {
  const res  = await fetch(`https://pod.opendatasoft.com/api/explore/v2.1/catalog/datasets/pod_gtin/records?where=gtin_cd%3D%22${upc}%22&limit=1`);
  const data = await res.json() as { results?: Array<{ brand_name?: string; long_description?: string; category?: string }> };
  const item = data.results?.[0];
  if (!item?.long_description) return null;
  return {
    name:     item.long_description,
    brand:    item.brand_name || undefined,
    category: item.category   || undefined,
  };
}

// ── Claude fallback (most comprehensive — covers all US retail) ───────────────
async function tryClaude(upc: string) {
  try {
    const { anthropic } = await import("@workspace/integrations-anthropic-ai");
    const msg = await (anthropic.messages.create as Function)({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system:
        "You are a US retail product expert. When given a UPC/EAN barcode number, identify the exact product. " +
        "Be specific: include brand, product name, variant, size, and count. " +
        "For cigarettes include brand, style (Menthol/Regular), type (King/100s), and pack type (Box/Soft). " +
        "Return ONLY a JSON object: {\"name\":\"...\",\"brand\":\"...\",\"category\":\"...\",\"description\":\"...\",\"srp\":null}. " +
        "If you truly don't know this specific UPC, return null.",
      messages: [{ role: "user", content: `UPC: ${upc}` }],
    });
    const raw     = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const cleaned = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
    if (!cleaned || cleaned === "null") return null;
    const json    = cleaned.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const p = JSON.parse(json) as { name?: string; brand?: string; category?: string; description?: string; srp?: number };
    if (!p.name?.trim()) return null;
    return { name: p.name.trim(), brand: p.brand || undefined, category: p.category || undefined, description: p.description || undefined, srp: p.srp };
  } catch {
    return null;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/:barcode", async (req, res) => {
  const upc = req.params.barcode.replace(/\D/g, "");
  if (!upc) { res.status(400).json({ error: "barcode required" }); return; }

  console.log(`[UPC] Looking up ${upc}`);

  // Run free APIs in parallel for speed
  const [off, upcdb, beauty] = await Promise.allSettled([
    tryOpenFoodFacts(upc),
    tryUPCItemDB(upc),
    tryOpenBeautyFacts(upc),
  ]);

  const hit =
    (off.status    === "fulfilled" && off.value)    ||
    (upcdb.status  === "fulfilled" && upcdb.value)  ||
    (beauty.status === "fulfilled" && beauty.value) ||
    null;

  if (hit) {
    console.log(`[UPC] ${upc} found via free API: ${hit.name}`);
    res.json({ found: true, ...hit });
    return;
  }

  // Try Open Product Data (slower, run separately)
  try {
    const opd = await tryOpenProductData(upc);
    if (opd) {
      console.log(`[UPC] ${upc} found via OpenProductData: ${opd.name}`);
      res.json({ found: true, ...opd });
      return;
    }
  } catch { /* fall through */ }

  // Claude fallback — most comprehensive, covers tobacco, all US retail
  console.log(`[UPC] ${upc} not in free DBs, trying Claude...`);
  const claude = await tryClaude(upc);
  if (claude) {
    console.log(`[UPC] ${upc} identified by Claude: ${claude.name}`);
    res.json({ found: true, ...claude });
    return;
  }

  console.log(`[UPC] ${upc} not found anywhere`);
  res.json({ found: false });
});

// Keep POST for backwards compat
router.post("/lookup", async (req, res) => {
  req.params.barcode = (req.body as { barcode?: string }).barcode ?? "";
  router.handle(req, res, () => {});
});

export default router;
