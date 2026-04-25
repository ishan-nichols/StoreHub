import { getSales, getExpenses, getRecurringExpenses, getEmployees, getShifts, API_BASE_URL } from "./dataService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyForecast {
  weekStart: string;
  weekEnd: string;
  projectedIncome: number;
  projectedExpenses: number;
  netCash: number;
  runningBalance: number;
  notes: string;
  isNegative: boolean;
}

export interface CashGapAlert {
  weekStart: string;
  gapAmount: number;
  cause: string;
  suggestions: string[];
}

export interface CashFlowData {
  forecast: WeeklyForecast[];
  alerts: CashGapAlert[];
  generatedAt: string;
  currentBalance: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY = "storehub_cashflow";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function getCachedForecast(): CashFlowData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CashFlowData & { _cachedAt: string };
    const age = Date.now() - new Date(data._cachedAt).getTime();
    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedForecast(data: CashFlowData): void {
  const toStore = { ...data, _cachedAt: new Date().toISOString() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(toStore));
}

// ─── Store Data Collector ─────────────────────────────────────────────────────

async function collectStoreData(currentBalance: number) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [sales, expenses, recurringExpenses, employees, shifts] = await Promise.all([
    getSales(),
    getExpenses(),
    getRecurringExpenses(),
    getEmployees(),
    getShifts(),
  ]);

  // Recent sales (last 30 days)
  const recentSales = sales
    .filter(s => new Date(s.createdAt) >= thirtyDaysAgo)
    .map(s => ({ date: s.createdAt, total: s.total, itemCount: s.items.length }));

  // Average weekly revenue from last 30 days
  const last30Revenue = recentSales.reduce((sum, s) => sum + s.total, 0);
  const avgWeeklyRevenue = last30Revenue / (30 / 7);

  // Recent expenses as recurring patterns
  const recentExpenses = expenses
    .filter(e => new Date(e.date) >= thirtyDaysAgo)
    .map(e => ({ description: e.description, amount: e.amount, category: e.category, date: e.date }));

  // Recurring expense data
  const recurringData = recurringExpenses
    .filter(r => r.enabled)
    .map(r => ({ description: r.description, amount: r.amount, frequency: r.frequency, category: r.category }));

  // Supplier info (via recurring or expense categories)
  const supplierPayments = recentExpenses
    .filter(e => e.category === "Inventory" || e.category === "Cost of Goods")
    .reduce((sum, e) => sum + e.amount, 0);

  // Employee labor estimate (weekly)
  const empData = employees.map(e => ({
    name: e.name,
    role: e.role,
    hourlyWage: e.hourlyWage ?? 15,
    payrollType: e.payrollType ?? "hourly",
  }));

  // Weekly labor from recent shifts
  const recentShifts = shifts.filter(s => new Date(s.shiftStart) >= thirtyDaysAgo && s.hoursWorked != null);
  const totalLaborLast30 = recentShifts.reduce((sum, s) => {
    const emp = employees.find(e => e.id === s.employeeId);
    const wage = emp?.hourlyWage ?? 15;
    return sum + (s.hoursWorked ?? 0) * wage;
  }, 0);
  const laborEstimate = totalLaborLast30 / (30 / 7); // weekly average

  // Tax deadlines (rough estimate)
  const now = new Date();
  const taxDeadlines = [];
  const nextQ15 = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  if (nextQ15 > now) {
    taxDeadlines.push({ name: "Estimated quarterly tax", due: nextQ15.toISOString().split("T")[0], estimated: avgWeeklyRevenue * 4 * 0.1 });
  }

  return {
    recentSales: recentSales.slice(0, 30),
    recurringExpenses: recurringData,
    suppliers: [{ weeklySupplierCost: supplierPayments / (30 / 7) }],
    employees: empData,
    taxDeadlines,
    currentCashEstimate: currentBalance,
    avgWeeklyRevenue: Math.max(avgWeeklyRevenue, 0),
    laborEstimate: Math.max(laborEstimate, 0),
  };
}

// ─── Generate Forecast ────────────────────────────────────────────────────────

export async function generateForecast(
  force = false,
  currentBalance = 0,
): Promise<CashFlowData> {
  // Return cache if fresh and not forced
  if (!force) {
    const cached = getCachedForecast();
    if (cached) return cached;
  }

  const storeData = await collectStoreData(currentBalance);

  const authToken = localStorage.getItem("storehub_auth_token") ?? sessionStorage.getItem("storehub_auth_token") ?? "";

  const response = await fetch(`${API_BASE_URL}/api/cashflow/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ storeData }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Network error" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  const raw = await response.json() as {
    forecast: Array<{
      weekStart: string;
      weekEnd: string;
      projectedIncome: number;
      projectedExpenses: number;
      netCash: number;
      runningBalance: number;
      notes: string;
    }>;
    alerts: CashGapAlert[];
    generatedAt: string;
  };

  const forecast: WeeklyForecast[] = raw.forecast.map(w => ({
    ...w,
    isNegative: w.runningBalance < 0,
  }));

  const data: CashFlowData = {
    forecast,
    alerts: raw.alerts,
    generatedAt: raw.generatedAt,
    currentBalance,
  };

  setCachedForecast(data);
  return data;
}
