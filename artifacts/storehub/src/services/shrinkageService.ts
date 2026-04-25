/**
 * shrinkageService.ts — Inventory Shrinkage Detection
 *
 * Tracks received inventory, reconciles against sales, and surfaces
 * discrepancies that may indicate theft, breakage, or receiving errors.
 */

import type { Product, Sale } from "../schemas";
import { generateId } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShrinkageReason =
  | "theft"
  | "breakage"
  | "receiving_error"
  | "counting_error";

export interface ShrinkageRecord {
  id: string;
  productId: string;
  productName: string;
  category: string;
  expectedQty: number;      // initialStock + received - sold
  actualQty: number;        // current stock at detection time
  discrepancy: number;      // expected - actual (positive = missing units)
  costPerUnit: number;
  totalCostImpact: number;  // discrepancy × costPerUnit
  detectedAt: string;
  resolvedAs?: ShrinkageReason;
  resolvedAt?: string;
  notes?: string;
}

export interface ReceivedLogEntry {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  costPerUnit: number;
  loggedAt: string;
}

export interface ShrinkageSummary {
  records: ShrinkageRecord[];
  totalUnresolved: number;
  totalCostImpact: number;
  resolvedCostImpact: number;
  byCategory: Record<string, number>;
  byReason: Partial<Record<ShrinkageReason, number>>;
  lastRunAt: string | null;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const RECORDS_KEY = "storehub_shrinkage_records";
const RECEIVED_LOG_KEY = "storehub_received_log";
const LAST_RUN_KEY = "storehub_shrinkage_last_run";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRecords(): ShrinkageRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? (JSON.parse(raw) as ShrinkageRecord[]) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: ShrinkageRecord[]): void {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function getReceivedLog(): ReceivedLogEntry[] {
  try {
    const raw = localStorage.getItem(RECEIVED_LOG_KEY);
    return raw ? (JSON.parse(raw) as ReceivedLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveReceivedLog(log: ReceivedLogEntry[]): void {
  localStorage.setItem(RECEIVED_LOG_KEY, JSON.stringify(log));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a received inventory delivery for shrinkage tracking.
 */
export function logReceived(
  productId: string,
  productName: string,
  qty: number,
  costPerUnit: number,
): void {
  const log = getReceivedLog();
  const entry: ReceivedLogEntry = {
    id: generateId(),
    productId,
    productName,
    qty,
    costPerUnit,
    loggedAt: new Date().toISOString(),
  };
  log.push(entry);
  saveReceivedLog(log);
}

/**
 * Run reconciliation: compare expected vs actual stock for all products.
 * Creates ShrinkageRecord for any product with >0.5 unit discrepancy
 * AND >2% of expected, if not already recorded in the last 24 hours.
 */
export function runReconciliation(products: Product[], sales: Sale[]): ShrinkageRecord[] {
  const receivedLog = getReceivedLog();
  const existingRecords = getRecords();
  const newRecords: ShrinkageRecord[] = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Build product sale quantities
  const soldByProduct: Record<string, number> = {};
  for (const sale of sales) {
    for (const item of sale.items) {
      soldByProduct[item.productId] = (soldByProduct[item.productId] ?? 0) + item.quantity;
    }
  }

  for (const product of products) {
    // Skip if already have a record for this product in last 24h
    const recentRecord = existingRecords.find(
      (r) =>
        r.productId === product.id &&
        !r.resolvedAs &&
        new Date(r.detectedAt) > oneDayAgo,
    );
    if (recentRecord) continue;

    // Total received from log
    const productReceived = receivedLog
      .filter((e) => e.productId === product.id)
      .reduce((sum, e) => sum + e.qty, 0);

    const totalSold = soldByProduct[product.id] ?? 0;
    const currentStock = product.quantity;

    // If no received log and no sales, not enough data
    if (productReceived === 0 && totalSold === 0) continue;

    // Estimate initial stock: current + sold - received
    // If received > 0, we can compute expected = received - sold + (current stock before we started tracking)
    // Simpler: expected = current stock if no discrepancy. We compute:
    // expectedNow = productReceived - totalSold + initialStock
    // We don't know initialStock exactly, so we use: initialStock = currentStock + totalSold - productReceived
    // That always gives 0 discrepancy unless there are actual missing units beyond what we've tracked.
    // Better approach: if totalReceived > 0, use received as the baseline
    if (productReceived === 0) continue;

    const expectedQty = productReceived - totalSold;
    if (expectedQty < 0) continue; // sold more than received (data gap)

    const discrepancy = expectedQty - currentStock;

    // Only flag if discrepancy > 0.5 units AND > 2% of expected
    if (discrepancy <= 0.5) continue;
    if (expectedQty > 0 && discrepancy / expectedQty <= 0.02) continue;

    const costPerUnit = product.costPrice ?? 0;
    const record: ShrinkageRecord = {
      id: generateId(),
      productId: product.id,
      productName: product.name,
      category: product.category,
      expectedQty,
      actualQty: currentStock,
      discrepancy,
      costPerUnit,
      totalCostImpact: discrepancy * costPerUnit,
      detectedAt: now.toISOString(),
    };

    newRecords.push(record);
  }

  if (newRecords.length > 0) {
    saveRecords([...existingRecords, ...newRecords]);
  }

  localStorage.setItem(LAST_RUN_KEY, now.toISOString());
  return newRecords;
}

/**
 * Resolve a shrinkage record with a reason.
 */
export function resolveRecord(
  recordId: string,
  reason: ShrinkageReason,
  notes?: string,
): void {
  const records = getRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx === -1) return;
  records[idx] = {
    ...records[idx],
    resolvedAs: reason,
    resolvedAt: new Date().toISOString(),
    notes: notes ?? records[idx].notes,
  };
  saveRecords(records);
}

/**
 * Get full shrinkage summary.
 */
export function getSummary(): ShrinkageSummary {
  const records = getRecords();
  const lastRunRaw = localStorage.getItem(LAST_RUN_KEY);

  const unresolved = records.filter((r) => !r.resolvedAs);
  const resolved = records.filter((r) => r.resolvedAs);

  const byCategory: Record<string, number> = {};
  for (const r of unresolved) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.totalCostImpact;
  }

  const byReason: Partial<Record<ShrinkageReason, number>> = {};
  for (const r of resolved) {
    if (r.resolvedAs) {
      byReason[r.resolvedAs] = (byReason[r.resolvedAs] ?? 0) + 1;
    }
  }

  return {
    records,
    totalUnresolved: unresolved.length,
    totalCostImpact: unresolved.reduce((sum, r) => sum + r.totalCostImpact, 0),
    resolvedCostImpact: resolved.reduce((sum, r) => sum + r.totalCostImpact, 0),
    byCategory,
    byReason,
    lastRunAt: lastRunRaw ?? null,
  };
}

/**
 * Get total unresolved shrinkage cost impact for a given month.
 */
export function getMonthlyLoss(month?: Date): number {
  const target = month ?? new Date();
  const records = getRecords();
  return records
    .filter((r) => {
      if (r.resolvedAs) return false;
      const d = new Date(r.detectedAt);
      return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
    })
    .reduce((sum, r) => sum + r.totalCostImpact, 0);
}

/**
 * Detect patterns: flag products with 3+ shrinkage records.
 */
export function detectPatterns(records: ShrinkageRecord[]): string[] {
  const countByProduct: Record<string, { name: string; count: number }> = {};

  for (const r of records) {
    if (!countByProduct[r.productId]) {
      countByProduct[r.productId] = { name: r.productName, count: 0 };
    }
    countByProduct[r.productId].count++;
  }

  const patterns: string[] = [];
  for (const { name, count } of Object.values(countByProduct)) {
    if (count >= 3) {
      patterns.push(
        `"${name}" has had missing units detected ${count} times — possible ongoing theft or systematic receiving error.`,
      );
    }
  }

  return patterns;
}
