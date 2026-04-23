import { useMemo, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import type { Product } from "../schemas";
import { previewBulkUpdate, applyBulkUpdate, marginColor, type BulkPriceMode } from "../services/pricingService";
import { useApp } from "../contexts/useApp";

interface Props {
  selectedProducts: Product[];
  onClose: () => void;
  onApplied: () => void;
}

export default function BulkPriceUpdateModal({ selectedProducts, onClose, onApplied }: Props) {
  const { currencySymbol } = useApp();
  const [modeType, setModeType] = useState<BulkPriceMode["type"]>("raisePct");
  const [value, setValue] = useState<number>(5);
  const [applying, setApplying] = useState(false);

  const mode: BulkPriceMode = useMemo(() => {
    if (modeType === "matchSrp") return { type: "matchSrp" };
    return { type: modeType, value } as BulkPriceMode;
  }, [modeType, value]);

  const preview = useMemo(() => previewBulkUpdate(selectedProducts, mode), [selectedProducts, mode]);
  const changedCount = preview.filter((p) => p.changed).length;
  const skippedCount = preview.filter((p) => p.skipped).length;

  async function handleApply() {
    setApplying(true);
    await applyBulkUpdate(preview, "Bulk update");
    setApplying(false);
    onApplied();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold">Bulk price update — {selectedProducts.length} products</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {(["raisePct", "raiseAmount", "matchSrp", "targetMargin"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setModeType(t)}
                className={`px-3 py-1.5 text-sm rounded-full border ${modeType === t ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-300 hover:border-emerald-400 dark:border-slate-700"}`}
              >
                {t === "raisePct" ? "Raise by %" : t === "raiseAmount" ? `Raise by ${currencySymbol}` : t === "matchSrp" ? "Match SRP" : "Target margin %"}
              </button>
            ))}
          </div>
          {modeType !== "matchSrp" && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                {modeType === "raisePct" ? "Percent" : modeType === "raiseAmount" ? `Amount (${currencySymbol})` : "Target margin %"}
              </label>
              {modeType === "raiseAmount" ? (
                <CurrencyInput
                  value={value}
                  onChange={setValue}
                  className="w-24 px-2 py-1 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700 text-sm"
                />
              ) : (
                <input
                  type="number" step="0.1"
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="text-sm text-slate-500 mb-2">
            {changedCount} product{changedCount !== 1 ? "s" : ""} will change · {skippedCount} skipped
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Product</th>
                <th className="text-right py-1">Old</th>
                <th className="text-right py-1">New</th>
                <th className="text-right py-1">Margin</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => {
                const color = marginColor(p.newMargin);
                return (
                  <tr key={p.productId} className={`border-t border-slate-100 dark:border-slate-800 ${p.skipped ? "opacity-40" : ""}`}>
                    <td className="py-1.5 truncate max-w-[14rem]">{p.name} {p.skipped && <span className="text-xs text-slate-400">({p.skipped})</span>}</td>
                    <td className="py-1.5 text-right text-slate-500">{currencySymbol}{p.oldPrice.toFixed(2)}</td>
                    <td className={`py-1.5 text-right font-semibold ${p.changed ? "text-emerald-600" : ""}`}>{currencySymbol}{p.newPrice.toFixed(2)}</td>
                    <td className={`py-1.5 text-right ${color === "green" ? "text-emerald-600" : color === "yellow" ? "text-amber-600" : "text-red-600"}`}>
                      {p.costPrice > 0 ? `${p.newMargin.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={handleApply} disabled={applying || changedCount === 0} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Apply to {changedCount}
          </button>
        </div>
      </div>
    </div>
  );
}
