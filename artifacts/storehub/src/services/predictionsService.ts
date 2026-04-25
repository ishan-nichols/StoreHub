/**
 * predictionsService.ts — Predictive Demand Intelligence
 *
 * Manages AI-powered demand forecasting via /api/predictions/*.
 * Predictions are cached in localStorage for 12 hours.
 */

import { getProducts, getSales } from "./dataService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductPrediction {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  predictedDemand7d: number;
  dailyBreakdown: number[]; // 7 numbers, Mon-Sun
  recommendedOrderQty: number;
  orderByDate: string; // ISO date string
  urgency: "critical" | "high" | "medium" | "low";
  reasoning: string;
  daysUntilStockout: number;
}

export interface PredictionsCache {
  predictions: ProductPrediction[];
  generatedAt: string;
  eventContext?: string;
}

// ─── Storage constants ────────────────────────────────────────────────────────

const CACHE_KEY = "storehub_predictions";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ─── US holidays (next ~60 days from today, refreshed at runtime) ─────────────

function getUpcomingUSHolidays(): Array<{ date: string; name: string }> {
  const year = new Date().getFullYear();
  const candidates = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-01-20`, name: "MLK Day" },
    { date: `${year}-02-17`, name: "Presidents' Day" },
    { date: `${year}-05-26`, name: "Memorial Day" },
    { date: `${year}-07-04`, name: "Independence Day" },
    { date: `${year}-09-01`, name: "Labor Day" },
    { date: `${year}-10-13`, name: "Columbus Day" },
    { date: `${year}-11-11`, name: "Veterans Day" },
    { date: `${year}-11-27`, name: "Thanksgiving" },
    { date: `${year}-12-25`, name: "Christmas" },
    // Also next year's New Year
    { date: `${year + 1}-01-01`, name: "New Year's Day" },
  ];

  const now = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;

  return candidates.filter((h) => {
    const diff = new Date(h.date).getTime() - now;
    return diff >= 0 && diff <= sixtyDays;
  });
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function readCache(): PredictionsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as PredictionsCache;
    const age = Date.now() - new Date(cache.generatedAt).getTime();
    return age > CACHE_TTL_MS ? null : cache;
  } catch {
    return null;
  }
}

function writeCache(cache: PredictionsCache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

// ─── Data collection ──────────────────────────────────────────────────────────

async function collectStoreData(eventContext?: string): Promise<Record<string, unknown>> {
  const [products, sales] = await Promise.all([
    getProducts().catch(() => []),
    getSales().catch(() => []),
  ]);

  // Filter to active products with meaningful stock tracking
  const activeProducts = products.filter((p) => p.lowStockThreshold > 0);

  // Build 60-day per-product daily sales map
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const recentSales = sales.filter((s) => new Date(s.createdAt) >= cutoff);

  // Daily sales per product: { productId -> { "YYYY-MM-DD" -> qty } }
  const salesByProductByDay: Record<string, Record<string, number>> = {};

  for (const sale of recentSales) {
    for (const item of sale.items as Array<{ productId: string; productName: string; quantity: number }>) {
      if (!salesByProductByDay[item.productId]) {
        salesByProductByDay[item.productId] = {};
      }
      const dateKey = new Date(sale.createdAt).toISOString().split("T")[0];
      salesByProductByDay[item.productId][dateKey] =
        (salesByProductByDay[item.productId][dateKey] ?? 0) + item.quantity;
    }
  }

  // Day-of-week pattern (0=Sun … 6=Sat -> mapped to Mon-indexed)
  const dowPattern: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0,
    Thursday: 0, Friday: 0, Saturday: 0,
  };
  const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const sale of recentSales) {
    const dow = dowNames[new Date(sale.createdAt).getDay()];
    dowPattern[dow] = (dowPattern[dow] ?? 0) + sale.total;
  }

  const salesHistory = activeProducts.map((p) => ({
    productId: p.id,
    productName: p.name,
    category: p.category,
    currentStock: p.quantity,
    lowStockThreshold: p.lowStockThreshold,
    costPrice: p.costPrice ?? 0,
    price: p.price,
    unit: p.unit,
    dailySales: salesByProductByDay[p.id] ?? {},
  }));

  return {
    currentDate: now.toISOString(),
    dayOfWeek: dowNames[now.getDay()],
    products: salesHistory,
    salesLast60Days: {
      totalTransactions: recentSales.length,
      totalRevenue: recentSales.reduce((sum, s) => sum + s.total, 0),
      dayOfWeekPattern: dowPattern,
    },
    upcomingHolidays: getUpcomingUSHolidays(),
    ...(eventContext ? { eventContext } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Get cached predictions without making an API call. */
export function getCachedPredictions(): PredictionsCache | null {
  return readCache();
}

/**
 * Generate (or return cached) demand predictions.
 * @param force — bypass cache and always call the API
 * @param eventContext — optional event note passed to Claude
 */
export async function generatePredictions(
  force = false,
  eventContext?: string,
): Promise<ProductPrediction[]> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached.predictions;
  }

  const storeData = await collectStoreData(eventContext);

  const res = await fetch("/api/predictions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeData, eventContext }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to generate predictions");
  }

  const { predictions, generatedAt } = (await res.json()) as {
    predictions: ProductPrediction[];
    generatedAt: string;
  };

  writeCache({ predictions, generatedAt, eventContext });
  return predictions;
}

/**
 * Recalculate predictions with a new event context (uses faster Haiku model).
 */
export async function recalculatePredictions(
  eventContext: string,
): Promise<ProductPrediction[]> {
  const cached = readCache();
  const storeData = await collectStoreData(eventContext);

  const res = await fetch("/api/predictions/recalculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeData,
      eventContext,
      existingPredictions: cached?.predictions ?? [],
    }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error((err as { error?: string }).error ?? "Failed to recalculate predictions");
  }

  const { predictions, generatedAt } = (await res.json()) as {
    predictions: ProductPrediction[];
    generatedAt: string;
  };

  writeCache({ predictions, generatedAt, eventContext });
  return predictions;
}

/** Filter predictions to only critical/high urgency items. */
export function getPredictionAlerts(
  predictions: ProductPrediction[],
): ProductPrediction[] {
  return predictions.filter(
    (p) => p.urgency === "critical" || p.urgency === "high",
  );
}

/** Human-readable age of cached predictions (e.g. "2h ago"). */
export function predictionsAge(): string | null {
  const cache = readCache();
  if (!cache) return null;
  const ms = Date.now() - new Date(cache.generatedAt).getTime();
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hrs >= 1) return `${hrs}h ago`;
  return `${mins}m ago`;
}
