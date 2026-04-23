import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { getMyBusiness, createStoreUnderBusiness } from "../../services/businessService";
import { SurfaceCard, SectionTitle } from "../../components/page-shell";
import { CheckCircle, Copy, Loader2, Store } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "grocery",   label: "Grocery / Bodega" },
  { value: "cstore",    label: "C-Store / Gas Station" },
  { value: "butcher",   label: "Butcher / Meat Shop" },
  { value: "bakery",    label: "Bakery" },
  { value: "liquor",    label: "Liquor Store" },
  { value: "clothing",  label: "Clothing / General Merchandise" },
  { value: "restaurant",label: "Restaurant" },
  { value: "pharmacy",  label: "Pharmacy" },
  { value: "general",   label: "General Store" },
  { value: "other",     label: "Other" },
];

const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

export default function BusinessCreateStorePage() {
  const [, setLocation] = useLocation();
  const { businessId } = useAuth();
  const [form, setForm] = useState({
    storeName: "",
    fullName: "",
    email: "",
    businessType: "other",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword: string; email: string; fullName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let bid = businessId;
      if (!bid) {
        const biz = await getMyBusiness();
        bid = biz?.id;
      }
      if (!bid) throw new Error("No business found for your account.");

      const res = await createStoreUnderBusiness(bid, {
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        storeName: form.storeName.trim(),
        businessType: form.businessType,
      });
      setResult({ tempPassword: res.tempPassword, email: res.email, fullName: res.fullName });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function copyPassword() {
    if (result) {
      void navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (result) {
    return (
      <div className="space-y-6 max-w-xl mx-auto">
        <SurfaceCard className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CheckCircle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Store created!</h2>
              <p className="text-sm text-stone-500">Share the credentials below with the store manager.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-stone-950 p-5 space-y-3 text-white font-mono text-sm">
            <Row label="Store" value={form.storeName} />
            <Row label="Manager" value={result.fullName} />
            <Row label="Email" value={result.email} />
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white/50 mr-2">Password</span>
                <span className="font-bold tracking-widest">{result.tempPassword}</span>
              </div>
              <button
                onClick={copyPassword}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 transition-colors"
              >
                {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <p className="text-xs text-stone-500">
            The manager will log in with this email and temporary password, then complete store setup through the onboarding flow.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => { setResult(null); setForm({ storeName: "", fullName: "", email: "", businessType: "other" }); }}
              className="flex-1 rounded-2xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Add another store
            </button>
            <button
              onClick={() => setLocation("/business/stores")}
              className="flex-1 rounded-2xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              View all stores
            </button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Add a store</h1>
        <p className="mt-1 text-sm text-stone-500">
          Create a new store location under your business. The store manager will receive login credentials to complete setup.
        </p>
      </div>

      <SurfaceCard className="space-y-5">
        <SectionTitle title="Store details" description="Basic information about this location." />

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Store name">
            <input
              required
              value={form.storeName}
              onChange={e => set("storeName", e.target.value)}
              placeholder="e.g. Downtown Location"
              className={inputCls}
            />
          </Field>

          <Field label="Business type">
            <select
              value={form.businessType}
              onChange={e => set("businessType", e.target.value)}
              className={inputCls}
            >
              {BUSINESS_TYPES.map(bt => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
          </Field>

          <div className="border-t border-stone-100 pt-4">
            <SectionTitle title="Store manager" description="This person will manage this location." />
          </div>

          <Field label="Manager full name">
            <input
              required
              value={form.fullName}
              onChange={e => set("fullName", e.target.value)}
              placeholder="e.g. Maria Rodriguez"
              className={inputCls}
            />
          </Field>

          <Field label="Manager email">
            <input
              required
              type="email"
              value={form.email}
              onChange={e => set("email", e.target.value)}
              placeholder="manager@example.com"
              className={inputCls}
            />
          </Field>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLocation("/business/stores")}
              className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : <><Store size={15} /> Create store</>}
            </button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-white/50 w-20 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}
