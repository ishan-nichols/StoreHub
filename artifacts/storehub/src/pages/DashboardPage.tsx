import { useEffect, useState, useRef } from "react";
import { useApp } from "../contexts/useApp";
import { getDashboardSummary, getProducts, API_BASE_URL } from "../services/dataService";
import type { DashboardSummary, Product } from "../schemas";
import { formatCurrency, formatDateTime } from "../utils";
import LowMarginAlerts from "../components/LowMarginAlerts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb,
  ShoppingBag, Clock, Sparkles, RefreshCw, CloudSun, ChevronDown, ChevronUp,
  X, CheckCircle2
} from "lucide-react";

const CHECKLIST_KEY = "storehub_checklist_dismissed";

const REPORT_KEY = "storehub_ai_report";
const REPORT_INTERVAL = 4 * 60 * 60 * 1000;

interface ReportCache {
  content: string;
  weather: string;
  generatedAt: string;
}

function getReportCache(): ReportCache | null {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as ReportCache;
    const age = Date.now() - new Date(cache.generatedAt).getTime();
    if (age > REPORT_INTERVAL) return null;
    return cache;
  } catch {
    return null;
  }
}

function setReportCache(content: string, weather: string) {
  localStorage.setItem(
    REPORT_KEY,
    JSON.stringify({ content, weather, generatedAt: new Date().toISOString() })
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, "$1")
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1");
}

