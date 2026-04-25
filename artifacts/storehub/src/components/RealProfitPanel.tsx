import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { getSales, getProducts, getExpenses, getShifts, getEmployees } from "../services/dataService";
import {
  calculateProfitBreakdown,
  getProfitByProduct,
  getProfitTrend,
  type ProfitBreakdown,
  type ProfitByProduct,
  type ProfitTrend,
} from "../services/profitService";
import type { Sale, Expense, Shift, Employee } from "../schemas";
import { formatCurrency } from "../utils";

type Period = "today" | "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
};

// ─── SVG Trend Chart ──────────────────────────────────────────────────────────

function TrendChart({ data }: { data: ProfitTrend[] }) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-stone-400">No data yet</div>;
  }

  const W = 600;
  const H = 140;
  const PAD = { top: 10, right: 10, bottom: 24, left: 44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allValues = data.flatMap(d => [d.revenue, d.realProfit]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const range = maxVal - minVal || 1;

  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;

  function polyline(key: "revenue" | "realProfit") {
    return data.map((d, i) => `${xScale(i)},${yScale(d[key])}`).join(" ");
  }

  // Y axis ticks
  const ticks = [minVal, (minVal + maxVal) / 2, maxVal];

  // X axis labels — show a few dates
  const labelIndices = data.length <= 7
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(3 * data.length / 4), data.length - 1];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Profit trend chart">
        {/* Zero line */}
        {minVal < 0 && (
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={yScale(0)} y2={yScale(0)}
            stroke="#d6d3d1" strokeWidth="1" strokeDasharray="4 3"
          />
        )}
        {/* Y axis ticks */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(v)} y2={yScale(v)} stroke="#d6d3d1" strokeWidth="1" />
            <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#a8a29e">
              ${Math.round(v)}
            </text>
          </g>
        ))}
        {/* Revenue line (stone) */}
        <polyline
          points={polyline("revenue")}
          fill="none"
          stroke="#78716c"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Real profit line (emerald) */}
        <polyline
          points={polyline("realProfit")}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* X axis labels */}
        {labelIndices.map(i => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize="8"
            fill="#a8a29e"
          >
            {data[i]?.date.slice(5) ?? ""}
          </text>
        ))}
        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${PAD.top})`}>
          <rect x={0} y={0} width={8} height={2} fill="#78716c" rx="1" />
          <text x={11} y={4} fontSize="8" fill="#78716c">Revenue</text>
          <rect x={60} y={0} width={8} height={2} fill="#10b981" rx="1" />
          <text x={71} y={4} fontSize="8" fill="#10b981">Real Profit</text>
        </g>
      </svg>
    </div>
  );
}

// ─── Waterfall Row ────────────────────────────────────────────────────────────

interface WaterfallRowProps {
  label: string;
  amount: number;
  positive?: boolean;
  bold?: boolean;
  expandable?: boolean;
  children?: React.ReactNode;
}

function WaterfallRow({ label, amount, positive, bold, expandable, children }: WaterfallRowProps) {
  const [open, setOpen] = useState(false);
  const isPositive = positive ?? amount >= 0;
  const amtStr = `${isPositive ? "+" : "-"}$${Math.abs(amount).toFixed(2)}`;
  const color = bold
    ? amount >= 0 ? "text-emerald-700" : "text-red-600"
    : isPositive ? "text-emerald-600" : "text-red-500";

  return (
    <div>
      <button
        type="button"
        onClick={() => expandable && setOpen(o => !o)}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
          expandable ? "cursor-pointer hover:bg-stone-100" : "cursor-default"
        } ${bold ? "bg-stone-100" : ""}`}
      >
        <span className={`text-sm ${bold ? "font-semibold text-stone-900" : "text-stone-600"}`}>{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold tabular-nums ${color}`}>{amtStr}</span>
          {expandable && (open ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />)}
        </div>
      </button>
      {expandable && open && children && (
        <div className="mx-2 mb-2 rounded-2xl bg-stone-50 p-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RealProfitPanel() {
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [breakdown, setBreakdown] = useState<ProfitBreakdown | null>(null);
  const [byProduct, setByProduct] = useState<ProfitByProduct[]>([]);
  const [trend, setTrend] = useState<ProfitTrend[]>([]);

  // Raw data stored to allow period re-calculation without refetch
  const [rawSales, setRawSales] = useState<Sale[]>([]);
  const [rawExpenses, setRawExpenses] = useState<Expense[]>([]);
  const [rawShifts, setRawShifts] = useState<Shift[]>([]);
  const [rawEmployees, setRawEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getSales(), getProducts(), getExpenses(), getShifts(), getEmployees()])
      .then(([sales, products, expenses, shifts, employees]) => {
        if (cancelled) return;

        // Enrich shifts with hourly wage from employees
        const empWageMap = new Map(employees.map(e => [e.id, e.hourlyWage ?? 15]));
        const enrichedShifts = shifts.map(s => ({
          ...s,
          hourlyWage: empWageMap.get(s.employeeId) ?? 15,
        }));

        setRawSales(sales);
        setRawExpenses(expenses);
        setRawShifts(enrichedShifts);
        setRawEmployees(employees);

        const pb = calculateProfitBreakdown(sales, products, expenses, enrichedShifts, period);
        setBreakdown(pb);
        setByProduct(getProfitByProduct(sales, products).slice(0, 5));
        setTrend(getProfitTrend(sales, products, 30));
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate when period changes (products aren't needed for period filter, pass raw)
  useEffect(() => {
    if (rawSales.length === 0 && !loading) return;
    if (loading) return;

    getProducts().then(products => {
      const pb = calculateProfitBreakdown(rawSales, products, rawExpenses, rawShifts, period);
      setBreakdown(pb);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Insights ────────────────────────────────────────────────────────────────

  function buildInsights(): string[] {
    if (!breakdown || rawSales.length === 0) return [];
    const insights: string[] = [];

    // Best day this week
    if (period === "week" || period === "today") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);
      const dayTotals: Record<string, number> = {};
      for (const sale of rawSales) {
        const d = new Date(sale.createdAt);
        if (d < weekAgo) continue;
        const key = d.toLocaleDateString(undefined, { weekday: "long" });
        dayTotals[key] = (dayTotals[key] ?? 0) + sale.total;
      }
      const [bestDay, bestAmt] = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (bestDay) {
        insights.push(`Your best day this week: ${bestDay} $${bestAmt.toFixed(2)}`);
      }
    }

    if (breakdown.revenue > 0) {
      const cogsPct = ((breakdown.cogs / breakdown.revenue) * 100).toFixed(0);
      insights.push(`COGS is ${cogsPct}% of revenue`);
    }

    if (breakdown.revenue > 0 && breakdown.laborCost > 0) {
      const laborPct = ((breakdown.laborCost / breakdown.revenue) * 100).toFixed(0);
      insights.push(`Labor is ${laborPct}% of revenue`);
    }

    return insights;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
        <div className="flex h-40 items-center justify-center text-sm text-stone-400">
          Loading profit data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
        <p className="text-sm text-red-500">Failed to load profit data: {error}</p>
      </div>
    );
  }

  const insights = buildInsights();
  const realProfitPositive = (breakdown?.realProfit ?? 0) >= 0;

  // Build expense detail list
  const expenseItems = rawExpenses.filter(e => {
    if (!breakdown) return false;
    const d = new Date(e.date);
    return d >= new Date(breakdown.startDate) && d <= new Date(breakdown.endDate + "T23:59:59");
  });

  // Build labor detail
  const laborItems = rawShifts.filter(s => {
    if (!breakdown) return false;
    const d = new Date(s.shiftStart);
    return d >= new Date(breakdown.startDate) && d <= new Date(breakdown.endDate + "T23:59:59") && s.hoursWorked != null;
  });

  const empWageMap = new Map(rawEmployees.map(e => [e.id, e.hourlyWage ?? 15]));

  return (
    <section className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Real Profit Visibility</h2>
            <p className="text-sm text-stone-500">After COGS, expenses, labor & tax</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex rounded-2xl bg-stone-100 p-1">
          {(["today", "week", "month", "year"] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                period === p
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Number */}
      {breakdown && (
        <div className="mt-6 flex flex-col items-center rounded-[24px] bg-gradient-to-br from-stone-50 to-white py-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
            {PERIOD_LABELS[period]}'s Real Profit
          </p>
          <div className={`mt-2 text-5xl font-bold tracking-tight ${realProfitPositive ? "text-emerald-700" : "text-red-600"}`}>
            {breakdown.realProfit < 0 ? "-" : ""}${Math.abs(breakdown.realProfit).toFixed(2)}
          </div>
          <p className="mt-2 text-sm text-stone-400">
            {breakdown.startDate === breakdown.endDate
              ? breakdown.startDate
              : `${breakdown.startDate} → ${breakdown.endDate}`}
          </p>
        </div>
      )}

      {/* Waterfall Breakdown */}
      {breakdown && (
        <div className="mt-5 space-y-1">
          <WaterfallRow label="Revenue" amount={breakdown.revenue} positive={true} />
          <WaterfallRow label="Cost of Goods (COGS)" amount={-breakdown.cogs} expandable={byProduct.length > 0}>
            <div className="space-y-1">
              {byProduct.map(p => (
                <div key={p.productId} className="flex justify-between text-xs text-stone-600">
                  <span>{p.productName} ({p.unitsSold} units)</span>
                  <span className="font-medium">-${p.cogs.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </WaterfallRow>
          <WaterfallRow label="Expenses" amount={-breakdown.expenses} expandable={expenseItems.length > 0}>
            <div className="space-y-1">
              {expenseItems.map(e => (
                <div key={e.id} className="flex justify-between text-xs text-stone-600">
                  <span>{e.description} ({e.category})</span>
                  <span className="font-medium">-${e.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </WaterfallRow>
          <WaterfallRow label="Labor Cost" amount={-breakdown.laborCost} expandable={laborItems.length > 0}>
            <div className="space-y-1">
              {laborItems.map(s => {
                const wage = empWageMap.get(s.employeeId) ?? 15;
                const cost = (s.hoursWorked ?? 0) * wage;
                return (
                  <div key={s.id} className="flex justify-between text-xs text-stone-600">
                    <span>{s.employeeName} ({(s.hoursWorked ?? 0).toFixed(1)}h @ ${wage}/hr)</span>
                    <span className="font-medium">-${cost.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </WaterfallRow>
          <WaterfallRow label="Est. Tax (25%)" amount={-breakdown.estimatedTax} />

          {/* Divider */}
          <div className="my-2 border-t border-stone-200" />

          <WaterfallRow label="Real Profit" amount={breakdown.realProfit} bold />
        </div>
      )}

      {/* Trend Chart */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-stone-700">30-Day Profit Trend</h3>
        <TrendChart data={trend} />
      </div>

      {/* Top Profit Products */}
      {byProduct.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-stone-700">Top Products by Gross Profit</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="py-2 text-left font-semibold text-stone-500">Product</th>
                  <th className="py-2 text-right font-semibold text-stone-500">Units</th>
                  <th className="py-2 text-right font-semibold text-stone-500">Revenue</th>
                  <th className="py-2 text-right font-semibold text-stone-500">COGS</th>
                  <th className="py-2 text-right font-semibold text-stone-500">Gross Profit</th>
                  <th className="py-2 text-right font-semibold text-stone-500">Margin</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map(p => (
                  <tr key={p.productId} className="border-b border-stone-100">
                    <td className="py-2 font-medium text-stone-800">{p.productName}</td>
                    <td className="py-2 text-right text-stone-600">{p.unitsSold}</td>
                    <td className="py-2 text-right text-stone-600">${p.revenue.toFixed(2)}</td>
                    <td className="py-2 text-right text-stone-600">${p.cogs.toFixed(2)}</td>
                    <td className={`py-2 text-right font-semibold ${p.grossProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      ${p.grossProfit.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-stone-600">{p.profitMarginPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-stone-700">Key Insights</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {insights.map(ins => (
              <div key={ins} className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-100">
                {ins}
              </div>
            ))}
          </div>
        </div>
      )}

      {breakdown && breakdown.revenue === 0 && (
        <div className="mt-4 rounded-2xl bg-stone-50 p-4 text-center text-sm text-stone-500">
          No sales recorded for this period yet. Make some sales to see your real profit here.
        </div>
      )}
    </section>
  );
}
