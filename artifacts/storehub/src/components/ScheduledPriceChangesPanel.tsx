import { useEffect, useState } from "react";
import { CalendarClock, Plus, Trash2, X } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import type { Product, ScheduledPriceChange } from "../schemas";
import { listScheduledChanges, createScheduledChange, cancelScheduledChange } from "../services/pricingService";
import { useApp } from "../contexts/useApp";

interface Props {
  products: Product[];
}

export default function ScheduledPriceChangesPanel({ products }: Props) {
  const { currencySymbol } = useApp();
  const [items, setItems] = useState<ScheduledPriceChange[]>([]);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setItems(await listScheduledChanges());
  }
  useEffect(() => { load(); }, []);

  async function handleCancel(id: string) {
    await cancelScheduledChange(id);
    load();
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
          <CalendarClock className="w-5 h-5 text-emerald-600" /> Scheduled price changes
        </div>
        <button onClick={() => setShowForm(true)} className="text-sm flex items-center gap-1 text-emerald-600 hover:underline">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No scheduled price changes. Set a sale price with start and end dates and StoreHub will flip it automatically.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {items.map((it) => (
            <li key={it.id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{it.productName}</p>
                <p className="text-xs text-slate-500">
                  {currencySymbol}{it.originalPrice.toFixed(2)} → <strong>{currencySymbol}{it.newPrice.toFixed(2)}</strong>
                  {" · "}{new Date(it.startsAt).toLocaleDateString()}
                  {it.endsAt && ` – ${new Date(it.endsAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                it.status === "active" ? "bg-emerald-100 text-emerald-700" :
                it.status === "pending" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              }`}>{it.status}</span>
              {it.status !== "reverted" && it.status !== "cancelled" && (
                <button onClick={() => handleCancel(it.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <ScheduleForm
          products={products}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function ScheduleForm({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const { currencySymbol } = useApp();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [newPrice, setNewPrice] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const product = products.find((p) => p.id === productId);

  async function handleSave() {
    if (!product || newPrice <= 0 || !startsAt) return;
    await createScheduledChange({
      productId: product.id,
      productName: product.name,
      newPrice,
      originalPrice: product.price,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Schedule a price change</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-sm">
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 w-full px-2 py-2 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700">
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {currencySymbol}{p.price.toFixed(2)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Sale price ({currencySymbol})
          <CurrencyInput
            value={newPrice}
            onChange={setNewPrice}
            className="mt-1 w-full px-2 py-2 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            Starts
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full px-2 py-2 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700" />
          </label>
          <label className="block text-sm">
            Ends (optional)
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 w-full px-2 py-2 border border-slate-300 rounded dark:bg-slate-800 dark:border-slate-700" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 border border-slate-300 rounded-lg text-sm dark:border-slate-700">Cancel</button>
          <button onClick={handleSave} disabled={!product || newPrice <= 0 || !startsAt} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
