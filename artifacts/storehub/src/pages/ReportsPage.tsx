import { useState, useEffect, useCallback } from "react";
import type { ElementType } from "react";
import { useApp } from "../contexts/useApp";
import { getSales, getExpenses, getProducts, getShifts } from "../services/dataService";
import type { Sale, Expense, Product, Shift } from "../schemas";
import { formatCurrency, getCurrencySymbol, formatTime } from "../utils";
import {
  BarChart2, TrendingUp, TrendingDown, Calendar, Package,
  DollarSign, ShoppingCart, RefreshCw, Printer, Sparkles,
  Clock, Sun, ChevronLeft, ChevronRight, Receipt, Users,
  AlertCircle,
} from "lucide-react";
import { API_BASE_URL } from "../services/dataService";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "shift" | "day" | "week" | "month" | "year";

interface Metrics {
  revenue: number;
  expenses: number;
  profit: number;
  salesCount: number;
  avgSale: number;
  sales: Sale[];
  periodExpenses: Expense[];
}

interface BreakdownRow {
  label: string;
  revenue: number;
  expenseTotal: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}
function formatHour(h: number): string {
  if (h === 0)  return "12am";
  if (h < 12)   return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}
function formatDayLabel(d: Date): string {
  const today = startOfDay(new Date());
  const diff = (startOfDay(d).getTime() - today.getTime()) / 86400000;
  if (diff === 0)  return "Today";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function calcMetrics(sales: Sale[], expenses: Expense[], start: Date, end: Date): Metrics {
  const periodSales = sales.filter((s) => { const d = new Date(s.createdAt); return d >= start && d <= end; });
  const periodExpenses = expenses.filter((e) => { const d = new Date(e.date); return d >= start && d <= end; });
  const revenue      = periodSales.reduce((sum, s) => sum + s.total, 0);
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  return {
    revenue,
    expenses:   expenseTotal,
    profit:     revenue - expenseTotal,
    salesCount: periodSales.length,
    avgSale:    periodSales.length > 0 ? revenue / periodSales.length : 0,
    sales:      periodSales,
    periodExpenses,
  };
}

function getPctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function getPeriodRange(period: "week" | "month" | "year") {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  if (period === "week") {
    const start = new Date(); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0);
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = addDays(prevEnd, -6); prevStart.setHours(0, 0, 0, 0);
    return { start, end: now, prevStart, prevEnd };
  }
  if (period === "month") {
    const start     = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end: now, prevStart, prevEnd };
  }
  const start     = new Date(now.getFullYear(), 0, 1);
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  return { start, end: now, prevStart, prevEnd };
}

function buildHourlyBreakdown(sales: Sale[], expenses: Expense[], rangeStart: Date, rangeEnd: Date): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  const cur = new Date(rangeStart); cur.setMinutes(0, 0, 0);
  while (cur <= rangeEnd && rows.length <= 24) {
    const hStart = new Date(cur);
    const hEnd   = new Date(cur); hEnd.setHours(hEnd.getHours(), 59, 59, 999);
    const actualEnd = hEnd > rangeEnd ? rangeEnd : hEnd;
    const rev = sales.filter((s) => { const d = new Date(s.createdAt); return d >= hStart && d <= actualEnd; }).reduce((sum, s) => sum + s.total, 0);
    const exp = expenses.filter((e) => { const d = new Date(e.date); return d >= hStart && d <= actualEnd; }).reduce((sum, e) => sum + e.amount, 0);
    rows.push({ label: formatHour(cur.getHours()), revenue: rev, expenseTotal: exp });
    cur.setHours(cur.getHours() + 1);
  }
  return rows;
}

