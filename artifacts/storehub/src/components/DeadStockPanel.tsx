import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  Bot,
  CheckCircle2,
  Gift,
  Package,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { getProducts, getSales } from "../services/dataService";
import {
  analyzeDeadStock,
  markActionTaken,
  generateClaudeAction,
  type DeadStockItem,
  type DeadStockSummary,
} from "../services/deadStockService";
import type { Product, Sale } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "dead" | "slow";
type SortMode = "cash" | "days";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCash(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never sold";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function StatusBadge({ item }: { item: DeadStockItem }) {
  const days = item.daysSinceLastSale < 0 ? "Never" : `${item.daysSinceLastSale}d`;
  if (item.status === "dead") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        <XCircle size={11} />
        DEAD {days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
      <AlertTriangle size={11} />
      SLOW {days}
    </span>
  );
}

// ─── Action button configs ─────────────────────────────────────────────────────

const ACTION_CONFIG = {
  markdown: {
    icon: <ArrowDownCircle size={14} />,
    label: (pct?: number) => `Mark down ${pct ?? 30}%`,
    cls: "bg-amber-500 text-white hover:bg-amber-600",
  },
  bundle: {
    icon: <Gift size={14} />,
    label: () => "Bundle deal",
    cls: "bg-blue-500 text-white hover:bg-blue-600",
  },
  return: {
    icon: <RotateCcw size={14} />,
    label: () => "Return to supplier",
    cls: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  stop_reorder: {
    icon: <Package size={14} />,
    label: () => "Stop reordering",
    cls: "bg-stone-200 text-stone-700 hover:bg-stone-300",
  },
} as const;

// ─── Individual product card ──────────────────────────────────────────────────

function DeadStockCard({ item }: { item: DeadStockItem }) {
  const [claudeText, setClaudeText] = useState("");
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [resolvedCash, setResolvedCash] = useState("");
  const [resolved, setResolved] = useState(false);
  const [showActionNote, setShowActionNote] = useState(false);

  const action = item.suggestedAction;
  const cfg = ACTION_CONFIG[action];

  async function handleAskClaude() {
    if (claudeLoading) return;
    setClaudeText("");
    setClaudeOpen(true);
    setClaudeLoading(true);
    await generateClaudeAction(
      item,
      (chunk) => setClaudeText((prev) => prev + chunk),
      () => setClaudeLoading(false),
    );
  }

  function handleResolve() {
    const cash = parseFloat(resolvedCash.replace(/[^0-9.]/g, "")) || 0;
    markActionTaken(item.productId, cash);
    setResolved(true);
    setShowResolve(false);
  }

  if (resolved) {
    return (
      <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-sm flex items-center gap-3">
        <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">{item.productName} marked as resolved</p>
          <p className="text-xs text-emerald-600 mt-0.5">Cash recovery logged. Great work!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-stone-900 truncate">{item.productName}</h3>
          <span className="text-xs text-stone-400">{item.category}</span>
        </div>
        <StatusBadge item={item} />
      </div>

      {/* Cash tied up */}
      <div className="rounded-2xl bg-stone-50 px-4 py-3">
        <p className="text-2xl font-bold tracking-tight text-stone-900">
          {formatCash(item.cashTiedUp)}
          <span className="ml-2 text-sm font-normal text-stone-400">tied up</span>
        </p>
        <p className="text-xs text-stone-400 mt-1">
          {item.quantity} units &times; {formatCash(item.costPrice)} cost
        </p>
      </div>

      {/* Last sold */}
      <p className="text-sm text-stone-500">
        Last sold:{" "}
        <span className="font-medium text-stone-700">
          {item.daysSinceLastSale < 0 ? "Never sold" : formatDate(item.lastSoldDate)}
        </span>
      </p>

      {/* Suggested action */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowActionNote((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold transition ${cfg.cls}`}
        >
          {cfg.icon}
          {cfg.label(item.suggestedMarkdownPct)}
        </button>

        <button
          onClick={() => void handleAskClaude()}
          disabled={claudeLoading}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
        >
          <Bot size={13} />
          Ask Claude
        </button>

        <button
          onClick={() => setShowResolve((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          <CheckCircle2 size={13} />
          Mark resolved
        </button>
      </div>

      {/* Action note */}
      {showActionNote && (
        <div className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          {action === "markdown" && (
            <p>
              Reduce the price by {item.suggestedMarkdownPct ?? 30}% to move inventory quickly.
              Consider a weekend flash sale or in-store signage highlighting the discount.
            </p>
          )}
          {action === "bundle" && (
            <p>
              Pair this with a complementary product and offer a combo deal.
              Bundling can increase perceived value while clearing dead stock.
            </p>
          )}
          {action === "return" && (
            <p>
              Contact your supplier about a return or credit arrangement.
              Many suppliers will accept returns for slow-moving stock.
            </p>
          )}
          {action === "stop_reorder" && (
            <p>
              Stop placing new orders for this item. Let current stock deplete naturally
              and redirect shelf space to better-performing products.
            </p>
          )}
        </div>
      )}

      {/* Resolve form */}
      {showResolve && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 flex flex-col gap-3">
          <p className="text-sm font-medium text-emerald-800">How much cash did you recover?</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={resolvedCash}
              onChange={(e) => setResolvedCash(e.target.value)}
              placeholder="$0"
              className="flex-1 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              onClick={handleResolve}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowResolve(false)}
              className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-500 hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Claude streaming response */}
      {claudeOpen && (
        <div className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 mb-2 flex items-center gap-1">
            <Bot size={11} />
            Claude's advice
            {claudeLoading && (
              <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            )}
          </p>
          {claudeText ? (
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
              {claudeText}
            </p>
          ) : (
            <p className="text-sm text-stone-400 italic">Thinking…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeadStockPanel() {
  const [summary, setSummary] = useState<DeadStockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("cash");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [products, sales] = await Promise.all([
        getProducts() as Promise<Product[]>,
        getSales() as Promise<Sale[]>,
      ]);
      const result = analyzeDeadStock(products, sales);
      setSummary(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm animate-pulse"
          >
            <div className="h-5 w-40 rounded bg-stone-200 mb-3" />
            <div className="h-10 w-48 rounded bg-stone-100 mb-3" />
            <div className="h-4 w-full rounded bg-stone-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!summary || summary.items.length === 0) {
    return (
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-10 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] bg-emerald-50 text-emerald-500">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">No dead stock detected</h2>
        <p className="text-stone-500 text-sm max-w-md mx-auto">
          Every product has sold within the last 30 days. Keep it up — active inventory means
          healthy cash flow.
        </p>
      </div>
    );
  }

  // Apply filter + sort
  const filtered = summary.items
    .filter((item) => {
      if (filter === "dead") return item.status === "dead";
      if (filter === "slow") return item.status === "slow";
      return true;
    })
    .sort((a, b) => {
      if (sort === "cash") return b.cashTiedUp - a.cashTiedUp;
      // sort by days inactive — "never sold" (-1) treated as 9999
      const dA = a.daysSinceLastSale < 0 ? 9999 : a.daysSinceLastSale;
      const dB = b.daysSinceLastSale < 0 ? 9999 : b.daysSinceLastSale;
      return dB - dA;
    });

  const filterOptions: { id: FilterMode; label: string }[] = [
    { id: "all", label: "All" },
    { id: "dead", label: `Dead (60d+)` },
    { id: "slow", label: `Slow (30-59d)` },
  ];

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: "cash", label: "By cash tied up" },
    { id: "days", label: "By days inactive" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary banner */}
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-1">
              Total cash tied up
            </p>
            <p className={`text-4xl font-bold tracking-tight ${summary.totalCashTiedUp > 1000 ? "text-red-600" : "text-amber-600"}`}>
              {formatCash(summary.totalCashTiedUp)}
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-stone-400 mb-1">Dead stock</p>
              <p className="text-2xl font-bold text-red-600">{summary.deadCount}</p>
            </div>
            <div>
              <p className="text-stone-400 mb-1">Slow moving</p>
              <p className="text-2xl font-bold text-amber-500">{summary.slowCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1.5 rounded-[32px] bg-stone-100 p-1.5">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`rounded-[24px] px-5 py-2.5 text-sm font-semibold transition ${
                filter === opt.id
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 rounded-[32px] bg-stone-100 p-1.5">
          {sortOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSort(opt.id)}
              className={`rounded-[24px] px-5 py-2.5 text-sm font-semibold transition ${
                sort === opt.id
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product cards */}
      {filtered.length === 0 ? (
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-10 text-center shadow-sm">
          <p className="text-stone-400 text-sm">No items match this filter.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <DeadStockCard key={item.productId} item={item} />
          ))}
        </div>
      )}

      {/* Recovered cash banner */}
      {summary.recoveredCash > 0 && (
        <div className="flex items-center gap-3 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800">
            <strong>You've recovered {formatCash(summary.recoveredCash)}</strong> from dead stock
            actions. Great job turning stuck inventory into cash.
          </p>
        </div>
      )}
    </div>
  );
}
