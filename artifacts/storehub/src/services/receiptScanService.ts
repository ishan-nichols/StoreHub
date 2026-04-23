/**
 * receiptScanService.ts
 *
 * Sends the receipt image to /api/vision/receipt.
 * Claude decides what to split — no splitting logic lives here.
 * Whatever Claude returns is passed directly to the review screen
 * after enriching each item with inventory-match metadata.
 */

import { API_BASE_URL, getProducts } from "./dataService";
import type { Product } from "../schemas";
import { suggestPriceForCostChange } from "./pricingService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawReceiptItem {
  name: string;
  upc?: string | null;
  quantity?: number;
  unit?: string;
  cost?: number;
  totalCost?: number;
  srp?: number | null;
  category?: string;
}

export interface ScannedDelivery {
  supplierName: string | null;
  date: string | null;
  invoiceTotal: number | null;
  items: ScannedDeliveryItem[];
  totalRawCount: number;
}

export interface ScannedDeliveryItem {
  tempId: number;
  name: string;
  upc?: string;
  quantity: number;
  unit: string;
  cost: number;
  totalCost?: number;
  srp?: number | null;
  category: string;
  selected: boolean;

  matchedProduct?: Product;
  matchType?: "upc" | "name" | null;
  matchConfidence?: "high" | "low";
  oldCost?: number;
  costChanged?: boolean;
  costDelta?: number;

  currentPrice?: number;
  suggestedPrice?: number;
  priceAction: "update_to_srp" | "update_to_suggested" | "keep" | "custom";
  customPrice?: number;

  isSingleDerived?: boolean;
  isAmbiguous?: boolean;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function scanReceipt(file: File): Promise<ScannedDelivery> {
  const { base64, mimeType } = await readFileAsBase64(file);

  const res = await fetch(`${API_BASE_URL}/api/vision/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mimeType }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Receipt scan failed");
  }

  const data = (await res.json()) as {
    supplierName: string | null;
    date: string | null;
    invoiceTotal: number | null;
    items: RawReceiptItem[];
  };

  const rawItems = data.items ?? [];

  // Enrich each item Claude returned with inventory-match metadata — no splitting
  const inventory = await getProducts();
  const items: ScannedDeliveryItem[] = rawItems.map((raw, idx) =>
    enrichItem(raw, idx, inventory),
  );

  return {
    supplierName:  data.supplierName,
    date:          data.date,
    invoiceTotal:  data.invoiceTotal ?? null,
    items,
    totalRawCount: rawItems.length,
  };
}

// ─── Image reader ─────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] ?? file.type ?? "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

function enrichItem(raw: RawReceiptItem, idx: number, inventory: Product[]): ScannedDeliveryItem {
  const upc  = (raw.upc ?? "").toString().replace(/\D/g, "") || undefined;
  const cost = safePrice(raw.cost) ?? 0;
  const srp  = raw.srp != null ? safePrice(raw.srp) : null;

  // Items Claude named "... Single" are derived single-unit entries
  const isSingleDerived = raw.name?.trim().endsWith(" Single") ?? false;

  const { match, confidence } = findMatch(raw.name ?? "", upc, inventory);
  const oldCost      = match?.costPrice ?? 0;
  const costChanged  = !!match && oldCost > 0 && Math.abs(oldCost - cost) > 0.01;
  const currentPrice = match?.price;

  let suggestedPrice: number | undefined;
  let priceAction: ScannedDeliveryItem["priceAction"] = "keep";

  if (srp && srp > 0) {
    suggestedPrice = srp;
    if (!match || Math.abs(srp - (currentPrice ?? 0)) > 0.01) {
      priceAction = "update_to_srp";
    }
  } else if (match && costChanged && currentPrice) {
    suggestedPrice = suggestPriceForCostChange(currentPrice, oldCost, cost);
    if (Math.abs(suggestedPrice - currentPrice) > 0.01) {
      priceAction = "update_to_suggested";
    }
  }

  if (match && confidence === "low") priceAction = "keep";

  return {
    tempId:   idx,
    name:     raw.name?.trim() || "Unnamed item",
    upc,
    quantity: Number(raw.quantity) || 1,
    unit:     raw.unit || "unit",
    cost,
    totalCost: raw.totalCost,
    srp,
    category: raw.category || "other",

    selected: true,

    matchedProduct:  match,
    matchType:       match
      ? upc && match.barcode?.replace(/\D/g, "") === upc ? "upc" : "name"
      : null,
    matchConfidence: confidence,
    oldCost:    match ? oldCost : undefined,
    costChanged,
    costDelta:  match ? roundTo2(cost - oldCost) : undefined,
    currentPrice,
    suggestedPrice,
    priceAction,

    isSingleDerived: isSingleDerived || undefined,
  };
}

function findMatch(
  name: string,
  upc: string | undefined,
  inventory: Product[],
): { match: Product | undefined; confidence: "high" | "low" } {
  if (upc) {
    const byUpc = inventory.find(
      (p) => p.barcode && p.barcode.replace(/\D/g, "") === upc,
    );
    if (byUpc) return { match: byUpc, confidence: "high" };
  }

  const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (!norm) return { match: undefined, confidence: "high" };

  const exact = inventory.find(
    (p) => p.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim() === norm,
  );
  if (exact) return { match: exact, confidence: "high" };

  const words = norm.split(" ").filter((w) => w.length > 3);
  if (words.length > 0) {
    const partial = inventory.find((p) => {
      const pn = p.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      return words.every((w) => pn.includes(w));
    });
    if (partial) return { match: partial, confidence: "low" };
  }

  return { match: undefined, confidence: "high" };
}

// ─── Price helpers ────────────────────────────────────────────────────────────

function safePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!isFinite(n) || n < 0 || n >= 100_000) return null;
  return roundTo2(n);
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Resolve final price (used by ReceiveDeliveryModal) ───────────────────────

export function resolveFinalPrice(item: ScannedDeliveryItem): number | null {
  switch (item.priceAction) {
    case "update_to_srp":       return item.srp ?? null;
    case "update_to_suggested": return item.suggestedPrice ?? null;
    case "custom":              return item.customPrice ?? null;
    case "keep":                return null;
  }
}
