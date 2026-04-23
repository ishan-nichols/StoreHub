import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getMyBusiness, updateBusiness, type BusinessInfo } from "../../services/businessService";
import { SurfaceCard, SectionTitle } from "../../components/page-shell";
import { AlertCircle, CheckCircle, Loader2, LogOut } from "lucide-react";

const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

export default function BusinessSettingsPage() {
  const { user, logout } = useAuth();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    getMyBusiness()
      .then(biz => {
        if (biz) {
          setBusiness(biz);
          setName(biz.name);
          setDescription(biz.description ?? "");
          setWebsite(biz.website ?? "");
        }
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;
    setSaving(true);
    setError(null);
    try {
      await updateBusiness(business.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        website: website.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">Manage your business profile and account.</p>
      </div>

      {/* Business profile */}
      <SurfaceCard className="space-y-5">
        <SectionTitle title="Business profile" description="Public-facing information about your business entity." />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Business name">
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your company name"
              className={inputCls}
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description of your business"
              rows={3}
              className={inputCls + " resize-none"}
            />
          </Field>

          <Field label="Website (optional)">
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://yourbusiness.com"
              className={inputCls}
            />
          </Field>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 size={15} className="animate-spin" /> Saving…</>
            ) : saved ? (
              <><CheckCircle size={15} /> Saved!</>
            ) : (
              "Save changes"
            )}
          </button>
        </form>
      </SurfaceCard>

      {/* Account info */}
      <SurfaceCard className="space-y-4">
        <SectionTitle title="Account" description="Your login credentials and session." />

        <div className="space-y-2">
          <InfoRow label="Name"  value={user?.fullName ?? "—"} />
          <InfoRow label="Email" value={user?.email ?? "—"} />
          <InfoRow label="Role"  value="Business Owner" />
        </div>

        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
        >
          <LogOut size={15} /> Log out
        </button>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl bg-stone-50 px-4 py-3">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</span>
      <span className="text-sm font-medium text-stone-800">{value}</span>
    </div>
  );
}