function buildPeriodBreakdown(sales: Sale[], expenses: Expense[], period: "week" | "month" | "year", start: Date, end: Date): BreakdownRow[] {
  if (period === "week") {
    return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, i) => {
      const d = addDays(start, i); const next = addDays(d, 1);
      const rev = sales.filter(s => { const x = new Date(s.createdAt); return x >= d && x < next; }).reduce((s, x) => s + x.total, 0);
      const exp = expenses.filter(e => { const x = new Date(e.date); return x >= d && x < next; }).reduce((s, x) => s + x.amount, 0);
      return { label: `${label} ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, revenue: rev, expenseTotal: exp };
    });
  }
  if (period === "month") {
    const weeks: BreakdownRow[] = [];
    const ws = new Date(start); let wn = 1;
    while (ws <= end) {
      const we = addDays(ws, 6); const ae = we > end ? end : we;
      const rev = sales.filter(s => { const d = new Date(s.createdAt); return d >= ws && d <= ae; }).reduce((s, x) => s + x.total, 0);
      const exp = expenses.filter(e => { const d = new Date(e.date); return d >= ws && d <= ae; }).reduce((s, x) => s + x.amount, 0);
      weeks.push({ label: `Wk ${wn} (${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${ae.getDate()})`, revenue: rev, expenseTotal: exp });
      ws.setDate(ws.getDate() + 7); wn++;
      if (ws > end) break;
    }
    return weeks;
  }
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((label, i) => {
    const ms = new Date(start.getFullYear(), i, 1);
    const me = new Date(start.getFullYear(), i + 1, 0, 23, 59, 59, 999);
    const rev = sales.filter(s => { const d = new Date(s.createdAt); return d >= ms && d <= me; }).reduce((s, x) => s + x.total, 0);
    const exp = expenses.filter(e => { const d = new Date(e.date); return d >= ms && d <= me; }).reduce((s, x) => s + x.amount, 0);
    return { label, revenue: rev, expenseTotal: exp };
  });
}

function buildTopProducts(sales: Sale[]) {
  const map: Record<string, { count: number; revenue: number }> = {};
  for (const sale of sales) for (const item of sale.items) {
    if (!map[item.productName]) map[item.productName] = { count: 0, revenue: 0 };
    map[item.productName].count   += item.quantity;
    map[item.productName].revenue += item.price * item.quantity;
  }
  return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
}

function buildExpenseBreakdown(expenses: Expense[]) {
  const map: Record<string, number> = {};
  for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + e.amount;
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  return Object.entries(map).map(([category, t]) => ({ category, total: t, pct: total > 0 ? (t / total) * 100 : 0 })).sort((a, b) => b.total - a.total);
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  shift: "This Shift",
  day:   "Today",
  week:  "This Week",
  month: "This Month",
  year:  "This Year",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { profile } = useApp();
  const currencySymbol = getCurrencySymbol(profile?.currency ?? "USD");
  const fmt = (n: number) => formatCurrency(n, currencySymbol);

  const [period,        setPeriod]        = useState<Period>("shift");
  const [selectedDate,  setSelectedDate]  = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });

  // Shift state
  const [shifts,          setShifts]          = useState<Shift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [shiftsLoading,   setShiftsLoading]   = useState(false);

  const [allSales,    setAllSales]    = useState<Sale[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, e, p] = await Promise.all([getSales(), getExpenses(), getProducts()]);
    setAllSales(s); setAllExpenses(e); setAllProducts(p);
    setLoading(false);
  }, []);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    const s = await getShifts();
    setShifts(s);
    // Auto-select: active shift first, otherwise most recent
    if (!selectedShiftId) {
      const active = s.find(sh => sh.shiftEnd === null);
      setSelectedShiftId(active?.id ?? s[0]?.id ?? null);
    }
    setShiftsLoading(false);
  }, [selectedShiftId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (period === "shift") loadShifts(); }, [period, loadShifts]);
  useEffect(() => {
    window.addEventListener("storehub:products-updated", load);
    return () => window.removeEventListener("storehub:products-updated", load);
  }, [load]);

  // ── Compute time ranges ─────────────────────────────────────────────────────

  let start: Date, end: Date, prevStart: Date, prevEnd: Date, prevLabel: string;

  const selectedShift = shifts.find(s => s.id === selectedShiftId) ?? null;

  if (period === "shift" && selectedShift) {
    start = new Date(selectedShift.shiftStart);
    end   = selectedShift.shiftEnd ? new Date(selectedShift.shiftEnd) : new Date();
    // Compare with same employee's previous closed shift, or fall back to same duration 24h ago
    const prevShift = shifts.find(s =>
      s.id !== selectedShiftId &&
      s.employeeId === selectedShift.employeeId &&
      s.shiftEnd !== null &&
      new Date(s.shiftEnd) < start
    );
    if (prevShift) {
      prevStart  = new Date(prevShift.shiftStart);
      prevEnd    = new Date(prevShift.shiftEnd!);
      prevLabel  = "previous shift";
    } else {
      const dur  = end.getTime() - start.getTime();
      prevEnd    = new Date(start.getTime() - 1);
      prevStart  = new Date(prevEnd.getTime() - dur);
      prevLabel  = "previous period";
    }
  } else if (period === "day") {
    start     = startOfDay(selectedDate);
    end       = endOfDay(selectedDate);
    prevStart = startOfDay(addDays(selectedDate, -1));
    prevEnd   = endOfDay(addDays(selectedDate, -1));
    prevLabel = "yesterday";
  } else if (period === "week" || period === "month" || period === "year") {
    const r   = getPeriodRange(period);
    start     = r.start; end     = r.end;
    prevStart = r.prevStart; prevEnd = r.prevEnd;
    prevLabel = period === "week" ? "last week" : period === "month" ? "last month" : "last year";
  } else {
    // shift but no shift selected
    start = new Date(); end = new Date(); prevStart = new Date(); prevEnd = new Date(); prevLabel = "previous";
  }

  const current = calcMetrics(allSales, allExpenses, start, end);
  const prev    = calcMetrics(allSales, allExpenses, prevStart, prevEnd);

  const revPct    = getPctChange(current.revenue,    prev.revenue);
  const expPct    = getPctChange(current.expenses,   prev.expenses);
  const profitPct = getPctChange(current.profit,     prev.profit);
  const salesPct  = getPctChange(current.salesCount, prev.salesCount);

  const topProducts      = buildTopProducts(current.sales);
  const expenseBreakdown = buildExpenseBreakdown(current.periodExpenses);

  const isHourly        = period === "day" || period === "shift";
  const hourlyBreakdown = isHourly
    ? buildHourlyBreakdown(current.sales, current.periodExpenses, start, end)
    : [];
  const periodBreakdown = (!isHourly && period !== "shift")
    ? buildPeriodBreakdown(current.sales, current.periodExpenses, period as "week" | "month" | "year", start, end)
    : [];

  const activeBreakdown = isHourly ? hourlyBreakdown : periodBreakdown;
  const maxRevenue      = Math.max(...activeBreakdown.map(r => r.revenue), 1);

  const sortedSales = [...current.sales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // ── AI Summary ──────────────────────────────────────────────────────────────

  async function generateAISummary() {
    setAiLoading(true); setAiSummary(""); setAiError("");
    const storeName    = profile?.storeName ?? "my store";
    const businessType = profile?.businessType ?? "retail";
    const lang         = profile?.language ?? "en";

    const periodDesc = period === "shift" && selectedShift
      ? `Shift for ${selectedShift.employeeName} (${formatShortDateTime(selectedShift.shiftStart)} – ${selectedShift.shiftEnd ? formatShortDateTime(selectedShift.shiftEnd) : "active"})`
      : period === "day" ? formatDayLabel(selectedDate)
      : PERIOD_LABELS[period];

    const storeContext = `
Store: ${storeName} (${businessType})
Period: ${periodDesc}
Revenue: ${fmt(current.revenue)} (${revPct !== null ? (revPct >= 0 ? "+" : "") + revPct.toFixed(1) + "% vs " + prevLabel : "no prior data"})
Expenses: ${fmt(current.expenses)}
Profit: ${fmt(current.profit)} (${profitPct !== null ? (profitPct >= 0 ? "+" : "") + profitPct.toFixed(1) + "% vs " + prevLabel : "no prior data"})
Transactions: ${current.salesCount}
Avg Sale: ${fmt(current.avgSale)}
Top Products: ${topProducts.slice(0,3).map(p => `${p.name} (${p.count} sold, ${fmt(p.revenue)})`).join(", ")}
Low Stock: ${allProducts.filter(p => p.quantity <= p.lowStockThreshold).length} items
    `.trim();

    try {
      const resp = await fetch(`${API_BASE_URL}/api/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeContext, language: lang, reportPeriod: period }),
      });
      if (!resp.ok) throw new Error("Failed");
      const reader  = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) setAiSummary(p => p + data.text);
              if (data.done) break;
            } catch {}
          }
        }
      }
    } catch {
      setAiError("Could not generate summary. Check your connection.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── Sub-components ──────────────────────────────────────────────────────────

  function PctBadge({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="text-xs text-gray-400">no prior data</span>;
    const pos   = pct >= 0;
    const color = pos ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-red-600 bg-red-50 dark:bg-red-900/20";
    const Icon  = pos ? TrendingUp : TrendingDown;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
        <Icon size={11} />{pos ? "+" : ""}{pct.toFixed(1)}% vs {prevLabel}
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="text-amber-500" size={26} /> Reports
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your performance over time</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
            <Printer size={15} /> Print
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Period Tabs — Shift first */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {([
          { key: "shift", label: "Shift",  Icon: Users as ElementType },
          { key: "day",   label: "Daily",  Icon: Sun   as ElementType },
          { key: "week",  label: "Week",   Icon: null },
          { key: "month", label: "Month",  Icon: null },
          { key: "year",  label: "Year",   Icon: null },
        ] as { key: Period; label: string; Icon: ElementType | null }[]).map(({ key, label, Icon: TabIcon }) => (
          <button key={key}
            onClick={() => { setPeriod(key); setAiSummary(""); setAiError(""); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              period === key
                ? "bg-white dark:bg-gray-700 text-amber-600 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {TabIcon && <TabIcon size={14} />}{label}
          </button>
        ))}
      </div>

      {/* ── Shift Picker ─────────────────────────────────────────────────────── */}
      {period === "shift" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Users size={15} className="text-amber-500" />
            Select a shift to view its report
          </div>

          {shiftsLoading ? (
            <div className="text-sm text-gray-400 animate-pulse">Loading shifts…</div>
          ) : shifts.length === 0 ? (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No shift records found</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Go to the Employees page and clock in an employee to start tracking shifts. Shift reports are generated automatically when the employee clocks out.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {shifts.slice(0, 18).map((sh) => {
                const isActive   = sh.shiftEnd === null;
                const isSelected = sh.id === selectedShiftId;
                const duration   = formatDuration(sh.shiftStart, sh.shiftEnd);
                return (
                  <button
                    key={sh.id}
                    onClick={() => setSelectedShiftId(sh.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">{sh.employeeName}</span>
                      {isActive ? (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full shrink-0 ml-1">Active</span>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0 ml-1">{duration}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      <span>In: {formatShortDateTime(sh.shiftStart)}</span>
                      {sh.shiftEnd && <span className="ml-2">Out: {formatTime(sh.shiftEnd)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Active shift banner */}
          {selectedShift && !selectedShift.shiftEnd && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              Shift is currently active — showing live data. Report finalizes when {selectedShift.employeeName} clocks out.
            </div>
          )}
        </div>
      )}

      {/* ── Date Navigation (Daily only) ─────────────────────────────────────── */}
      {period === "day" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <button onClick={() => setSelectedDate(d => addDays(d, -1))} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 transition-colors"><ChevronLeft size={16} /></button>
            <span className="px-3 py-2 text-sm font-semibold text-gray-800 dark:text-white min-w-[120px] text-center">{formatDayLabel(selectedDate)}</span>
            <button onClick={() => setSelectedDate(d => { const n = addDays(d, 1); return n > new Date() ? d : n; })} disabled={selectedDate >= startOfDay(new Date())} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 transition-colors disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setSelectedDate(() => { const d = new Date(); d.setHours(0,0,0,0); return d; })} className="text-xs font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg transition-colors">Today</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading report data…</div>
      ) : (
        <>
          {/* Show content only when a shift is selected */}
          {period === "shift" && !selectedShift ? null : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Revenue",      value: current.revenue,    pct: revPct,    icon: <DollarSign size={18} className="text-amber-500" />  },
                  { label: "Expenses",     value: current.expenses,   pct: expPct,    icon: <TrendingDown size={18} className="text-red-500" />   },
                  { label: "Profit",       value: current.profit,     pct: profitPct, icon: <TrendingUp size={18} className="text-emerald-500" /> },
                  { label: "Transactions", value: null, count: current.salesCount, pct: salesPct, icon: <ShoppingCart size={18} className="text-blue-500" /> },
                ].map((card) => (
                  <div key={card.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">{card.icon}<span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</span></div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1.5">{card.value !== undefined && card.value !== null ? fmt(card.value) : card.count}</div>
                    <PctBadge pct={card.pct ?? null} />
                  </div>
                ))}
              </div>

              {current.salesCount > 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Average sale: <strong className="text-gray-800 dark:text-white">{fmt(current.avgSale)}</strong>
                  {prev.salesCount > 0 && <span className="ml-2">(was {fmt(prev.avgSale)} {prevLabel})</span>}
                </div>
              )}

              {/* Hourly Breakdown (Shift / Day) */}
              {isHourly && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" /> Hourly Breakdown
                    </h2>
                    {hourlyBreakdown.every(r => r.revenue === 0) ? (
                      <div className="text-center py-8 text-gray-400 text-sm">No transactions yet for this period</div>
                    ) : (
                      <div className="space-y-2">
                        {hourlyBreakdown.map((row) => (
                          <div key={row.label} className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 w-12 shrink-0 text-right font-mono">{row.label}</div>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${(row.revenue / maxRevenue) * 100}%` }} />
                              </div>
                              {row.expenseTotal > 0 && (
                                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-red-300 rounded-full transition-all duration-500" style={{ width: `${(row.expenseTotal / maxRevenue) * 100}%` }} />
                                </div>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-16 text-right">{row.revenue > 0 ? fmt(row.revenue) : "–"}</div>
                          </div>
                        ))}
                        <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-2 bg-amber-400 rounded-full" /> Revenue</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-2 bg-red-300 rounded-full" /> Expenses</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Package size={16} className="text-amber-500" /> Top Products</h2>
                    {topProducts.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No sales this period</div>
                    ) : (
                      <ol className="space-y-3">
                        {topProducts.map((p, i) => (
                          <li key={p.name} className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0"><div className="text-sm font-medium text-gray-800 dark:text-white truncate">{p.name}</div><div className="text-xs text-gray-500">{p.count} units</div></div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmt(p.revenue)}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}

              {/* Transaction List (Shift / Day) */}
              {isHourly && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><Receipt size={16} className="text-amber-500" /> Transactions</h2>
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full font-medium">{sortedSales.length} total · {fmt(current.revenue)}</span>
                  </div>
                  {sortedSales.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">No transactions recorded for this period</div>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-80 overflow-y-auto">
                      {sortedSales.map((sale) => {
                        const itemSummary = sale.items.slice(0, 2).map(i => `${i.productName} ×${i.quantity}`).join(", ");
                        const extra = sale.items.length > 2 ? ` +${sale.items.length - 2} more` : "";
                        return (
                          <div key={sale.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0"><ShoppingCart size={15} className="text-amber-500" /></div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 dark:text-white truncate">{itemSummary}{extra}</div>
                              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Clock size={10} /> {formatTime(sale.createdAt)}</div>
                            </div>
                            <div className="text-sm font-bold text-gray-800 dark:text-white">{fmt(sale.total)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Expenses (Daily only) */}
              {period === "day" && current.periodExpenses.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><TrendingDown size={16} className="text-red-500" /> Today's Expenses</h2>
                    <span className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 rounded-full font-medium">{fmt(current.expenses)} total</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {current.periodExpenses.map((exp) => (
                      <div key={exp.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium text-gray-800 dark:text-white">{exp.description}</div><div className="text-xs text-gray-400">{exp.category}</div></div>
                        <div className="text-sm font-semibold text-red-600">{fmt(exp.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Period Breakdown Chart (Week / Month / Year) */}
              {!isHourly && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                      <Calendar size={16} className="text-amber-500" />
                      {period === "week" ? "Daily Breakdown" : period === "month" ? "Weekly Breakdown" : "Monthly Breakdown"}
                    </h2>
                    {periodBreakdown.every(r => r.revenue === 0 && r.expenseTotal === 0) ? (
                      <div className="text-center py-8 text-gray-400 text-sm">No data for this period yet</div>
                    ) : (
                      <div className="space-y-2">
                        {periodBreakdown.map((row) => (
                          <div key={row.label} className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 w-28 shrink-0 text-right">{row.label}</div>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${(row.revenue / maxRevenue) * 100}%` }} /></div>
                              {row.expenseTotal > 0 && <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-red-300 rounded-full transition-all duration-500" style={{ width: `${(row.expenseTotal / maxRevenue) * 100}%` }} /></div>}
                            </div>
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-20 text-right">{row.revenue > 0 ? fmt(row.revenue) : "–"}</div>
                          </div>
                        ))}
                        <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-2 bg-amber-400 rounded-full" /> Revenue</div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-3 h-2 bg-red-300 rounded-full" /> Expenses</div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Package size={16} className="text-amber-500" /> Top Products</h2>
                    {topProducts.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No sales this period</div>
                    ) : (
                      <ol className="space-y-3">
                        {topProducts.map((p, i) => (
                          <li key={p.name} className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0"><div className="text-sm font-medium text-gray-800 dark:text-white truncate">{p.name}</div><div className="text-xs text-gray-500">{p.count} units sold</div></div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmt(p.revenue)}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}

              {/* Expense Breakdown (Week / Month / Year) */}
              {!isHourly && expenseBreakdown.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                  <h2 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><TrendingDown size={16} className="text-red-500" /> Expense Breakdown</h2>
                  <div className="space-y-3">
                    {expenseBreakdown.map((e) => (
                      <div key={e.category} className="flex items-center gap-3">
                        <div className="text-sm text-gray-600 dark:text-gray-300 w-36 shrink-0">{e.category}</div>
                        <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full transition-all duration-500" style={{ width: `${e.pct}%` }} /></div>
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-28 text-right">{fmt(e.total)} <span className="font-normal text-gray-400">({e.pct.toFixed(0)}%)</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /> AI Report Summary</h2>
                  <button onClick={generateAISummary} disabled={aiLoading} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-60">
                    {aiLoading ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Analysis</>}
                  </button>
                </div>
                {aiError && <p className="text-sm text-red-500">{aiError}</p>}
                {!aiSummary && !aiLoading && !aiError && (
                  <p className="text-sm text-gray-400">Click "Generate Analysis" to get an AI-powered breakdown of this period's performance with actionable recommendations.</p>
                )}
                {(aiSummary || aiLoading) && (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {aiSummary}
                    {aiLoading && <span className="inline-block w-1.5 h-4 bg-amber-500 animate-pulse ml-0.5 rounded-sm" />}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