function renderReport(content: string) {
  return content.split("\n").map((line, i) => {
    if (/^#{1,6}\s+/.test(line)) {
      return (
        <p key={i} className="font-bold text-gray-800 dark:text-gray-100 text-sm mt-3 mb-1 first:mt-0">
          {stripInlineMarkdown(line.replace(/^#{1,6}\s+/, ""))}
        </p>
      );
    }
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      const text = line.startsWith("• ") ? line.slice(2) : line.slice(2);
      return (
        <div key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <span className="shrink-0 text-amber-500">•</span>
          <span>{stripInlineMarkdown(text)}</span>
        </div>
      );
    }
    if (line.trim() === "") {
      return <div key={i} className="h-1" />;
    }
    return (
      <p key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {stripInlineMarkdown(line)}
      </p>
    );
  });
}

export default function DashboardPage() {
  const { profile, t, currencySymbol } = useApp();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);

  const [report, setReport] = useState<ReportCache | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(true);
  const reportAbortRef = useRef<AbortController | null>(null);

  const [checklistDismissed, setChecklistDismissed] = useState(() => localStorage.getItem(CHECKLIST_KEY) === "1");

  function dismissChecklist() {
    localStorage.setItem(CHECKLIST_KEY, "1");
    setChecklistDismissed(true);
  }

  const showInsights =
    profile?.createdAt &&
    new Date().getTime() - new Date(profile.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (!profile) return;
    Promise.all([getDashboardSummary(profile), getProducts()]).then(([s, prods]) => {
      setSummary(s);
      setTotalProducts(prods.length);
      setLoading(false);

      const cached = getReportCache();
      if (cached) {
        setReport(cached);
      } else {
        generateReport(s, prods.length);
      }
    });
  }, [profile]);

  function buildStoreContext(s: DashboardSummary, prodCount: number) {
    if (!profile) return "";
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const lowStr = s.lowStockProducts.slice(0, 8).map((p) => `${p.name} (${p.quantity} left)`).join(", ");
    const topStr = s.topSellingItems.slice(0, 5).map((i) => `${i.name} (${i.count} sold)`).join(", ");
    const expStr = s.biggestExpenseCategories.slice(0, 3).map((c) => `${c.category}: ${currencySymbol}${c.total.toFixed(2)}`).join(", ");
    return [
      `Store: ${profile.storeName} (${profile.businessType} store)`,
      `Owner: ${profile.ownerName}`,
      `Currency: ${profile.currency} (${currencySymbol}), Tax rate: ${profile.taxRate ?? 0}%, Language: ${profile.language}`,
      `Report generated: ${today}`,
      ``,
      `TODAY'S PERFORMANCE:`,
      `- Revenue: ${currencySymbol}${s.todayRevenue.toFixed(2)} (${s.todaySalesCount} sales)`,
      `- Expenses: ${currencySymbol}${s.todayExpenses.toFixed(2)}`,
      `- Profit: ${currencySymbol}${s.todayProfit.toFixed(2)}`,
      ``,
      `INVENTORY STATUS:`,
      `- Total products: ${prodCount}`,
      `- Low stock items (${s.lowStockProducts.length}): ${lowStr || "none"}`,
      ``,
      `HISTORICAL TRENDS:`,
      `- Top selling products: ${topStr || "not enough data yet"}`,
      `- Busiest days: ${s.busiestDays.slice(0, 3).map((d) => d.day).join(", ") || "not enough data yet"}`,
      `- Biggest expense categories: ${expStr || "not enough data yet"}`,
    ].join("\n");
  }

  async function generateReport(s?: DashboardSummary, prodCount?: number) {
    const currentSummary = s ?? summary;
    const currentProdCount = prodCount ?? totalProducts;
    if (!profile || !currentSummary) return;

    if (reportAbortRef.current) reportAbortRef.current.abort();
    const ctrl = new AbortController();
    reportAbortRef.current = ctrl;

    setReportGenerating(true);
    setReport(null);

    const storeContext = buildStoreContext(currentSummary, currentProdCount);

    try {
      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeContext,
          city: profile.storeCity ?? "",
          language: profile.language,
        }),
        signal: ctrl.signal,
      });

      if (!response.ok || !response.body) throw new Error("Failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let finalWeather = "";

      setReport({ content: "", weather: "", generatedAt: new Date().toISOString() });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as {
                content?: string;
                weather?: string;
                done?: boolean;
                error?: string;
              };
              if (parsed.content) {
                fullContent += parsed.content;
                setReport((prev) => ({
                  content: fullContent,
                  weather: prev?.weather ?? "",
                  generatedAt: prev?.generatedAt ?? new Date().toISOString(),
                }));
              }
              if (parsed.weather !== undefined) {
                finalWeather = parsed.weather;
              }
              if (parsed.done) {
                setReportCache(fullContent, finalWeather);
                setReport({ content: fullContent, weather: finalWeather, generatedAt: new Date().toISOString() });
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setReport({
          content: "Could not generate report. Please check that the API server is running.",
          weather: "",
          generatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setReportGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  const s = summary!;

  const isNewUser = profile?.createdAt
    ? new Date().getTime() - new Date(profile.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
    : false;

  const STORE_EMOJI: Record<string, string> = {
    cstore: "⛽", grocery: "🛒", butcher: "🥩", bakery: "🍞",
    liquor: "🥃", clothing: "👗", restaurant: "🍽️", pharmacy: "💊",
    general: "🏪", other: "🏪",
  };

  const painPoints  = profile?.painPoints ?? [];
  const stockOuts   = profile?.stockOuts   ?? [];
  const storeEmoji  = STORE_EMOJI[profile?.businessType ?? "general"] ?? "🏪";

  const checklist: { icon: string; text: string; done: boolean }[] = [];
  if (totalProducts > 0)                  checklist.push({ icon: "📦", text: "Add products to Inventory",     done: true  });
  else                                    checklist.push({ icon: "📦", text: "Add your first product",         done: false });
  if (s.todaySalesCount > 0)              checklist.push({ icon: "💰", text: "Make a sale with the POS",       done: true  });
  else                                    checklist.push({ icon: "💰", text: "Make your first sale",           done: false });
  if (s.todayExpenses > 0)               checklist.push({ icon: "🧾", text: "Log an expense",                done: true  });
  else                                   checklist.push({ icon: "🧾", text: "Log your first expense",         done: false });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Good {getGreeting()}, {profile?.ownerName?.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{storeEmoji} {profile?.storeName} • Today's overview</p>
      </div>

      {/* Getting Started Panel — first 7 days */}
      {isNewUser && !checklistDismissed && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 text-white relative overflow-hidden">
          <button
            onClick={dismissChecklist}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="pr-6">
            <p className="text-xs font-bold text-amber-100 uppercase tracking-widest mb-1">Getting started</p>
            <h3 className="text-lg font-bold mb-3">
              {profile?.storeName} is set up — here's what to do first
            </h3>
            <div className="space-y-2">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-white/30" : "border-2 border-white/50"}`}>
                    {item.done && <CheckCircle2 size={14} />}
                  </div>
                  <span className={`text-sm font-medium ${item.done ? "line-through text-white/60" : "text-white"}`}>
                    {item.icon} {item.text}
                  </span>
                </div>
              ))}
            </div>
            {stockOuts.length > 0 && (
              <p className="text-xs text-amber-100 mt-3">
                💡 You flagged <strong>{stockOuts.length} item type{stockOuts.length > 1 ? "s" : ""}</strong> as frequently running out — check Inventory for low-stock alerts.
              </p>
            )}
            {painPoints.includes("employees") && (
              <p className="text-xs text-amber-100 mt-1">
                💡 Employee clock-in is ready — share the Employee Portal link with your team.
              </p>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title={t.dashboard.todayRevenue}
          value={formatCurrency(s.todayRevenue, currencySymbol)}
          icon={<TrendingUp size={20} className="text-emerald-500" />}
          color="emerald"
          sub={`${s.todaySalesCount} sale${s.todaySalesCount !== 1 ? "s" : ""}`}
        />
        <KpiCard
          title={t.dashboard.todayExpenses}
          value={formatCurrency(s.todayExpenses, currencySymbol)}
          icon={<TrendingDown size={20} className="text-rose-500" />}
          color="rose"
        />
        <KpiCard
          title={t.dashboard.todayProfit}
          value={formatCurrency(s.todayProfit, currencySymbol)}
          icon={
            s.todayProfit >= 0 ? (
              <TrendingUp size={20} className="text-amber-500" />
            ) : (
              <TrendingDown size={20} className="text-red-500" />
            )
          }
          color={s.todayProfit >= 0 ? "amber" : "red"}
        />
      </div>

      {/* AI Business Report */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-amber-200 dark:border-amber-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border-b border-amber-100 dark:border-amber-800/50">
          <Sparkles size={16} className="text-amber-600 flex-shrink-0" />
          <h2 className="font-semibold text-amber-800 dark:text-amber-200 flex-1">AI Business Report</h2>
          <div className="flex items-center gap-2 ml-auto">
            {report?.generatedAt && !reportGenerating && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {timeAgo(report.generatedAt)} • refreshes every 4h
              </span>
            )}
            <button
              onClick={() => generateReport()}
              disabled={reportGenerating}
              className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800/30 text-amber-600 dark:text-amber-400 transition-colors disabled:opacity-40"
              title="Refresh report"
            >
              <RefreshCw size={14} className={reportGenerating ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setReportExpanded((e) => !e)}
              className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800/30 text-amber-600 dark:text-amber-400 transition-colors"
            >
              {reportExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {reportExpanded && (
          <div className="p-5">
            {report?.weather && (
              <div className="flex items-start gap-2 text-xs text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 rounded-xl px-3 py-2 mb-4">
                <CloudSun size={14} className="shrink-0 mt-0.5" />
                <span>{report.weather}</span>
              </div>
            )}
            {reportGenerating && !report?.content && (
              <div className="flex items-center gap-3 py-4 text-sm text-gray-400">
                <RefreshCw size={16} className="animate-spin text-amber-500" />
                Generating your personalized business report...
              </div>
            )}
            {!profile?.storeCity && !report?.content && !reportGenerating && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mb-3">
                Tip: Add your city in Settings to get weather-aware suggestions in your reports.
              </div>
            )}
            {report?.content && (
              <div className="space-y-0.5">{renderReport(report.content)}</div>
            )}
          </div>
        )}
      </div>

      <LowMarginAlerts />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t.dashboard.lowStockAlerts}</h2>
            {s.lowStockProducts.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {s.lowStockProducts.length}
              </span>
            )}
          </div>
          {s.lowStockProducts.length === 0 ? (
            <p className="text-sm text-gray-400">{t.dashboard.noAlerts}</p>
          ) : (
            <ul className="space-y-2">
              {s.lowStockProducts.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{p.name}</span>
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                    {p.quantity} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Sales */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t.dashboard.recentSales}</h2>
          </div>
          {s.recentSales.length === 0 ? (
            <p className="text-sm text-gray-400">{t.dashboard.noRecentSales}</p>
          ) : (
            <ul className="space-y-2">
              {s.recentSales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-400">{formatDateTime(sale.createdAt)}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">
                    {formatCurrency(sale.total, currencySymbol)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Smart Tips */}
      {s.smartTips.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">Smart Tips</h2>
          </div>
          <ul className="space-y-2">
            {s.smartTips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                <span className="shrink-0 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Insights Card (after 7 days) */}
      {showInsights && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t.dashboard.insights}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {s.topSellingItems.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top Items</div>
                {s.topSellingItems.slice(0, 3).map((item, i) => (
                  <div key={i} className="text-sm text-gray-700 dark:text-gray-200 py-1">
                    {i + 1}. {item.name}
                    <span className="text-gray-400 ml-1">({item.count})</span>
                  </div>
                ))}
              </div>
            )}
            {s.busiestDays.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Busiest Days</div>
                {s.busiestDays.map((d, i) => (
                  <div key={i} className="text-sm text-gray-700 dark:text-gray-200 py-1">
                    {i + 1}. {d.day}
                  </div>
                ))}
              </div>
            )}
            {s.biggestExpenseCategories.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top Expenses</div>
                {s.biggestExpenseCategories.slice(0, 3).map((c, i) => (
                  <div key={i} className="text-sm text-gray-700 dark:text-gray-200 py-1">
                    {i + 1}. {c.category}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function KpiCard({ title, value, icon, color, sub }: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  const bgColors: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-900/20",
    rose: "bg-rose-50 dark:bg-rose-900/20",
    amber: "bg-amber-50 dark:bg-amber-900/20",
    red: "bg-red-50 dark:bg-red-900/20",
  };
  return (
    <div className={`${bgColors[color] ?? "bg-gray-50"} rounded-2xl p-5 border border-transparent`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

