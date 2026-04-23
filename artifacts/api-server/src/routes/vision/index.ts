/**
 * POST /api/vision/receipt
 *
 * Two-call approach for maximum accuracy:
 *   Call 1 — pure enumeration: Claude's only job is to read and number every product name.
 *   Call 2 — price extraction: given the committed name list, Claude fills in prices.
 *
 * Separating enumeration from pricing prevents Claude from skipping lines while
 * it is also trying to read prices, quantities, and decide on multipacks.
 */

import { Router } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

// ─── POST /api/vision/barcode ─────────────────────────────────────────────────
// Sends a single camera frame to Claude and returns the UPC number it finds.
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ─── Prompts ──────────────────────────────────────────────────────────────────

const ENUM_PROMPT =
  "You are reading a supplier invoice image. Your ONLY job right now is to list every product.\n\n" +
  "Go from top to bottom. For every row that has a product name and a price, write one line:\n" +
  "#N PRODUCT NAME AS PRINTED\n\n" +
  "Rules:\n" +
  "- Number every product starting from #1. Do not skip any numbers.\n" +
  "- Each printed row is its own entry, even if it looks identical to the row above or below.\n" +
  "- Two rows that differ by even one word, size, colour, number, or flavour are two separate entries.\n" +
  "- SKIP only: totals, subtotals, tax, fee, deposit, due, balance, change, cash, credit,\n" +
  "  page headers, 'thank you', 'bill to', 'ship to', 'sold to', date lines, phone/address lines,\n" +
  "  and any row that starts with a dollar amount followed by OFF INVOICE / ALLOWANCE / REBATE / PROMO.\n" +
  "- Every other row with a name and a price: include it.\n\n" +
  "Write ONLY the numbered list. No prices. No explanation. No JSON.";

function buildPricePrompt(names: string[]): string {
  const list = names.map((n, i) => `#${i + 1} ${n}`).join("\n");
  return (
    "You are reading a supplier invoice. Here is the COMPLETE committed product list — exactly " +
    names.length + " items:\n\n" +
    list +
    "\n\nFor EACH numbered product find its row on the invoice and extract EXACTLY these fields:\n\n" +

    "1. unit — look ONLY at the dedicated PACK column (or PACK SIZE column) for this product's row:\n" +
    "   'PACK=N' → the PACK column contains a whole number N that is greater than 1 (e.g. PACK column shows '10' → return 'PACK=10'). This is the most common on wholesale invoices.\n" +
    "   'CTN'    → there is no PACK column BUT the unit column explicitly says CTN or CARTON\n" +
    "   'DISP=N' → there is no PACK column BUT the description explicitly says DISPLAY OF N\n" +
    "   'EACH'   → PACK column is 1, or there is no PACK column and no CTN/DISPLAY indicator\n" +
    "   CRITICAL RULES for unit:\n" +
    "   - Do NOT read the SIZE column at all. SIZE is the product size (oz, ml, count) — ignore it entirely.\n" +
    "   - Do NOT use any number from the product name (like '16 OZ', '2CT', '6CT') as a pack size.\n" +
    "   - ONLY the PACK column value or explicit CTN/DISPLAY wording determines the unit.\n\n" +

    "2. quantity — the number in the QTY/ORDERED column (how many units/cartons were ordered)\n\n" +

    "3. unitCost — the per-unit cost EXACTLY as printed. DO NOT divide or adjust it.\n" +
    "   CRITICAL: copy decimal points exactly. If the invoice shows 221.00, return 221.00 — never 22.1.\n" +
    "   VERIFY: unitCost × quantity should approximately equal totalCost. Re-read the row if not.\n\n" +

    "4. totalCost — the line extension/total EXACTLY as printed.\n\n" +

    "OUTPUT EXACTLY " + names.length + " elements — one per product, no extras, no splitting.\n" +
    "Return a raw JSON array only — no markdown, no explanation, no text before or after.\n" +
    "Each element: { \"name\": \"EXACT NAME FROM LIST\", \"unit\": \"PACK=10|CTN|DISP=5|EACH\", \"quantity\": N, \"unitCost\": N, \"totalCost\": N }"
  );
}

