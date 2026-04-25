import type { Sale, Product, Expense, Shift } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfitBreakdown {
  revenue: number;
  cogs: number;          // sum of (costPrice × qty) for sold items
  grossProfit: number;   // revenue - cogs
  expenses: number;      // logged expenses for period
  laborCost: number;     // shifts × hourlyWage for period
  estimatedTax: number;  // 25% of gross profit (simplified estimate)
  realProfit: number;    // grossProfit - expenses - laborCost - estimatedTax
  period: "today" | "week" | "month" | "year";
  startDate: string;
  endDate: string;
}

export interface ProfitByProduct {
  productId: string;
  productName: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  profitMarginPct: number;
}

export interface ProfitTrend {
  date: string;          // "YYYY-MM-DD"
  revenue: number;
  realProfit: number;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function getPeriodBounds(period: "today" | "week" | "month" | "year"): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === "week") {
    const start = new Date(now);
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // year
  const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateToYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Core Calculations ────────────────────────────────────────────────────────

export function calculateProfitBreakdown(
  sales: Sale[],
  products: Product[],
  expenses: Expense[],
  shifts: Shift[],
  period: "today" | "week" | "month" | "year",
): ProfitBreakdown {
  const { start, end } = getPeriodBounds(period);

  // Build product lookup by name for COGS
  const productByName = new Map<string, Product>();
  for (const p of products) {
    productByName.set(p.name.toLowerCase(), p);
  }
  const productById = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
  }

  // Filter sales in period
  const periodSales = sales.filter(s => {
    const d = new Date(s.createdAt);
    return d >= start && d <= end;
  });

  let revenue = 0;
  let cogs = 0;

  for (const sale of periodSales) {
    revenue += sale.total;
    for (const item of sale.items) {
      // Find product first by id, then by name
      const product = productById.get(item.productId) ?? productByName.get(item.productName.toLowerCase());
      const cost = product?.costPrice != null
        ? product.costPrice
        : item.price * 0.6;  // fallback: 60% of sell price
      cogs += cost * item.quantity;
    }
  }

  const grossProfit = revenue - cogs;

  // Filter expenses in period
  const periodExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d >= start && d <= end;
  });
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Labor cost from shifts in period
  const periodShifts = shifts.filter(s => {
    const d = new Date(s.shiftStart);
    return d >= start && d <= end && s.hoursWorked != null;
  });

  // We need employee hourly wages — build lookup from shifts' employee data
  // Shifts store employeeId but not wage; wages are on Employee objects.
  // We'll use a flat wage lookup via employeeId when we have employees.
  // Since we don't receive employees here, we'll compute labor from hoursWorked and
  // a default $15/hr if no wage info is present. Callers can pass enriched shifts.
  let laborCost = 0;
  for (const shift of periodShifts) {
    const hours = shift.hoursWorked ?? 0;
    // hourlyWage is stored on Employee, not Shift — use 15 as fallback
    const wage = (shift as Shift & { hourlyWage?: number }).hourlyWage ?? 15;
    laborCost += hours * wage;
  }

  // Tax: 25% of positive taxable profit (gross - expenses - labor)
  const taxableBase = grossProfit - expenseTotal - laborCost;
  const estimatedTax = taxableBase > 0 ? taxableBase * 0.25 : 0;

  const realProfit = grossProfit - expenseTotal - laborCost - estimatedTax;

  return {
    revenue,
    cogs,
    grossProfit,
    expenses: expenseTotal,
    laborCost,
    estimatedTax,
    realProfit,
    period,
    startDate: dateToYMD(start),
    endDate: dateToYMD(end),
  };
}

export function getProfitByProduct(sales: Sale[], products: Product[]): ProfitByProduct[] {
  const productById = new Map<string, Product>();
  const productByName = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
    productByName.set(p.name.toLowerCase(), p);
  }

  // Aggregate by product
  const map = new Map<string, {
    productId: string;
    productName: string;
    category: string;
    unitsSold: number;
    revenue: number;
    cogs: number;
  }>();

  for (const sale of sales) {
    for (const item of sale.items) {
      const product = productById.get(item.productId) ?? productByName.get(item.productName.toLowerCase());
      const key = item.productId || item.productName;
      const existing = map.get(key);

      const itemRevenue = item.price * item.quantity;
      const cost = product?.costPrice != null ? product.costPrice : item.price * 0.6;
      const itemCogs = cost * item.quantity;

      if (existing) {
        existing.unitsSold += item.quantity;
        existing.revenue += itemRevenue;
        existing.cogs += itemCogs;
      } else {
        map.set(key, {
          productId: item.productId,
          productName: item.productName,
          category: product?.category ?? "Unknown",
          unitsSold: item.quantity,
          revenue: itemRevenue,
          cogs: itemCogs,
        });
      }
    }
  }

  return Array.from(map.values())
    .map(entry => {
      const grossProfit = entry.revenue - entry.cogs;
      const profitMarginPct = entry.revenue > 0 ? (grossProfit / entry.revenue) * 100 : 0;
      return { ...entry, grossProfit, profitMarginPct };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

export function getProfitTrend(sales: Sale[], products: Product[], days: 30 | 90): ProfitTrend[] {
  const productById = new Map<string, Product>();
  const productByName = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
    productByName.set(p.name.toLowerCase(), p);
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  // Build day map
  const dayMap = new Map<string, { revenue: number; cogs: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dayMap.set(dateToYMD(d), { revenue: 0, cogs: 0 });
  }

  for (const sale of sales) {
    const saleDate = dateToYMD(new Date(sale.createdAt));
    const entry = dayMap.get(saleDate);
    if (!entry) continue;

    entry.revenue += sale.total;
    for (const item of sale.items) {
      const product = productById.get(item.productId) ?? productByName.get(item.productName.toLowerCase());
      const cost = product?.costPrice != null ? product.costPrice : item.price * 0.6;
      entry.cogs += cost * item.quantity;
    }
  }

  return Array.from(dayMap.entries()).map(([date, { revenue, cogs }]) => {
    const grossProfit = revenue - cogs;
    // simplified: no daily expenses/labor/tax for trend — just gross profit
    const realProfit = grossProfit * 0.75; // ~25% tax estimate, simplified
    return { date, revenue, realProfit };
  });
}
