import { useState } from "react";
import { History, RefreshCw, CheckCircle2, AlertCircle, Clock, TrendingUp } from "lucide-react";
import type { Product } from "../schemas";
import {
  marginPct,
  marginColor,
  retryPosSync,
  updateCost,
  updatePrice,
  suggestPriceForCostChange,
} from "../services/pricingService";
import { useApp } from "../contexts/useApp";
import CurrencyInput from "./CurrencyInput";

interface Props {
  product: Product;
  onChange: () => void;
}

export default function PricePanel({ product, onChange }: Props) {
  const { currencySymbol } = useApp();
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingCost, setEditingCost] = useState(false);
  const [draftPrice, setDraftPrice] = useState(product.price);
  const [draftCost, setDraftCost] = useState(product.costPrice ?? 0);
  const [showHistory, setShowHistory] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [priceSuggestion, setPriceSuggestion] = useState<number | null>(null);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);

  const cost = editingCost ? draftCost : (product.costPrice ?? 0);
  const price = editingPrice ? draftPrice : product.price;
  const margin = marginPct(price, cost);
  const color = marginColor(margin, product.marginAlertPct ?? 15);
  const colorClasses = {
    green: "text-emerald-600 bg-emerald-50",
    yellow: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
  }[color];

  async function commitPrice() {
    setEditingPrice(false);
    if (Math.abs(draftPrice - product.price) > 0.005) {
      await updatePrice(product.id, draftPrice, { reason: "Manual edit (price panel)" });
      setPriceSuggestion(null);
      onChange();
    }
  }

  async function commitCost() {
    setEditingCost(false);
    const oldCost = product.costPrice ?? 0;
    const newCost = draftCost;
    if (Math.abs(newCost - oldCost) > 0.005) {
      await updateCost(product.id, newCost);
      // Suggest a new retail price that preserves the existing margin
      const suggested = suggestPriceForCostChange(product.price, oldCost, newCost);
      if (Math.abs(suggested - product.price) > 0.005) {
        setPriceSuggestion(suggested);
      }
      onChange();
    }
  }

  async function applySuggestion() {
    if (priceSuggestion == null) return;
    setApplyingSuggestion(true);
    await updatePrice(product.id, priceSuggestion, {
      reason: "Cost change — margin-preserving adjustment",
    });
    setPriceSuggestion(null);
    setApplyingSuggestion(false);
    onChange();
  }

  async function handleRetry() {
    setRetrying(true);
    await retryPosSync(product.id);
    setRetrying(false);
    onChange();
  }

  const oldMargin = marginPct(product.price, product.costPrice ?? 0);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cost">
          {editingCost ? (
            <CurrencyInput
              autoFocus
              value={draftCost}
              onChange={setDraftCost}
              onBlur={commitCost}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full text-base font-semibold bg-transparent border-b border-emerald-500 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => { setDraftCost(cost); setEditingCost(true); }}
              className="text-base font-semibold hover:text-emerald-600 text-left w-full"
            >
              {currencySymbol}{cost.toFixed(2)}
            </button>
          )}
        </Stat>

        <Stat label="Retail">
          {editingPrice ? (
            <CurrencyInput
              autoFocus
              value={draftPrice}
              onChange={setDraftPrice}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full text-base font-semibold bg-transparent border-b border-emerald-500 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => { setDraftPrice(price); setEditingPrice(true); }}
              className="text-base font-semibold hover:text-emerald-600 text-left w-full"
            >
              {currencySymbol}{price.toFixed(2)}
            </button>
          )}
        </Stat>

        <Stat label="Margin">
          <span className={`inline-block px-2 py-0.5 rounded text-base font-semibold ${colorClasses}`}>
            {margin.toFixed(1)}%
          </span>
        </Stat>
      </div>

      {/* Price suggestion card — appears after a cost change */}
      {priceSuggestion != null && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-blue-800 dark:text-blue-300 text-xs font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            Cost changed — update retail to maintain {oldMargin.toFixed(1)}% margin?
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              {currencySymbol}{product.price.toFixed(2)} → <strong>{currencySymbol}{priceSuggestion.toFixed(2)}</strong>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPriceSuggestion(null)}
                className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Dismiss
              </button>
              <button
                onClick={applySuggestion}
                disabled={applyingSuggestion}
                className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {applyingSuggestion ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 flex-wrap gap-2">
        {product.srp != null && product.srp > 0 && (
          <span><strong>SRP:</strong> {currencySymbol}{product.srp.toFixed(2)}</span>
        )}
        {product.lastPriceChangeAt && (
          <span>Updated {new Date(product.lastPriceChangeAt).toLocaleDateString()}</span>
        )}
        <PosSyncBadge product={product} retrying={retrying} onRetry={handleRetry} />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
        >
          <History className="w-3 h-3" /> {showHistory ? "Hide" : "Show"} price history ({product.priceHistory?.length ?? 0})
        </button>
      </div>

      {showHistory && product.priceHistory && product.priceHistory.length > 0 && (
        <ul className="space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-700 pt-2 max-h-40 overflow-y-auto">
          {[...product.priceHistory].reverse().map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <div>
                <span className="font-medium capitalize">{h.field}</span>{" "}
                <span className="text-slate-500">{currencySymbol}{h.from.toFixed(2)} → </span>
                <span className="font-medium">{currencySymbol}{h.to.toFixed(2)}</span>
                <div className="text-slate-400 text-[10px]">{h.reason}</div>
              </div>
              <span className="text-slate-400 text-[10px] whitespace-nowrap">
                {new Date(h.date).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function PosSyncBadge({
  product,
  retrying,
  onRetry,
}: {
  product: Product;
  retrying: boolean;
  onRetry: () => void;
}) {
  const status = product.posSyncStatus;
  if (!status || status === "not_connected") return null;
  if (status === "synced")
    return (
      <span className="flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> Synced
      </span>
    );
  if (status === "pending")
    return (
      <span className="flex items-center gap-1 text-amber-600">
        <Clock className="w-3 h-3" /> Pending sync
      </span>
    );
  return (
    <button
      onClick={onRetry}
      disabled={retrying}
      className="flex items-center gap-1 text-red-600 hover:underline"
    >
      {retrying ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <AlertCircle className="w-3 h-3" />
      )}
      Sync failed — retry
    </button>
  );
}
