/**
 * pricingService.ts — All price/margin/SRP/scheduled-change logic for StoreHub.
 *
 * Pure helpers (margin calc, suggestions) plus dataService-backed mutations
 * (updatePrice, applyBulk, runScheduledChanges). Every price change is appended
 * to product.priceHistory and pushed to connected POS systems via integrationService.
 */

import type {
  Product,
  PriceHistoryEntry,
  ScheduledPriceChange,
  InsertScheduledPriceChange,
} from "../schemas";
import { generateId, now } from "../utils";
import * as dataService from "./dataService";
import { pushPriceUpdate } from "./integrationService";

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function marginPct(price: number, cost: number): number {
  if (price <= 0 || cost <= 0) return 0;
  return ((price - cost) / price) * 100;
}

export function marginColor(margin: number, alertPct = 15): "green" | "yellow" | "red" {
  if (margin < 0) return "red";
  if (margin < alertPct) return "yellow";
  return "green";
}

/**
 * Round UP to the nearest $0.05 — always in the owner's favour.
 * Examples: $2.91 → $2.95  |  $2.96 → $3.00  |  $1.82 → $1.85  |  $1.86 → $1.90
 */
export function roundUpToNickel(price: number): number {
  return Math.ceil(price * 20) / 20;
}

export function priceForTargetMargin(cost: number, targetPct: number): number {
  if (cost <= 0 || targetPct >= 100) return cost;
  const raw = cost / (1 - targetPct / 100);
  return roundUpToNickel(raw);
}

/**
 * If new cost has come in, suggest a retail price that preserves the prior margin.
 */
