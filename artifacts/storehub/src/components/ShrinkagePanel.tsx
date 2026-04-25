import { useState, useCallback } from "react";
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  PackageOpen,
  TrendingDown,
  Filter,
} from "lucide-react";
import {
  runReconciliation,
  resolveRecord,
  getSummary,
  getMonthlyLoss,
  detectPatterns,
  logReceived,
  type ShrinkageRecord,
  type ShrinkageReason,
  type ShrinkageSummary,
} from "../services/shrinkageService";
import type { Product, Sale } from "../schemas";

interface Props {
  products: Product[];
  sales: Sale[];
}

type FilterMode = "unresolved" | "resolved" | "all";

const REASON_LABELS: Record<ShrinkageReason, string> = {
  theft: "Theft",
  breakage: "Breakage",
  receiving_error: "Receiving Error",
  counting_error: "Counting Error",
};

const REASON_COLORS: Record<ShrinkageReason, string> = {
  theft: "bg-red-100 text-red-700",
  breakage: "bg-amber-100 text-amber-700",
  receiving_error: "bg-blue-100 text-blue-700",
  counting_error: "bg-stone-100 text-stone-700",
};

export default function ShrinkagePanel({ products, sales }: Props) {
  const [summary, setSummary] = useState<ShrinkageSummary>(() => getSummary());
  const [monthlyLoss] = useState<number>(() => getMonthlyLoss());
  const [filter, setFilter] = useState<FilterMode>("unresolved");
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [patterns, setPatterns] = useState<string[]>(() =>
    detectPatterns(getSummary().records),
  );

  // Delivery log form state
  const [deliverySearch, setDeliverySearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [deliveryQty, setDeliveryQty] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [deliverySuccess, setDeliverySuccess] = useState(false);

  const refresh = useCallback(() => {
    const s = getSummary();
    setSummary(s);
    setPatterns(detectPatterns(s.records));
  }, []);

  async function handleReconcile() {
    setReconciling(true);
    setReconcileResult(null);
    // Use setTimeout to allow UI to update before heavy computation
    await new Promise((r) => setTimeout(r, 50));
    const newRecords = runReconciliation(products, sales);
    refresh();
    setReconcileResult(
      newRecords.length === 0
        ? "No new discrepancies found."
        : `Found ${newRecords.length} new discrepanc${newRecords.length === 1 ? "y" : "ies"}.`,
    );
    setReconciling(false);
  }

  function handleResolve(recordId: string, reason: ShrinkageReason) {
    resolveRecord(recordId, reason);
    refresh();
  }

  function handleLogDelivery() {
    if (!selectedProductId || !deliveryQty || !deliveryCost) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;
    logReceived(
      selectedProductId,
      product.name,
      parseFloat(deliveryQty),
      parseFloat(deliveryCost),
    );
    setDeliverySuccess(true);
    setSelectedProductId("");
    setDeliveryQty("");
    setDeliveryCost("");
    setDeliverySearch("");
    setTimeout(() => setDeliverySuccess(false), 3000);
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(deliverySearch.toLowerCase()),
  );

  const filteredRecords = summary.records.filter((r) => {
    if (filter === "unresolved") return !r.resolvedAs;
    if (filter === "resolved") return !!r.resolvedAs;
    return true;
  });

  // Sort: unresolved first, then by cost impact desc
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (!a.resolvedAs && b.resolvedAs) return -1;
    if (a.resolvedAs && !b.resolvedAs) return 1;
    return b.totalCostImpact - a.totalCostImpact;
  });

  return (
    <div className="space-y-6">
      {/* Log Delivery Section */}
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
          <PackageOpen size={17} className="text-amber-500" />
          Log Delivery
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Product search */}
          <div className="sm:col-span-2 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={deliverySearch || (selectedProductId ? products.find((p) => p.id === selectedProductId)?.name ?? "" : "")}
              onChange={(e) => {
                setDeliverySearch(e.target.value);
                setSelectedProductId("");
              }}
              placeholder="Search product…"
              className="w-full pl-9 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {deliverySearch && filteredProducts.length > 0 && !selectedProductId && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {filteredProducts.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProductId(p.id);
                      setDeliverySearch("");
                      if (p.costPrice) setDeliveryCost(String(p.costPrice));
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-amber-50 hover:text-amber-700"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <input
              type="number"
              min="1"
              step="1"
              value={deliveryQty}
              onChange={(e) => setDeliveryQty(e.target.value)}
              placeholder="Qty received"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
              placeholder="Cost per unit ($)"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleLogDelivery}
            disabled={!selectedProductId || !deliveryQty || !deliveryCost}
            className="px-4 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl transition-colors"
          >
            Log Delivery
          </button>
          {deliverySuccess && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
              <CheckCircle size={14} />
              Delivery logged!
            </span>
          )}
        </div>
      </div>

      {/* Run Reconciliation */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-stone-800 hover:bg-stone-700 disabled:opacity-60 text-white rounded-xl transition-colors"
        >
          <RefreshCw size={15} className={reconciling ? "animate-spin" : ""} />
          {reconciling ? "Reconciling…" : "Run Reconciliation"}
        </button>
        {reconcileResult && (
          <span
            className={`text-sm font-medium ${
              reconcileResult.includes("No new") ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {reconcileResult}
          </span>
        )}
      </div>

      {/* Summary strip */}
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-5 shadow-sm">
        <div className="flex flex-wrap gap-6 items-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.totalUnresolved}</div>
            <div className="text-xs text-stone-500 mt-0.5">Unresolved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-stone-800">${summary.totalCostImpact.toFixed(2)}</div>
            <div className="text-xs text-stone-500 mt-0.5">Total Impact</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">${monthlyLoss.toFixed(2)}</div>
            <div className="text-xs text-stone-500 mt-0.5">This Month</div>
          </div>
          {summary.lastRunAt && (
            <div className="text-xs text-stone-400 ml-auto">
              Last checked: {timeAgo(summary.lastRunAt)}
            </div>
          )}
        </div>
      </div>

      {/* Monthly loss banner */}
      {monthlyLoss > 0 && (
        <div className="rounded-[30px] bg-amber-50 border border-amber-200 p-5 flex items-center gap-3">
          <TrendingDown size={22} className="text-amber-600 shrink-0" />
          <div>
            <div className="font-bold text-amber-800 text-lg">
              This month: ${monthlyLoss.toFixed(2)} in shrinkage
            </div>
            <div className="text-sm text-amber-700">
              Unresolved inventory discrepancies detected in {new Date().toLocaleString("default", { month: "long" })}
            </div>
          </div>
        </div>
      )}

      {/* Pattern alerts */}
      {patterns.length > 0 && (
        <div className="space-y-2">
          {patterns.map((pattern, i) => (
            <div
              key={i}
              className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3"
            >
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-semibold">Shrinkage Pattern Detected: </span>
                {pattern}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-stone-400" />
        {(["unresolved", "resolved", "all"] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="text-xs text-stone-400 ml-1">
          {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Records */}
      {sortedRecords.length === 0 ? (
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-8 shadow-sm text-center">
          <CheckCircle size={36} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">
            {filter === "unresolved"
              ? "No unresolved discrepancies. Your inventory looks clean!"
              : "No records found."}
          </p>
          <p className="text-stone-400 text-xs mt-1">
            Run reconciliation after logging deliveries to detect shrinkage.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedRecords.map((record) => (
            <ShrinkageCard
              key={record.id}
              record={record}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ShrinkageCard ────────────────────────────────────────────────────────────

function ShrinkageCard({
  record,
  onResolve,
}: {
  record: ShrinkageRecord;
  onResolve: (id: string, reason: ShrinkageReason) => void;
}) {
  const isResolved = !!record.resolvedAs;

  return (
    <div
      className={`rounded-[30px] border p-5 shadow-sm space-y-4 ${
        isResolved
          ? "border-stone-100 bg-stone-50/60"
          : "border-red-100 bg-white/80"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-stone-800">{record.productName}</span>
            <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">
              {record.category}
            </span>
            {isResolved && record.resolvedAs && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REASON_COLORS[record.resolvedAs]}`}
              >
                {REASON_LABELS[record.resolvedAs]}
              </span>
            )}
          </div>
          <div className="text-sm text-stone-600 mt-1">
            You should have{" "}
            <span className="font-semibold">{record.expectedQty.toFixed(1)}</span> units but
            have <span className="font-semibold">{record.actualQty.toFixed(1)}</span> —{" "}
            <span className="font-semibold text-red-600">
              {record.discrepancy.toFixed(1)} unit{record.discrepancy !== 1 ? "s" : ""} unaccounted for
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-red-600">${record.totalCostImpact.toFixed(2)}</div>
          <div className="text-xs text-stone-400">lost</div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-700">
        ${record.totalCostImpact.toFixed(2)} lost ({record.discrepancy.toFixed(1)} units ×
        ${record.costPerUnit.toFixed(2)} cost)
      </div>

      {/* Possible causes */}
      {!isResolved && (
        <div className="text-xs text-stone-400 italic">
          Possible: theft, breakage, or receiving error
        </div>
      )}

      {/* Resolved state */}
      {isResolved ? (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <CheckCircle size={14} className="text-emerald-500" />
          Resolved as{" "}
          <span className="font-semibold">{REASON_LABELS[record.resolvedAs!]}</span>
          {record.resolvedAt && <span className="text-xs">· {timeAgo(record.resolvedAt)}</span>}
          {record.notes && <span className="text-xs italic">· {record.notes}</span>}
        </div>
      ) : (
        /* Resolve buttons */
        <div>
          <div className="text-xs font-semibold text-stone-500 mb-2">Resolve as:</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(REASON_LABELS) as ShrinkageReason[]).map((reason) => (
              <button
                key={reason}
                onClick={() => onResolve(record.id, reason)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${REASON_COLORS[reason]} border-transparent hover:border-current`}
              >
                {REASON_LABELS[reason]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-stone-400">Detected {timeAgo(record.detectedAt)}</div>
    </div>
  );
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