// ─── Server-side multipack splitting ──────────────────────────────────────────
// Claude now outputs ONE entry per product with a 'unit' field.
// We expand cartons/displays into their individual-unit counterparts here in
// TypeScript so splitting is deterministic and never double-counts.

function getPackSize(unit: string | undefined, name: string): number {
  const u = (unit ?? "").trim().toUpperCase();
  if (u === "CTN") return 10;        // cigarette carton = 10 packs
  if (u === "ROLL5") return 5;
  if (u === "ROLL10") return 10;
  const dispMatch = u.match(/^DISP=(\d+)$/);
  if (dispMatch) return parseInt(dispMatch[1], 10);
  // PACK=N — wholesale invoices with a dedicated PACK column (e.g. Petrey)
  const packMatch = u.match(/^PACK=(\d+)$/);
  if (packMatch) {
    const n = parseInt(packMatch[1], 10);
    return n > 1 ? n : 1;
  }
  // Belt-and-suspenders: also check the name itself
  const nameDisp = name.match(/DISPLAY\s+OF\s+(\d+)/i);
  if (nameDisp) return parseInt(nameDisp[1], 10);
  const nameRoll = name.match(/(\d+)\s*CAN\s+ROLL/i);
  if (nameRoll) return parseInt(nameRoll[1], 10);
  return 1;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/receipt", async (req, res) => {
  const { image, mimeType = "image/jpeg" } = req.body as {
    image: string;
    mimeType?: string;
  };

  if (!image) {
    res.status(400).json({ error: "image is required" });
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type AllowedType = typeof allowedTypes[number];
  const mediaType: AllowedType = allowedTypes.includes(mimeType as AllowedType)
    ? (mimeType as AllowedType)
    : "image/jpeg";

  const imageBlock = {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data: image },
  };

  const METADATA_PROMPT =
    "You are reading a supplier invoice image very carefully. Extract EXACTLY:\n" +
    "1. supplierName — the company/vendor that ISSUED this invoice (printed at the top, not the buyer/ship-to address)\n" +
    "2. date — the invoice or delivery date. Look for labels like DATE, INVOICE DATE, SHIP DATE, DELIVERY DATE.\n" +
    "   Common formats on invoices: MM/DD/YY, MM-DD-YY, MM/DD/YYYY. Convert to YYYY-MM-DD.\n" +
    "   CRITICAL: 2-digit years mean the 2000s — '25' = 2025, '24' = 2024, '23' = 2023. NEVER return a year before 2020.\n" +
    "3. invoiceTotal — look at the very BOTTOM of the invoice for TOTAL, AMOUNT DUE, GRAND TOTAL, NET TOTAL, or TOTAL DUE.\n" +
    "   Copy that final number exactly. Do NOT sum individual lines yourself — find the printed grand total.\n\n" +
    'Return ONLY this JSON (no markdown, no explanation):\n' +
    '{"supplierName": "<name or null>", "date": "<YYYY-MM-DD or null>", "invoiceTotal": <number or null>}';

  try {
    // ── CALL 1 + METADATA: run in parallel ────────────────────────────────────
    console.log("[Claude] Call 1 — enumerating products + extracting metadata...");
    const [enumMsg, metaMsg] = await Promise.all([
      anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: [imageBlock, { type: "text", text: ENUM_PROMPT }] }],
      }),
      anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{ role: "user", content: [imageBlock, { type: "text", text: METADATA_PROMPT }] }],
      }),
    ]);

    const enumRaw = enumMsg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    console.log("[Claude] Call 1 raw:\n", enumRaw);

    // Parse #N NAME lines
    const productNames: string[] = [];
    for (const line of enumRaw.split("\n")) {
      const m = line.match(/^#\d+\s+(.+)/);
      if (m) productNames.push(m[1].trim());
    }
    console.log(`[Claude] Enumerated ${productNames.length} products:`, productNames.join(" | "));

    // ── Parse metadata from parallel call ────────────────────────────────────
    let supplierName: string | null = null;
    let invoiceDate: string | null = null;
    let invoiceTotal: number | null = null;
    try {
      const metaRaw = metaMsg.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text).join("").trim();
      const metaJson = metaRaw.match(/\{[\s\S]*\}/)?.[0];
      if (metaJson) {
        const meta = JSON.parse(metaJson) as { supplierName?: string | null; date?: string | null; invoiceTotal?: number | null };
        supplierName = (meta.supplierName && meta.supplierName !== "null") ? meta.supplierName : null;
        invoiceTotal = (meta.invoiceTotal != null) ? Number(meta.invoiceTotal) || null : null;

        // Validate date — reject anything before 2020 (misread 2-digit year)
        const rawDate = (meta.date && meta.date !== "null") ? meta.date : null;
        if (rawDate) {
          const year = parseInt(rawDate.split("-")[0], 10);
          invoiceDate = (year >= 2020 && year <= 2035) ? rawDate : null;
          if (!invoiceDate) console.log("[Claude] Rejected implausible date:", rawDate, "(year", year, ")");
        }
      }
      console.log("[Claude] Metadata:", { supplierName, invoiceDate, invoiceTotal });
    } catch (e) {
      console.error("[Claude] Metadata parse failed:", (e as Error).message);
    }

    if (productNames.length === 0) {
      res.json({ supplierName, date: invoiceDate, invoiceTotal, items: [] });
      return;
    }

    // ── Pre-filter: drop allowance/fee/header rows before building Call 2 prompt ─
    const SKIP_ENUM = /^(\$[\d.]+.*\b(off\s*invoice|allowance|rebate|promo)\b|total|subtotal|tax|fee|deposit|due|balance|change|cash|credit|thank\s*you|bill\s*to|ship\s*to|sold\s*to)/i;
    const pricingNames = productNames.filter((n) => {
      if (SKIP_ENUM.test(n)) {
        console.log("[Claude] Pre-filter dropped from Call 2:", n);
        return false;
      }
      return true;
    });
    console.log("[Claude] Sending", pricingNames.length, "clean names to Call 2 (was", productNames.length, ")");

    // ── CALL 2: extract prices for the committed list ─────────────────────────
    console.log("[Claude] Call 2 — extracting prices for", pricingNames.length, "products...");
    const priceMsg = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            { type: "text", text: buildPricePrompt(pricingNames) },
          ],
        },
      ],
    });

    const priceRaw = priceMsg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    console.log("[Claude] Call 2 raw (first 1000):", priceRaw.slice(0, 1000));

    // ── Parse JSON from call 2 ────────────────────────────────────────────────
    type RawItem = { name?: string; unit?: string; quantity?: number; unitCost?: number; totalCost?: number };
    let rawItems: RawItem[] = [];
    try {
      const fenceMatch = priceRaw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate  = fenceMatch ? fenceMatch[1].trim() : priceRaw;
      const start = candidate.indexOf("[");
      const end   = candidate.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("No JSON array found");
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      rawItems = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);
    } catch (e) {
      console.error("[Claude] JSON parse failed:", (e as Error).message);
    }
    console.log("[Claude] JSON item count from call 2:", rawItems.length);

    // ── Guard: drop anything call 2 invented that wasn't in the committed list ─
    // Claude now outputs ONE entry per product — exact match only (no Singles from Claude).
    const committedKeys = new Set(pricingNames.map((n) => normKey(n)));
    rawItems = rawItems.filter((it) => {
      const name = (it.name ?? "").trim();
      if (!name) return false;
      if (committedKeys.has(normKey(name))) return true;
      console.log("[Claude] Dropping hallucinated item (not in committed list):", name);
      return false;
    });
    console.log("[Claude] After guard:", rawItems.length, "items");

    // ── Rescue: any name from call 1 that call 2 forgot ──────────────────────
    const jsonNameKeys = new Set(rawItems.map((it) => normKey(it.name ?? "")));
    for (const pName of pricingNames) {
      if (!jsonNameKeys.has(normKey(pName))) {
        console.log("[Claude] Rescued (missing from call 2 JSON):", pName);
        rawItems.push({ name: pName, quantity: 1, unitCost: 0, totalCost: 0, srp: null });
      }
    }

    // ── Filter & deduplicate ──────────────────────────────────────────────────
    const HEADER_PREFIX   = /^(invoice|date|phone|tel|fax|address|page|thank\s*you|bill\s*to|ship\s*to|sold\s*to)\b/i;
    const ADJUSTMENT_LINE = /^\$[\d.]+.*\b(off\s*invoice|allowance|rebate|promo)\b/i;
    const nameToIndex     = new Map<string, number>();
    const filtered: RawItem[] = [];

    for (const it of rawItems) {
      const name = (it.name ?? "").trim();
      if (!name) continue;
      if (HEADER_PREFIX.test(name)) continue;
      if (ADJUSTMENT_LINE.test(name)) continue;
      const key = normKey(name);
      if (nameToIndex.has(key)) {
        filtered[nameToIndex.get(key)!] = it;
      } else {
        nameToIndex.set(key, filtered.length);
        filtered.push(it);
      }
    }

    console.log("[Claude] Final items:", filtered.length, filtered.map((it) => it.name).join(" | "));

    // ── Build items with server-side multipack splitting ──────────────────────
    // Claude outputs ONE entry per product with a 'unit' field (CTN/ROLL5/DISP=N/EACH).
    // We expand multipacks here in TypeScript so splitting is deterministic.
    const DOSE_DISQUALIFY = /\b\d+\s*(mg|mcg|ml|fl\.?\s*oz|\boz\b|g\b|gr\b|lb|lbs|mm|cm)\b/i;

    const items = filtered.flatMap((it) => {
      const rawName   = (it.name ?? "").trim();
      const name      = toTitleCase(rawName);
      const rawQty    = Number(it.quantity) || 1;
      const quantity  = Math.max(1, Math.round(rawQty));
      const totalCost = round2(Number(it.totalCost) || 0);
      const unitCostRaw = round2(Number(it.unitCost) || 0);

      // Prefer totalCost÷quantity for per-unit cost — more resilient to Claude decimal misreads.
      // If both are available, sanity-check them. If they differ by ~10×, Claude misread a decimal.
      let cost: number;
      if (totalCost > 0 && quantity > 0) {
        cost = round2(totalCost / quantity);
        // Belt-and-suspenders decimal check: if unitCost × qty ≈ totalCost × 10, unitCost is 10× too small
        // (This covers cases where totalCost is also misread the same way — use whichever is larger)
        if (unitCostRaw > 0) {
          const computed = round2(unitCostRaw * quantity);
          const ratio = totalCost / computed;
          if (ratio > 8 && ratio < 12) {
            // totalCost is 10× bigger than unitCost×qty → unitCost was misread; trust totalCost
            cost = round2(totalCost / quantity);
          } else if (ratio > 0.08 && ratio < 0.12) {
            // totalCost is 10× smaller → totalCost was misread; trust unitCost
            cost = unitCostRaw;
          }
        }
      } else {
        cost = unitCostRaw;
      }

      // SRP is not read from the invoice — the frontend calculates it from cost × markup %.
      const srp = null;

      const packSize = getPackSize(it.unit, rawName);
      console.log(`[Split] ${rawName} | unit=${it.unit ?? "?"} | packSize=${packSize}`);

      const base = { name, upc: null, quantity, unit: "unit", cost, totalCost, srp, category: guessCategory(name) };

      // Split into base + Single, but not for products with dose/size units (mg, ml, oz, etc.)
      if (packSize > 1 && !DOSE_DISQUALIFY.test(rawName)) {
        const singleCost = round2(cost / packSize);
        console.log(`[Split] → creating Single: qty=${quantity * packSize}, cost=${singleCost}`);
        return [
          base,
          { ...base, name: name + " Single", quantity: quantity * packSize, cost: singleCost },
        ];
      }

      return [base];
    });

    res.json({ supplierName, date: invoiceDate, invoiceTotal, items });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Claude] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/vision/barcode ─────────────────────────────────────────────────

