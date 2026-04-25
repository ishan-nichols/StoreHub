import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { getMyBusiness, createStore } from "../../services/businessService";
import { SurfaceCard, SectionTitle } from "../../components/page-shell";
import { AlertCircle, Loader2, Store } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { value: "grocery",    label: "Grocery / Bodega" },
  { value: "cstore",     label: "C-Store / Gas Station" },
  { value: "butcher",    label: "Butcher / Meat Shop" },
  { value: "bakery",     label: "Bakery" },
  { value: "liquor",     label: "Liquor Store" },
  { value: "clothing",   label: "Clothing / General Merchandise" },
  { value: "restaurant", label: "Restaurant" },
  { value: "pharmacy",   label: "Pharmacy" },
  { value: "general",    label: "General Store" },
  { value: "other",      label: "Other" },
];

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BusinessCreateStorePage() {
  const [, navigate] = useLocation();
  const { businessId: ctxBusinessId, switchToStore } = useAuth();

  const [storeName,    setStoreName]    = useState("");
  const [businessType, setBusinessType] = useState("other");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim()) return;
    setError(null);
    setSaving(true);

    try {
      // Resolve business ID — prefer context, fall back to API call.
      let bid = ctxBusinessId;
      if (!bid) {
        const biz = await getMyBusiness();
        if (!biz) throw new Error("No business found for your account. Create one from the dashboard first.");
        bid = biz.id;
      }

      const created = await createStore(bid, {
        storeName:    storeName.trim(),
        businessType,
        // No email/fullName — business owner is the initial manager.
      });

      // Go straight into onboarding for the new store.
      switchToStore(created.userId, "/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Add a store</h1>
        <p className="mt-1 text-sm text-stone-500">
          Give your new location a name and type — you'll finish the setup in the next step.
        </p>
      </div>

      <SurfaceCard className="space-y-5">
        <SectionTitle title="Store details" description="Basic information about this location." />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store name */}
          <Field label="Store name">
            <input
              required
              autoFocus
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              placeholder="e.g. Downtown Location"
              className={inputCls}
            />
          </Field>

          {/* Business type */}
          <Field label="Business type">
            <select
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              className={inputCls}
            >
              {BUSINESS_TYPES.map(bt => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
          </Field>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate("/business/stores")}
              className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !storeName.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                : <><Store size={15} /> Create &amp; set up store →</>}
            </button>
          </div>
        </form>
      </SurfaceCard>

      {/* Hint about managers */}
      <p className="text-xs text-stone-400 text-center px-4">
        You can assign a dedicated manager later from the store's employee settings.
      </p>
    </div>
  );
}