export function suggestPriceForCostChange(currentPrice: number, oldCost: number, newCost: number): number {
  if (oldCost <= 0 || currentPrice <= 0) return roundUpToNickel(newCost * 1.25);
  const oldMargin = marginPct(currentPrice, oldCost);
  return priceForTargetMargin(newCost, oldMargin);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface PriceUpdateOpts {
  reason?: string;
  /** Skip POS push (e.g. for cost-only edits or bulk imports) */
  skipPosSync?: boolean;
}

export async function updatePrice(
  productId: string,
  newPrice: number,
  opts: PriceUpdateOpts = {},
): Promise<Product | null> {
  const product = await dataService.getProduct(productId);
  if (!product) return null;
  if (Math.abs(product.price - newPrice) < 0.005) return product;

  const entry: PriceHistoryEntry = {
    date: now(),
    field: "price",
    from: product.price,
    to: newPrice,
    reason: opts.reason ?? "Manual price change",
  };

  const updated = await dataService.updateProduct(productId, {
    price: newPrice,
    priceHistory: [...(product.priceHistory ?? []), entry],
    lastPriceChangeAt: now(),
    posSyncStatus: opts.skipPosSync ? product.posSyncStatus : "pending",
  });

  if (!opts.skipPosSync && updated) {
    void syncPriceToPos(updated);
  }
  return updated;
}

export async function updateCost(
  productId: string,
  newCost: number,
  reason = "Cost change",
): Promise<Product | null> {
  const product = await dataService.getProduct(productId);
  if (!product) return null;
  const oldCost = product.costPrice ?? 0;
  if (Math.abs(oldCost - newCost) < 0.005) return product;

  const entry: PriceHistoryEntry = {
    date: now(),
    field: "cost",
    from: oldCost,
    to: newCost,
    reason,
  };

  return dataService.updateProduct(productId, {
    costPrice: newCost,
    priceHistory: [...(product.priceHistory ?? []), entry],
    lastCostChangeAt: now(),
  });
}

async function syncPriceToPos(product: Product): Promise<void> {
  try {
    const result = await pushPriceUpdate(product.id, product.price, product.sku, product.barcode);
    await dataService.updateProduct(product.id, {
      posSyncStatus: result.success ? "synced" : (result.notConnected ? "not_connected" : "failed"),
      posSyncError: result.success ? undefined : result.error ?? "Sync failed",
    });
  } catch (err) {
    await dataService.updateProduct(product.id, {
      posSyncStatus: "failed",
      posSyncError: err instanceof Error ? err.message : "Sync failed",
    });
  }
}

export async function retryPosSync(productId: string): Promise<Product | null> {
  const product = await dataService.getProduct(productId);
  if (!product) return null;
  await syncPriceToPos(product);
  return dataService.getProduct(productId);
}

// ─── Bulk updates ────────────────────────────────────────────────────────────

export type BulkPriceMode =
  | { type: "raisePct"; value: number }
  | { type: "raiseAmount"; value: number }
  | { type: "matchSrp" }
  | { type: "targetMargin"; value: number };

export interface BulkPreviewItem {
  productId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  costPrice: number;
  newMargin: number;
  changed: boolean;
  skipped?: string;
}

export function previewBulkUpdate(products: Product[], mode: BulkPriceMode): BulkPreviewItem[] {
  return products.map((p) => {
    const cost = p.costPrice ?? 0;
    let newPrice = p.price;
    let skipped: string | undefined;
    switch (mode.type) {
      case "raisePct":
        newPrice = roundUpToNickel(p.price * (1 + mode.value / 100));
        break;
      case "raiseAmount":
        newPrice = roundUpToNickel(p.price + mode.value);
        break;
      case "matchSrp":
        if (!p.srp || p.srp <= 0) { skipped = "no SRP on file"; break; }
        newPrice = p.srp;
        break;
      case "targetMargin":
        if (cost <= 0) { skipped = "no cost on file"; break; }
        newPrice = priceForTargetMargin(cost, mode.value);
        break;
    }
    return {
      productId: p.id,
      name: p.name,
      oldPrice: p.price,
      newPrice,
      costPrice: cost,
      newMargin: marginPct(newPrice, cost),
      changed: !skipped && Math.abs(newPrice - p.price) > 0.005,
      skipped,
    };
  });
}

export async function applyBulkUpdate(items: BulkPreviewItem[], reason = "Bulk price update"): Promise<number> {
  let count = 0;
  for (const it of items) {
    if (!it.changed) continue;
    const r = await updatePrice(it.productId, it.newPrice, { reason });
    if (r) count++;
  }
  return count;
}

// ─── Scheduled price changes ─────────────────────────────────────────────────

export async function listScheduledChanges(): Promise<ScheduledPriceChange[]> {
  return dataService.getScheduledPriceChanges();
}

export async function createScheduledChange(input: InsertScheduledPriceChange): Promise<ScheduledPriceChange> {
  return dataService.createScheduledPriceChange(input);
}

export async function cancelScheduledChange(id: string): Promise<void> {
  await dataService.updateScheduledPriceChange(id, { status: "cancelled" });
}

/**
 * Process scheduled price changes — should be called on app load and periodically.
 * Activates pending changes whose startsAt has passed; reverts active changes
 * whose endsAt has passed.
 */
let processingLock: Promise<{ activated: number; reverted: number }> | null = null;

export async function processScheduledChanges(): Promise<{ activated: number; reverted: number }> {
  // In-memory mutex: coalesce overlapping ticks (startup + interval) into one run.
  if (processingLock) return processingLock;
  processingLock = (async () => {
    const all = await dataService.getScheduledPriceChanges();
    const nowMs = Date.now();
    let activated = 0;
    let reverted = 0;
    for (const sc of all) {
      if (sc.status === "pending" && new Date(sc.startsAt).getTime() <= nowMs) {
        // Transition status FIRST so any later run skips this row even if updatePrice throws.
        await dataService.updateScheduledPriceChange(sc.id, { status: "active" });
        await updatePrice(sc.productId, sc.newPrice, { reason: `Scheduled sale started` });
        activated++;
      } else if (sc.status === "active" && sc.endsAt && new Date(sc.endsAt).getTime() <= nowMs) {
        await dataService.updateScheduledPriceChange(sc.id, { status: "reverted" });
        await updatePrice(sc.productId, sc.originalPrice, { reason: `Scheduled sale ended` });
        reverted++;
      }
    }
    return { activated, reverted };
  })();
  try {
    return await processingLock;
  } finally {
    processingLock = null;
  }
}

// ─── Low-margin helpers ──────────────────────────────────────────────────────

export interface MarginAlert {
  product: Product;
  margin: number;
  threshold: number;
}

export function findMarginAlerts(products: Product[], defaultThreshold = 15): MarginAlert[] {
  const alerts: MarginAlert[] = [];
  for (const p of products) {
    const cost = p.costPrice ?? 0;
    if (cost <= 0) continue;
    const threshold = p.marginAlertPct ?? defaultThreshold;
    const m = marginPct(p.price, cost);
    if (m < threshold) alerts.push({ product: p, margin: m, threshold });
  }
  return alerts.sort((a, b) => a.margin - b.margin);
}

// `void` import dependency to keep type checker happy if generateId/Product unused above
void generateId;
export type { Product, PriceHistoryEntry, ScheduledPriceChange };