const BARCODE_PROMPT =
  "Look at this image carefully. Find the barcode or UPC number printed on the product packaging. " +
  "Return only the UPC number as plain digits with no spaces or dashes, nothing else. " +
  "If you cannot find a UPC number return null.";

router.post("/barcode", async (req, res) => {
  const { image, mimeType = "image/jpeg" } = req.body as { image: string; mimeType?: string };
  if (!image) { res.status(400).json({ error: "image required" }); return; }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type AllowedType = typeof allowedTypes[number];
  const mediaType: AllowedType = allowedTypes.includes(mimeType as AllowedType)
    ? (mimeType as AllowedType) : "image/jpeg";

  try {
    const msg = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 64,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text",  text: BARCODE_PROMPT },
        ],
      }],
    });

    const raw = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text).join("").trim();

    const digits = raw.replace(/\D/g, "");
    const upc = digits.length >= 8 ? digits : null;
    console.log("[Claude Barcode] raw:", raw, "→ upc:", upc);
    res.json({ upc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Claude Barcode] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/vision/scan ────────────────────────────────────────────────────
// One call: reads the barcode AND identifies the product from the same image.
// Returns { barcode, name, brand, category, description } or { found: false }.
// ─────────────────────────────────────────────────────────────────────────────

// When the barcode is already known, Claude only needs to identify the product.
// When it isn't, Claude must also locate the barcode in the image.
const VALID_UPC_LENGTHS = new Set([8, 12, 13]);

function isValidUPC(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return VALID_UPC_LENGTHS.has(digits.length);
}

function buildScanPrompt(knownBarcode?: string): string {
  const srpRule =
    "The srp field is the typical US suggested retail price in USD as a decimal number, or null if unknown.";

  if (knownBarcode) {
    return (
      `This product has barcode ${knownBarcode}. ` +
      "Look at the image and identify the product by reading what is VISUALLY PRINTED on the packaging — " +
      "specifically: (1) the LARGEST text on the package is the brand name — read it exactly, " +
      "(2) the product line/variant text beneath it — read it exactly as printed, " +
      "(3) any size, count, or strength information visible. " +
      "Do not confuse brands — if you see 'NEWPORT' on the package, the brand is Newport, not Winston or Marlboro. " +
      "Use your product knowledge only for category, description, and srp — not for brand or name. " +
      `${srpRule} ` +
      `Return ONLY a JSON object: { "barcode": "${knownBarcode}", "name": "<brand> <full product line as printed>", "brand": "<brand as printed>", "category": "<category>", "description": "<brief description>", "srp": <number or null> }. No extra text.`
    );
  }

  return (
    "Look at this product image. " +
    "Step 1: Find the barcode/UPC number — read every digit exactly as printed. Only report it if you can read all digits with certainty; otherwise null. " +
    "Step 2: Read the LARGEST text on the package — that is the brand name. Read it exactly as printed. " +
    "Step 3: Read the product line/variant text — read it exactly as printed. " +
    "Step 4: Note any size, count, strength, or flavor text visible. " +
    "Do not confuse similar brands — read what is actually on the package. " +
    `${srpRule} ` +
    "Return ONLY a JSON object: { \"barcode\": \"<8/12/13 digits or null>\", \"name\": \"<brand> <full product line>\", \"brand\": \"<brand as printed>\", \"category\": \"<category>\", \"description\": \"<brief description>\", \"srp\": <number or null> }. " +
    "If you cannot read the barcode with certainty, set barcode to null and return null at the top level."
  );
}

router.post("/scan", async (req, res) => {
  const { image, mimeType = "image/jpeg", barcode: knownBarcode } =
    req.body as { image: string; mimeType?: string; barcode?: string };
  if (!image) { res.status(400).json({ error: "image required" }); return; }

  const prompt = buildScanPrompt(knownBarcode?.replace(/\D/g, "") || undefined);

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  type AllowedType = typeof allowedTypes[number];
  const mediaType: AllowedType = allowedTypes.includes(mimeType as AllowedType)
    ? (mimeType as AllowedType) : "image/jpeg";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "You are a product scanner API. Respond with ONLY a JSON object or the single word null. No explanation, no markdown fences.",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text",  text: prompt },
        ],
      }],
    });

    const raw = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text).join("").trim();

    console.log(`[Vision Scan] raw: ${raw.slice(0, 100)}`);

    const cleaned = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
    if (!cleaned || cleaned === "null") { res.json({ found: false }); return; }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.json({ found: false }); return; }

    const p = JSON.parse(jsonMatch[0]) as {
      barcode?: string; name?: string; brand?: string; category?: string;
      description?: string; srp?: number | string | null;
    };

    // Use known barcode as the authoritative source — never trust Claude's barcode
    // when we already have it from html5-qrcode.  For pure-vision fallback, validate
    // that Claude returned a real UPC length (8, 12, or 13 digits).
    const cleanKnown = knownBarcode?.replace(/\D/g, "") || "";
    const claudeBarcode = (p.barcode ?? "").replace(/\D/g, "");
    const barcode = cleanKnown || claudeBarcode;

    if (!barcode || !isValidUPC(barcode) || !p.name?.trim()) {
      res.json({ found: false });
      return;
    }

    const srpNum = p.srp != null ? parseFloat(String(p.srp)) : NaN;

    res.json({
      found: true,
      barcode,
      name: p.name.trim(),
      brand: p.brand?.trim() || undefined,
      category: p.category?.trim() || undefined,
      description: p.description?.trim() || undefined,
      srp: !isNaN(srpNum) && srpNum > 0 ? srpNum : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Vision Scan] Error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s*\$[\d.]+\s*/g, " ")
    .trim();
}

