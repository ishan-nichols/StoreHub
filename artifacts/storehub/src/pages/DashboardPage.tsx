import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudSun,
  Lightbulb,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../contexts/useApp";
import LowMarginAlerts from "../components/LowMarginAlerts";
import { getDashboardSummary, getProducts, API_BASE_URL } from "../services/dataService";
import type { DashboardSummary } from "../schemas";
import { formatCurrency, formatDateTime } from "../utils";

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
    return age > REPORT_INTERVAL ? null : cache;
  } catch {
    return null;
  }
}

function setReportCache(content: string, weather: string) {
  localStorage.setItem(REPORT_KEY, JSON.stringify({ content, weather, generatedAt: new Date().toISOString() }));
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

function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, "$1")
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1");
}

function renderReport(content: string) {
  return content.split("\n").map((line, index) => {
    if (/^#{1,6}\s+/.test(line)) {
      return (
        <p key={index} className="mt-3 text-sm font-semibold text-stone-900 first:mt-0">
          {stripInlineMarkdown(line.replace(/^#{1,6}\s+/, ""))}
        </p>
      );
    }
    if (/^[-*]\s+/.test(line)) {
      return (
        <div key={index} className="flex gap-2 text-sm leading-6 text-stone-600">
          <span className="text-amber-600">•</span>
          <span>{stripInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={index} className="h-2" />;
    return (
      <p key={index} className="text-sm leading-6 text-stone-600">
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
  const [checklistDismissed, setChecklistDismissed] = useState(() => localStorage.getItem(CHECKLIST_KEY) === "1");
  const reportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!profile) return;
    Promise.all([getDashboardSummary(profile), getProducts()]).then(([dashboardSummary, products]) => {
      setSummary(dashboardSummary);
      setTotalProducts(products.length);
      setLoading(false);

      const cached = getReportCache();
      if (cached) setReport(cached);
      else void generateReport(dashboardSummary, products.length);
    });
  }, [profile]);

  function dismissChecklist() {
    localStorage.setItem(CHECKLIST_KEY, "1");
    setChecklistDismissed(true);
  }

  function buildStoreContext(currentSummary: DashboardSummary, prodCount: number) {
    if (!profile) return "";
    const lowStr = currentSummary.lowStockProducts.slice(0, 8).map((product) => `${product.name} (${product.quantity} left)`).join(", ");
    const topStr = currentSummary.topSellingItems.slice(0, 5).map((item) => `${item.name} (${item.count} sold)`).join(", ");
    const expStr = currentSummary.biggestExpenseCategories
      .slice(0, 3)
      .map((category) => `${category.category}: ${currencySymbol}${category.total.toFixed(2)}`)
      .join(", ");

    return [
      `Store: ${profile.storeName} (${profile.businessType} store)`,
      `Owner: ${profile.ownerName}`,
      `Currency: ${profile.currency} (${currencySymbol}), Tax rate: ${profile.taxRate ?? 0}%, Language: ${profile.language}`,
      `Report generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
      "",
      "TODAY'S PERFORMANCE:",
      `- Revenue: ${currencySymbol}${currentSummary.todayRevenue.toFixed(2)} (${currentSummary.todaySalesCount} sales)`,
      `- Expenses: ${currencySymbol}${currentSummary.todayExpenses.toFixed(2)}`,
      `- Profit: ${currencySymbol}${currentSummary.todayProfit.toFixed(2)}`,
      "",
      "INVENTORY STATUS:",
      `- Total products: ${prodCount}`,
      `- Low stock items (${currentSummary.lowStockProducts.length}): ${lowStr || "none"}`,
      "",
      "HISTORICAL TRENDS:",
      `- Top selling products: ${topStr || "not enough data yet"}`,
      `- Busiest days: ${currentSummary.busiestDays.slice(0, 3).map((day) => day.day).join(", ") || "not enough data yet"}`,
      `- Biggest expense categories: ${expStr || "not enough data yet"}`,
    ].join("\n");
  }

  async function generateReport(currentSummaryArg?: DashboardSummary, prodCountArg?: number) {
    const currentSummary = currentSummaryArg ?? summary;
    const currentProdCount = prodCountArg ?? totalProducts;
    if (!profile || !currentSummary) return;

    if (reportAbortRef.current) reportAbortRef.current.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;

    setReportGenerating(true);
    setReport(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeContext: buildStoreContext(currentSummary, currentProdCount),
          city: profile.storeCity ?? "",
          language: profile.language,
        }),
        signal: controller.signal,
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
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as { content?: string; weather?: string; done?: boolean };
            if (parsed.content) {
              fullContent += parsed.content;
              setReport((previous) => ({
                content: fullContent,
                weather: previous?.weather ?? "",
                generatedAt: previous?.generatedAt ?? new Date().toISOString(),
              }));
            }
            if (parsed.weather !== undefined) finalWeather = parsed.weather;
            if (parsed.done) {
              setReportCache(fullContent, finalWeather);
              setReport({ content: fullContent, weather: finalWeather, generatedAt: new Date().toISOString() });
            }
          } catch {
            // Skip malformed chunks without interrupting the stream.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setReport({
          content: "Could not generate the business report. Please check that the API server is running.",
          weather: "",
          generatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setReportGenerating(false);
    }
  }

  if (loading || !summary) {
    return <div className="py-16 text-center text-sm text-stone-400">Loading dashboard…</div>;
  }

  const isNewUser = profile?.createdAt ? Date.now() - new Date(profile.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000 : false;
  const showInsights = profile?.createdAt ? Date.now() - new Date(profile.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000 : false;
  const firstName = profile?.ownerName?.split(" ")[0] || "there";
  const stockOuts = profile?.stockOuts ?? [];
  const painPoints = profile?.painPoints ?? [];

  const checklist = [
    totalProducts > 0 ? { text: "Add products to inventory", done: true } : { text: "Add your first product", done: false },
    summary.todaySalesCount > 0 ? { text: "Complete a sale in POS", done: true } : { text: "Make your first sale", done: false },
    summary.todayExpenses > 0 ? { text: "Log an expense", done: true } : { text: "Record your first expense", done: false },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="glass-panel premium-grid relative overflow-hidden rounded-[36px] px-6 py-7 md:px-8 md:py-8">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Daily overview</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-5xl">
              Good {getGreeting()}, {firstName}.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 md:text-lg">
              Here is the cleanest view of your store right now, from revenue and stock risk to the next action worth taking.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Pill text={`${totalProducts} products tracked`} />
              <Pill text={`${summary.lowStockProducts.length} low-stock alerts`} />
              <Pill text={`${summary.todaySalesCount} sales today`} />
            </div>
          </div>

          <div className="soft-panel rounded-[30px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Right now</p>
            <div className="mt-4 space-y-4">
              <MiniMetric label="Revenue today" value={formatCurrency(summary.todayRevenue, currencySymbol)} tone="emerald" />
              <MiniMetric label="Profit today" value={formatCurrency(summary.todayProfit, currencySymbol)} tone={summary.todayProfit >= 0 ? "amber" : "rose"} />
              <MiniMetric label="Items needing attention" value={String(summary.lowStockProducts.length)} tone="stone" />
            </div>
          </div>
        </div>
      </section>

      {isNewUser && !checklistDismissed && (
        <section className="rounded-[32px] bg-stone-950 px-6 py-6 text-white shadow-xl shadow-stone-900/10 md:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">Getting started</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Your setup is ready. These are the next best steps.</h2>
            </div>
            <button onClick={dismissChecklist} className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/15">
              Dismiss
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {checklist.map((item) => (
              <div key={item.text} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"}`}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div className={`text-sm font-medium ${item.done ? "text-white/60 line-through" : "text-white"}`}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
          {(stockOuts.length > 0 || painPoints.includes("employees")) && (
            <div className="mt-4 space-y-1 text-sm text-white/70">
              {stockOuts.length > 0 && <p>You flagged {stockOuts.length} stock-out concern{stockOuts.length > 1 ? "s" : ""}. Inventory is already watching them.</p>}
              {painPoints.includes("employees") && <p>Your employee portal is ready to share whenever your team needs it.</p>}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={t.dashboard.todayRevenue}
          value={formatCurrency(summary.todayRevenue, currencySymbol)}
          detail={`${summary.todaySalesCount} sale${summary.todaySalesCount === 1 ? "" : "s"} today`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="emerald"
        />
        <MetricCard
          title={t.dashboard.todayExpenses}
          value={formatCurrency(summary.todayExpenses, currencySymbol)}
          detail="Costs logged today"
          icon={<TrendingDown className="h-5 w-5" />}
          tone="rose"
        />
        <MetricCard
          title={t.dashboard.todayProfit}
          value={formatCurrency(summary.todayProfit, currencySymbol)}
          detail={summary.todayProfit >= 0 ? "Running positive" : "Below target today"}
          icon={summary.todayProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          tone={summary.todayProfit >= 0 ? "amber" : "stone"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="soft-panel rounded-[32px] p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-stone-950">AI business brief</h2>
              <p className="text-sm text-stone-500">A plain-English summary of how the store is doing and what deserves attention.</p>
            </div>
            <button
              onClick={() => void generateReport()}
              disabled={reportGenerating}
              className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={reportGenerating ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {report?.weather && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
              <CloudSun size={16} className="mt-0.5 shrink-0" />
              <span>{report.weather}</span>
            </div>
          )}

          <div className="mt-5 rounded-[28px] bg-[#fbfaf7] p-5">
            {!profile?.storeCity && !report?.content && !reportGenerating && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Add your store city in Settings to get weather-aware recommendations here.
              </div>
            )}
            {reportGenerating && !report?.content ? (
              <div className="flex items-center gap-3 py-4 text-sm text-stone-500">
                <RefreshCw size={16} className="animate-spin text-amber-600" />
                Generating your latest business brief…
              </div>
            ) : report?.content ? (
              <>
                <div className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
                  Updated {timeAgo(report.generatedAt)}
                </div>
                <div className="space-y-1">{renderReport(report.content)}</div>
              </>
            ) : (
              <div className="text-sm text-stone-500">Your business brief will appear here once the API server is available.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[32px] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-stone-950">{t.dashboard.lowStockAlerts}</h2>
                <p className="text-sm text-stone-500">The items most likely to interrupt sales if ignored.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {summary.lowStockProducts.length === 0 ? (
                <EmptyHint text="You are clear here. No low-stock items right now." />
              ) : (
                summary.lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbfaf7] px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">{product.name}</div>
                      <div className="text-xs text-stone-500">Threshold: {product.lowStockThreshold}</div>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">{product.quantity} left</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="soft-panel rounded-[32px] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <ArrowRight size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-stone-950">{t.dashboard.recentSales}</h2>
                <p className="text-sm text-stone-500">The latest purchases coming through your register.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {summary.recentSales.length === 0 ? (
                <EmptyHint text="No recent sales yet. Once sales come in, they will appear here." />
              ) : (
                summary.recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbfaf7] px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-stone-900">{sale.items.length} item{sale.items.length === 1 ? "" : "s"}</div>
                      <div className="text-xs text-stone-500">{formatDateTime(sale.createdAt)}</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-700">{formatCurrency(sale.total, currencySymbol)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <LowMarginAlerts />

      {summary.smartTips.length > 0 && (
        <section className="rounded-[32px] bg-amber-50 px-6 py-6 ring-1 ring-amber-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Lightbulb size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-950">Smart tips</h2>
              <p className="text-sm text-stone-600">Small suggestions that can save time or recover margin.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.smartTips.map((tip) => (
              <div key={tip} className="rounded-[24px] bg-white/80 px-4 py-4 text-sm leading-6 text-stone-700 shadow-sm">
                {tip}
              </div>
            ))}
          </div>
        </section>
      )}

      {showInsights && (
        <section className="soft-panel rounded-[32px] p-6">
          <h2 className="text-lg font-semibold text-stone-950">{t.dashboard.insights}</h2>
          <p className="mt-1 text-sm text-stone-500">A simple snapshot of the patterns StoreHub has picked up over time.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <InsightColumn title="Top items" values={summary.topSellingItems.slice(0, 3).map((item) => `${item.name} (${item.count})`)} />
            <InsightColumn title="Busiest days" values={summary.busiestDays.slice(0, 3).map((day) => day.day)} />
            <InsightColumn title="Largest expenses" values={summary.biggestExpenseCategories.slice(0, 3).map((category) => category.category)} />
          </div>
        </section>
      )}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function Pill({ text }: { text: string }) {
  return <span className="rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm text-stone-600 shadow-sm">{text}</span>;
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "rose" | "stone" }) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    stone: "bg-stone-100 text-stone-700",
  };
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#fbfaf7] px-4 py-3">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`rounded-full px-3 py-1 text-sm font-semibold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "amber" | "stone";
}) {
  const toneMap: Record<string, string> = {
    emerald: "from-emerald-50 to-white text-emerald-700",
    rose: "from-rose-50 to-white text-rose-700",
    amber: "from-amber-50 to-white text-amber-700",
    stone: "from-stone-100 to-white text-stone-700",
  };
  return (
    <div className="soft-panel rounded-[30px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">{title}</p>
          <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{value}</div>
          <p className="mt-2 text-sm text-stone-500">{detail}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${toneMap[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-2xl bg-[#fbfaf7] px-4 py-5 text-sm text-stone-500">{text}</div>;
}

function InsightColumn({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-[24px] bg-[#fbfaf7] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{title}</div>
      <div className="mt-3 space-y-2">
        {values.length === 0 ? (
          <div className="text-sm text-stone-500">Not enough data yet.</div>
        ) : (
          values.map((value) => (
            <div key={value} className="text-sm font-medium text-stone-800">
              {value}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
