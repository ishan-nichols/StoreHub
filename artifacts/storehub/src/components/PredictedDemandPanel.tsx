import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  generatePredictions,
  recalculatePredictions,
  getPredictionAlerts,
  predictionsAge,
  type ProductPrediction,
} from "../services/predictionsService";

// ─── Urgency helpers ──────────────────────────────────────────────────────────

const URGENCY_ORDER: Record<ProductPrediction["urgency"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const URGENCY_BADGE: Record<
  ProductPrediction["urgency"],
  { label: string; cls: string }
> = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700" },
  high: { label: "High", cls: "bg-amber-100 text-amber-700" },
  medium: { label: "Medium", cls: "bg-blue-100 text-blue-700" },
  low: { label: "Low", cls: "bg-stone-100 text-stone-600" },
};

type FilterUrgency = "all" | ProductPrediction["urgency"];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniBarChart({ breakdown }: { breakdown: number[] }) {
  const max = Math.max(...breakdown, 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {breakdown.map((val, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
          <div
            className="w-full rounded-t bg-amber-400 transition-all"
            style={{ height: `${Math.round((val / max) * 32)}px`, minHeight: val > 0 ? 3 : 0 }}
          />
          <span className="text-[9px] text-stone-400 leading-none">{DAY_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="h-5 w-40 rounded bg-stone-200 mb-2" />
          <div className="h-4 w-24 rounded bg-stone-100" />
        </div>
        <div className="h-6 w-16 rounded-full bg-stone-100" />
      </div>
      <div className="h-4 w-full rounded bg-stone-100 mb-3" />
      <div className="flex gap-1 h-10 mb-3">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex-1 rounded bg-stone-100" />
        ))}
      </div>
      <div className="h-4 w-48 rounded bg-stone-100" />
    </div>
  );
}

function PredictionCard({ prediction }: { prediction: ProductPrediction }) {
  const [expanded, setExpanded] = useState(false);
  const badge = URGENCY_BADGE[prediction.urgency];

  const orderDate = new Date(prediction.orderByDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToOrder = Math.ceil(
    (orderDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const orderUrgent = daysToOrder <= 2;

  const orderFormatted = orderDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const dailyBreakdown =
    Array.isArray(prediction.dailyBreakdown) && prediction.dailyBreakdown.length === 7
      ? prediction.dailyBreakdown
      : [0, 0, 0, 0, 0, 0, 0];

  return (
    <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-stone-900 truncate">{prediction.productName}</h3>
          <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full mt-1 inline-block">
            {prediction.category}
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Stock vs Demand */}
      <div className="flex gap-4 mb-4 text-sm">
        <div>
          <span className="text-stone-400">Stock</span>
          <span className="ml-2 font-semibold text-stone-900">{prediction.currentStock} units</span>
        </div>
        <div className="text-stone-200">|</div>
        <div>
          <span className="text-stone-400">Demand</span>
          <span className="ml-2 font-semibold text-stone-900">{prediction.predictedDemand7d} units</span>
          <span className="ml-1 text-stone-400 text-xs">(7 days)</span>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div className="mb-4">
        <MiniBarChart breakdown={dailyBreakdown} />
      </div>

      {/* Order info */}
      <div className="flex flex-wrap gap-4 text-sm mb-4">
        <div>
          <span className="text-stone-400">Order qty</span>
          <span className="ml-2 font-bold text-stone-900">{prediction.recommendedOrderQty} units</span>
        </div>
        <div>
          <span className="text-stone-400">Order by</span>
          <span
            className={`ml-2 font-semibold ${orderUrgent ? "text-red-600" : "text-stone-700"}`}
          >
            {orderFormatted}
            {orderUrgent && <span className="ml-1 text-xs">(urgent!)</span>}
          </span>
        </div>
        <div>
          <span className="text-stone-400">Stockout in</span>
          <span className={`ml-2 font-semibold ${prediction.daysUntilStockout <= 3 ? "text-red-600" : "text-stone-700"}`}>
            {prediction.daysUntilStockout}d
          </span>
        </div>
      </div>

      {/* Reasoning — expandable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? "Hide reasoning" : "Why Claude thinks this"}
      </button>
      {expanded && (
        <p className="mt-2 text-sm text-stone-600 leading-relaxed border-t border-stone-100 pt-2">
          {prediction.reasoning}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PredictedDemandPanel() {
  const [predictions, setPredictions] = useState<ProductPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState<string | null>(predictionsAge());
  const [filter, setFilter] = useState<FilterUrgency>("all");
  const [eventContext, setEventContext] = useState("");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick age display every minute
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      setAge(predictionsAge());
    }, 60_000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePredictions(force);
      setPredictions(result);
      setAge(predictionsAge());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculate() {
    if (!eventContext.trim()) return;
    setRecalcLoading(true);
    setError(null);
    try {
      const result = await recalculatePredictions(eventContext.trim());
      setPredictions(result);
      setAge(predictionsAge());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRecalcLoading(false);
    }
  }

  // Filter + sort
  const visible = predictions
    .filter((p) => filter === "all" || p.urgency === filter)
    .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  const alerts = getPredictionAlerts(predictions);
  const criticalAlerts = alerts.filter((p) => p.urgency === "critical");

  const filterOptions: { id: FilterUrgency; label: string }[] = [
    { id: "all", label: "All" },
    { id: "critical", label: "Critical" },
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
  ];

  // ── Empty state (never loaded) ─────────────────────────────────────────────
  if (!loading && predictions.length === 0 && !error) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-10 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] bg-amber-50 text-amber-500">
            <Sparkles size={24} />
          </div>
          <h2 className="text-xl font-semibold text-stone-900 mb-2">
            Predict what you'll need — before you run out
          </h2>
          <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
            Claude analyzes your 60-day sales history, seasonality, and upcoming holidays to tell
            you exactly what to reorder and when.
          </p>
          <button
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            <Sparkles size={15} />
            Generate Predictions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Critical alert banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {criticalAlerts.length} item{criticalAlerts.length > 1 ? "s" : ""} at critical stock risk
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {criticalAlerts.map((a) => a.productName).join(", ")} —{" "}
              order immediately to avoid stockouts.
            </p>
          </div>
        </div>
      )}

      {/* Event context + recalculate */}
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-5 shadow-sm">
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Tell Claude about upcoming events
        </label>
        <div className="flex gap-3">
          <input
            value={eventContext}
            onChange={(e) => setEventContext(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleRecalculate(); }}
            placeholder="e.g. 'big game this weekend', 'school starts Monday', 'heat wave coming'"
            className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
          />
          <button
            onClick={() => void handleRecalculate()}
            disabled={!eventContext.trim() || recalcLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {recalcLoading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Zap size={15} />
            )}
            Recalculate
          </button>
        </div>
      </div>

      {/* Toolbar: age + refresh + filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {age && (
            <span className="text-xs text-stone-400">Updated {age}</span>
          )}
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white/80 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-white"
            aria-label="Refresh predictions"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

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
              {opt.id !== "all" && predictions.filter((p) => p.urgency === opt.id).length > 0 && (
                <span className="ml-1.5 text-xs opacity-60">
                  {predictions.filter((p) => p.urgency === opt.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Skeleton while loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Predictions grid */}
      {!loading && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <PredictionCard key={p.productId} prediction={p} />
          ))}
        </div>
      )}

      {/* Empty filter state */}
      {!loading && predictions.length > 0 && visible.length === 0 && (
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-10 text-center shadow-sm">
          <p className="text-stone-400 text-sm">
            No {filter} urgency items — your stock looks healthy in this category.
          </p>
        </div>
      )}
    </div>
  );
}
