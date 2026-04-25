/**
 * deadStockService.ts — Dead Stock Detection
 *
 * Pure frontend analysis — no Claude API needed for core detection.
 * Uses /api/tips/chat for "Ask Claude" streaming advice per item.
 */

import type { Product, Sale } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeadStockItem {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  costPrice: number;
  price: number;
  cashTiedUp: number;        // quantity * costPrice
  daysSinceLastSale: number;
  status: "slow" | "dead";   // slow = 30-59 days, dead = 60+ days
  lastSoldDate: string | null;
  suggestedAction: "markdown" | "bundle" | "return" | "stop_reorder";
  suggestedMarkdownPct?: number;
}

export interface DeadStockSummary {
  items: DeadStockItem[];
  totalCashTiedUp: number;
  deadCount: number;
  slowCount: number;
  recoveredCash: number;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const RECOVERED_KEY = "storehub_deadstock_recovered";

interface RecoveredEntry {
  productId: string;
  cashRecovered: number;
  resolvedAt: string;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Analyze products + sales to find slow/dead stock.
 * slow = no sale in 30-59 days, dead = 60+ days.
 */
export function analyzeDeadStock(
  products: Product[],
  sales: Sale[],
): DeadStockSummary {
  const now = Date.now();

  // Build last-sale-date map: productId -> latest sale timestamp
  const lastSaleMs: Record<string, number> = {};

  for (const sale of sales) {
    for (const item of sale.items as Array<{ productId: string; quantity: number }>) {
      const ts = new Date(sale.createdAt).getTime();
      if (!lastSaleMs[item.productId] || ts > lastSaleMs[item.productId]) {
        lastSaleMs[item.productId] = ts;
      }
    }
  }

  const items: DeadStockItem[] = [];

  for (const product of products) {
    // Skip products with no stock or negative cost
    if (product.quantity <= 0) continue;

    const lastTs = lastSaleMs[product.id];
    const daysSince = lastTs
      ? Math.floor((now - lastTs) / (24 * 60 * 60 * 1000))
      : 999; // never sold

    // Only flag if slow (30-59d) or dead (60+d)
    if (daysSince < 30) continue;

    const status: "slow" | "dead" = daysSince >= 60 ? "dead" : "slow";
    const costPrice = product.costPrice ?? 0;
    const cashTiedUp = product.quantity * costPrice;

    const suggestedAction = determineSuggestedAction(product, cashTiedUp);
    const suggestedMarkdownPct =
      suggestedAction === "markdown" ? suggestMarkdownPct(daysSince, cashTiedUp) : undefined;

    items.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      quantity: product.quantity,
      costPrice,
      price: product.price,
      cashTiedUp,
      daysSinceLastSale: daysSince === 999 ? -1 : daysSince, // -1 = never sold
      status,
      lastSoldDate: lastTs ? new Date(lastTs).toISOString() : null,
      suggestedAction,
      suggestedMarkdownPct,
    });
  }

  // Sort by cash tied up descending
  items.sort((a, b) => b.cashTiedUp - a.cashTiedUp);

  const totalCashTiedUp = items.reduce((sum, i) => sum + i.cashTiedUp, 0);
  const deadCount = items.filter((i) => i.status === "dead").length;
  const slowCount = items.filter((i) => i.status === "slow").length;
  const recoveredCash = getRecoveredCash();

  return { items, totalCashTiedUp, deadCount, slowCount, recoveredCash };
}

function determineSuggestedAction(
  product: Product,
  cashTiedUp: number,
): "markdown" | "bundle" | "return" | "stop_reorder" {
  const costPrice = product.costPrice ?? 0;

  // High cash tied up + meaningful cost — try markdowns to liquidate
  if (costPrice > 0 && product.quantity > 10 && cashTiedUp > 100) {
    return "markdown";
  }

  // Small perishable/consumable categories — suggest bundling
  const bundlableCategories = [
    "snacks", "drinks", "beverages", "food", "bakery", "candy",
    "stationery", "accessories", "gifts",
  ];
  const catLower = product.category.toLowerCase();
  if (bundlableCategories.some((c) => catLower.includes(c))) {
    return "bundle";
  }

  // Has a supplier — can potentially return
  if (product.supplierId) {
    return "return";
  }

  // Default: stop reordering
  return "stop_reorder";
}

function suggestMarkdownPct(daysSince: number, cashTiedUp: number): number {
  // More aggressive markdown the longer it sits and the more cash is tied up
  if (daysSince >= 90 || cashTiedUp > 500) return 40;
  if (daysSince >= 60 || cashTiedUp > 200) return 30;
  return 20;
}

// ─── Recovered cash tracking ──────────────────────────────────────────────────

/** Record that a dead-stock action recovered some cash. */
export function markActionTaken(productId: string, cashRecovered: number): void {
  try {
    const raw = localStorage.getItem(RECOVERED_KEY);
    const entries: RecoveredEntry[] = raw ? (JSON.parse(raw) as RecoveredEntry[]) : [];
    entries.push({ productId, cashRecovered, resolvedAt: new Date().toISOString() });
    localStorage.setItem(RECOVERED_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable — silently skip
  }
}

/** Sum of all recovered cash logged via markActionTaken. */
export function getRecoveredCash(): number {
  try {
    const raw = localStorage.getItem(RECOVERED_KEY);
    if (!raw) return 0;
    const entries = JSON.parse(raw) as RecoveredEntry[];
    return entries.reduce((sum, e) => sum + e.cashRecovered, 0);
  } catch {
    return 0;
  }
}

// ─── Claude streaming advice ──────────────────────────────────────────────────

/**
 * Ask Claude for advice on a specific dead-stock item.
 * Reuses the /api/tips/chat streaming endpoint.
 */
export async function generateClaudeAction(
  item: DeadStockItem,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  // Shape the dead-stock item as a "tip" so the existing chat endpoint works
  const tip = {
    title: `Dead Stock: ${item.productName}`,
    explanation: `${item.productName} (${item.category}) has ${item.quantity} units in stock with $${item.cashTiedUp.toFixed(2)} cash tied up. It hasn't sold in ${item.daysSinceLastSale < 0 ? "its entire history" : `${item.daysSinceLastSale} days`}. Status: ${item.status}.`,
    action: `Suggested action: ${item.suggestedAction}${item.suggestedMarkdownPct ? ` at ${item.suggestedMarkdownPct}% off` : ""}`,
    category: "inventory" as const,
  };

  const question = `What is the best way to recover cash from this dead stock item? Give me 2-3 specific, actionable steps I can take this week. Consider my cost price ($${item.costPrice.toFixed(2)}), selling price ($${item.price.toFixed(2)}), and that I have ${item.quantity} units.`;

  const storeContext = {
    item: {
      name: item.productName,
      category: item.category,
      quantity: item.quantity,
      costPrice: item.costPrice,
      sellingPrice: item.price,
      cashTiedUp: item.cashTiedUp,
      daysSinceLastSale: item.daysSinceLastSale < 0 ? "never sold" : item.daysSinceLastSale,
      status: item.status,
      suggestedAction: item.suggestedAction,
    },
  };

  const res = await fetch("/api/tips/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tip, question, storeData: storeContext }),
    credentials: "include",
  });

  if (!res.ok || !res.body) {
    onChunk("Sorry, I couldn't connect to Claude right now. Please try again.");
    onDone();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; error?: string };
        if (data.content) onChunk(data.content);
        if (data.done) {
          onDone();
          return;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  onDone();
}
