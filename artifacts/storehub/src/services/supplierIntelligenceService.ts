/**
 * supplierIntelligenceService.ts — Supplier Negotiation Intelligence
 *
 * Tracks cost price history per product, detects supplier price increases,
 * and generates AI-powered negotiation reports via Claude.
 */

import type { Product, Supplier } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceHistoryEntry {
  date: string;
  costPrice: number;
  supplierId: string;
  supplierName: string;
  note?: string;
}

export interface SupplierPriceAlert {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  changePct: number;
  annualImpact: number; // change × estimated annual units
  detectedAt: string;
}

export interface NegotiationReport {
  summary: string;
  priceIncreases: {
    productName: string;
    oldPrice: number;
    newPrice: number;
    changePct: number;
    annualImpact: number;
  }[];
  cheaperAlternatives: {
    productName: string;
    currentSupplier: string;
    alternativeSupplier: string;
    savings: number;
  }[];
  negotiationScript: string;
  recommendedTargetPrice: number;
  totalAnnualImpact: number;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const ALERTS_CACHE_KEY = "storehub_supplier_alerts";
const ALERTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ACKNOWLEDGED_KEY = "storehub_acknowledged_alerts";

function priceHistoryKey(productId: string) {
  return `storehub_price_history_${productId}`;
}

// ─── Price History ────────────────────────────────────────────────────────────

/**
 * Append a new cost price entry to a product's price history in localStorage.
 */
export function logPriceEntry(
  productId: string,
  costPrice: number,
  supplierId: string,
  supplierName: string,
  note?: string,
): void {
  const history = getPriceHistory(productId);
  const entry: PriceHistoryEntry = {
    date: new Date().toISOString(),
    costPrice,
    supplierId,
    supplierName,
    note,
  };
  history.push(entry);
  localStorage.setItem(priceHistoryKey(productId), JSON.stringify(history));
}

/**
 * Get all price history entries for a product.
 */
export function getPriceHistory(productId: string): PriceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(priceHistoryKey(productId));
    return raw ? (JSON.parse(raw) as PriceHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

// ─── Alert Detection ──────────────────────────────────────────────────────────

/**
 * Compare latest cost price vs average of prior 3 entries.
 * Flag if change > 5% increase.
 * Estimated annual units = quantity × 52 (assume weekly turnover).
 */
export function detectPriceChanges(
  products: Product[],
  suppliers: Supplier[],
): SupplierPriceAlert[] {
  const alerts: SupplierPriceAlert[] = [];

  for (const product of products) {
    if (!product.costPrice || !product.supplierId) continue;

    const history = getPriceHistory(product.id);
    if (history.length < 2) continue;

    // Latest entry
    const latest = history[history.length - 1];
    // Prior entries (up to 3)
    const priorEntries = history.slice(Math.max(0, history.length - 4), history.length - 1);
    if (priorEntries.length === 0) continue;

    const avgPrior =
      priorEntries.reduce((sum, e) => sum + e.costPrice, 0) / priorEntries.length;

    const changePct = ((latest.costPrice - avgPrior) / avgPrior) * 100;

    if (changePct > 5) {
      const supplier = suppliers.find((s) => s.id === product.supplierId);
      const estimatedAnnualUnits = product.quantity * 52;
      const priceChangeDelta = latest.costPrice - avgPrior;

      alerts.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        supplierName: supplier?.name ?? latest.supplierName ?? "Unknown Supplier",
        oldPrice: avgPrior,
        newPrice: latest.costPrice,
        changePct,
        annualImpact: priceChangeDelta * estimatedAnnualUnits,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Cache results with timestamp
  const acknowledged = getAcknowledgedAlerts();
  const unacknowledged = alerts.filter((a) => !acknowledged.includes(a.productId));

  localStorage.setItem(
    ALERTS_CACHE_KEY,
    JSON.stringify({ alerts: unacknowledged, generatedAt: new Date().toISOString() }),
  );

  return unacknowledged;
}

/**
 * Get cached alerts from last detection run (valid for 24h).
 */
export function getAlerts(): SupplierPriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_CACHE_KEY);
    if (!raw) return [];
    const cache = JSON.parse(raw) as { alerts: SupplierPriceAlert[]; generatedAt: string };
    const age = Date.now() - new Date(cache.generatedAt).getTime();
    if (age > ALERTS_CACHE_TTL_MS) return [];
    const acknowledged = getAcknowledgedAlerts();
    return cache.alerts.filter((a) => !acknowledged.includes(a.productId));
  } catch {
    return [];
  }
}

function getAcknowledgedAlerts(): string[] {
  try {
    const raw = localStorage.getItem(ACKNOWLEDGED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Mark an alert as acknowledged (won't show again).
 */
export function acknowledgeAlert(productId: string): void {
  const acknowledged = getAcknowledgedAlerts();
  if (!acknowledged.includes(productId)) {
    acknowledged.push(productId);
    localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(acknowledged));
  }
  // Also remove from cached alerts
  try {
    const raw = localStorage.getItem(ALERTS_CACHE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw) as { alerts: SupplierPriceAlert[]; generatedAt: string };
    cache.alerts = cache.alerts.filter((a) => a.productId !== productId);
    localStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

// ─── Negotiation Report ───────────────────────────────────────────────────────

interface PriceHistoryProduct {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  costPrice: number;
  priceHistory: PriceHistoryEntry[];
  estimatedAnnualUnits?: number;
}

/**
 * Generate an AI-powered negotiation report for a supplier.
 */
export async function generateNegotiationReport(
  supplierId: string,
  products: Product[],
  suppliers: Supplier[],
): Promise<NegotiationReport> {
  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!supplier) throw new Error("Supplier not found");

  // Get products for this supplier
  const supplierProducts = products.filter((p) => p.supplierId === supplierId);

  const priceHistoryProducts: PriceHistoryProduct[] = supplierProducts.map((p) => ({
    productId: p.id,
    productName: p.name,
    supplierId,
    supplierName: supplier.name,
    costPrice: p.costPrice ?? 0,
    priceHistory: getPriceHistory(p.id),
    estimatedAnnualUnits: p.quantity * 52,
  }));

  const storeData = {
    supplierName: supplier.name,
    totalProductsFromSupplier: supplierProducts.length,
    totalEstimatedAnnualSpend: supplierProducts.reduce(
      (sum, p) => sum + (p.costPrice ?? 0) * p.quantity * 52,
      0,
    ),
  };

  const res = await fetch("/api/store/supplier-intelligence/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplierName: supplier.name,
      products: priceHistoryProducts,
      storeData,
    }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error((err as { error: string }).error ?? "Failed to generate report");
  }

  const { report } = (await res.json()) as { report: NegotiationReport };
  return report;
}
