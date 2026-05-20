import { useEffect, useState, useCallback, useRef } from "react";
import { TrendingDown, TrendingUp, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { getProducts } from "../services/dataService";
import type { Product } from "../schemas";
import {
  findMarginAlerts,
  priceForTargetMargin,
  updatePrice,
  type MarginAlert,
} from "../services/pricingService";
import { useApp } from "../contexts/useApp";

// Dedup a MarginAlert list by product.id, keeping the first occurrence.
function dedupeAlerts(alerts: MarginAlert[]): MarginAlert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    if (seen.has(a.product.id)) return false;
    seen.add(a.product.id);
    return true;
  });
}

export default function LowMarginAlerts() {
  const { currencySymbol, profile } = useApp();
  const [products, setProducts] = useState<Product[]>([]);

  // `displayedAlerts` is the single source of truth for what's shown.
  // It is never re-derived from products after the initial load — cards
  // are removed by directly filtering this array, making dismissal
  // synchronous and immune to reload races.
  const [displayedAlerts, setDisplayedAlerts] = useState<MarginAlert[]>([]);

  // Once we've shown at least one alert, keep showing the panel (success
  // state) even after the list empties so there's no blank screen.
  const [hadAlerts, setHadAlerts] = useState(false);

  // Ref (not state) so we can read it inside the products useEffect without
  // listing it as a dependency and causing reload loops.
  const dismissedRef = useRef<Set<string>>(new Set());

  const [updatingId, setUpdatingId]   = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [toast, setToast]             = useState<{ msg: string; isError?: boolean } | null>(null);

  const hasPOS = !!profile?.currentPosSystem;

  const reload = useCallback(() => {
    getProducts().then(setProducts);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // When products change (initial load or after an update), merge any NEW
  // low-margin products into the displayed list.  Already-dismissed IDs are
  // never re-added.
  useEffect(() => {
    if (products.length === 0) return;
    const fresh = dedupeAlerts(findMarginAlerts(products));
    setDisplayedAlerts((prev) => {
      const existingIds = new Set(prev.map((a) => a.product.id));
      const toAdd = fresh.filter(
        (a) => !existingIds.has(a.product.id) && !dismissedRef.current.has(a.product.id)
      );
      if (toAdd.length === 0) return prev;
      const next = dedupeAlerts([...prev, ...toAdd]);
      if (next.length > 0) setHadAlerts(true);
      return next;
    });
  }, [products]);

  function toastMessage(count: number): string {
    const base = count === 1 ? "1 price updated" : `${count} prices updated`;
    return hasPOS ? `${base} and synced to your POS` : `${base} successfully`;
  }

  function showToast(msg: string, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 6000 : 4000);
  }

  // Remove a single card synchronously — happens BEFORE the async updatePrice
  // call so dismissal is never blocked by network / storage latency.
  function dismissOne(id: string) {
    dismissedRef.current.add(id);
    setDisplayedAlerts((prev) => {
      const next = prev.filter((a) => a.product.id !== id);
      return next;
    });
  }

  function dismissAll(ids: string[]) {
    ids.forEach((id) => dismissedRef.current.add(id));
    setDisplayedAlerts([]);
  }

  async function handleUpdateOne(a: MarginAlert) {
    dismissOne(a.product.id);
    setUpdatingId(a.product.id);

    const cost      = a.product.costPrice ?? 0;
    const suggested = priceForTargetMargin(cost, a.threshold);
    try {
      const result = await updatePrice(a.product.id, suggested, {
        reason: `Margin alert fix — restored to ${a.threshold}% target`,
      });
      if (!result) throw new Error("Update returned no result");
      showToast(toastMessage(1));
    } catch {
      // Re-add the dismissed card and show error
      dismissedRef.current.delete(a.product.id);
      setDisplayedAlerts((prev) => dedupeAlerts([a, ...prev]));
      showToast("Failed to update price — please try again", true);
    } finally {
      setUpdatingId(null);
      reload();
    }
  }

  async function handleUpdateAll() {
    setUpdatingAll(true);
    const toUpdate = [...displayedAlerts];

    dismissAll(toUpdate.map((a) => a.product.id));

    let successCount = 0;
    const failed: MarginAlert[] = [];

    for (const a of toUpdate) {
      const cost      = a.product.costPrice ?? 0;
      const suggested = priceForTargetMargin(cost, a.threshold);
      try {
        const result = await updatePrice(a.product.id, suggested, {
          reason: `Margin alert fix — restored to ${a.threshold}% target`,
        });
        if (!result) throw new Error("no result");
        successCount++;
      } catch {
        failed.push(a);
      }
    }

    // Re-add any cards that failed
    if (failed.length > 0) {
      failed.forEach((a) => dismissedRef.current.delete(a.product.id));
      setDisplayedAlerts((prev) => dedupeAlerts([...failed, ...prev]));
      showToast(
        successCount > 0
          ? `${successCount} updated, ${failed.length} failed — please retry`
          : "Failed to update prices — please try again",
        true
      );
    } else if (successCount > 0) {
      showToast(toastMessage(successCount));
    }

    setUpdatingAll(false);
    reload();
  }

  // Nothing to show and never had any alerts → invisible (healthy store from start).
  if (!hadAlerts && displayedAlerts.length === 0 && !toast) return null;

  return (
    <>
      {/* ── Alert panel ─────────────────────────────────────────────────── */}
      {displayedAlerts.length > 0 ? (
        <div className="rounded-2xl border border-red-200 dark:border-red-800/30 overflow-hidden shadow-sm">
          {/* Banner */}
          <div className="bg-red-50 dark:bg-red-900/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600 shrink-0" />
              <span className="font-semibold text-red-800 dark:text-red-300">
                {displayedAlerts.length} product{displayedAlerts.length !== 1 ? "s" : ""} need
                {displayedAlerts.length === 1 ? "s" : ""} a price update
              </span>
            </div>
            {displayedAlerts.length > 1 && (
              <button
                onClick={handleUpdateAll}
                disabled={updatingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors"
              >
                {updatingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
                )}
                Update All Suggested Prices
              </button>
            )}
          </div>

          {/* Cards — rendered from displayedAlerts only, never re-derived */}
          <div className="divide-y divide-red-100 dark:divide-red-800/20">
            {displayedAlerts.map((a) => {
              const cost       = a.product.costPrice ?? 0;
              const suggested  = priceForTargetMargin(cost, a.threshold);
              const isUpdating = updatingId === a.product.id;

              return (
                <div key={a.product.id} className="bg-white dark:bg-gray-800 px-4 py-3 space-y-2">
                  {/* Row 1: name + badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {a.product.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium">
                        {currencySymbol}{a.product.price.toFixed(2)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold">
                        {a.margin.toFixed(1)}% margin
                      </span>
                    </div>
                  </div>

                  {/* Row 2: transparent math */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Your cost is{" "}
                    <strong className="text-gray-700 dark:text-gray-200">
                      {currencySymbol}{cost.toFixed(2)}
                    </strong>
                    . At your target margin of{" "}
                    <strong className="text-gray-700 dark:text-gray-200">
                      {a.threshold}%
                    </strong>{" "}
                    your price should be{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {currencySymbol}{suggested.toFixed(2)}
                    </strong>
                    .
                  </p>

                  {/* Row 3: margin arrow + update button */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-red-600 font-medium">
                        {a.margin.toFixed(1)}% now
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {a.threshold}% after update
                      </span>
                    </div>
                    <button
                      onClick={() => handleUpdateOne(a)}
                      disabled={isUpdating || updatingAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors shrink-0"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Update to {currencySymbol}{suggested.toFixed(2)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── All-clear success state ──────────────────────────────────── */
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/30 bg-emerald-50 dark:bg-emerald-900/10 px-5 py-4 flex items-center gap-3 shadow-sm">
          <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              All your prices are healthy
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              Every product is at or above your target margin.
            </p>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-xl pointer-events-none ${toast.isError ? "bg-red-600" : "bg-emerald-700"}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {toast.msg}
        </div>
      )}
    </>
  );
}