const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/milk|cheese|butter|cream|dairy|yogur/i,                                     "dairy"],
  [/bread|bun|roll|loaf|cake|muffin|donut|pastry|bakery/i,                      "bakery"],
  [/chicken|beef|pork|lamb|turkey|fish|salmon|shrimp|meat|sausage|bacon|ham/i,  "meat"],
  [/apple|banana|orange|lettuce|tomato|potato|carrot|onion|produce|veg|fruit/i, "produce"],
  [/beer|wine|spirit|whiskey|whisky|vodka|rum|gin|lager|ale|cider|liquor/i,     "alcohol"],
  [/cigarette|marlboro|camel|newport|winston|tobacco|cigar|vape|nicotine/i,     "tobacco"],
  [/coke|pepsi|sprite|juice|water|soda|energy|monster|redbull|gatorade|drink/i, "beverages"],
  [/chips|crisp|snack|candy|chocolate|cookie|cracker|popcorn|nuts/i,            "snacks"],
  [/frozen|ice.?cream|pizza|freezer/i,                                          "frozen"],
  [/shampoo|soap|detergent|cleaner|bleach|tissue|paper|cleaning/i,              "cleaning"],
  [/medicine|vitamin|supplement|aspirin|ibuprofen|health/i,                     "health"],
  [/battery|bulb|candle|household/i,                                            "household"],
];

function guessCategory(name: string): string {
  for (const [re, cat] of CATEGORY_MAP) {
    if (re.test(name)) return cat;
  }
  return "other";
}
