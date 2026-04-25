import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  ArrowLeft, Store, User, DollarSign, Package, Users, Receipt,
  TruckIcon, AlertCircle, Pencil, Save, X, CheckCircle2, LogIn,
  Trash2, Key, RefreshCw,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useAuth } from "../../contexts/AuthContext";
import {
  getStoreDetail, getStoreProducts, getStoreSales,
  getStoreEmployees, getStoreExpenses, getStoreSuppliers,
  updateStoreProfile, updateStoreUser, deleteStore, resetUserPassword,
  getDeleteCascade,
  type AdminStoreDetail,
} from "../../services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabData = { products: unknown[]; sales: unknown[]; employees: unknown[]; expenses: unknown[]; suppliers: unknown[] };

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className="text-zinc-300 text-right capitalize break-all">{value || "—"}</dd>
    </div>
  );
}

function EditField({
  label, fieldKey, value, onChange, type = "text", options,
}: {
  label: string; fieldKey: string; value: string;
  onChange: (k: string, v: string) => void;
  type?: string;
  options?: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-1.5 text-sm"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
        />
      )}
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  userId, storeName, onClose, onDeleted,
}: {
  userId: string; storeName: string;
  onClose: () => void; onDeleted: () => void;
}) {
  const [cascade, setCascade] = useState<Awaited<ReturnType<typeof getDeleteCascade>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    getDeleteCascade(userId)
      .then(setCascade)
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteStore(userId);
      onDeleted();
    } catch (e) {
      alert((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100">Delete Store</h2>
            <p className="text-xs text-zinc-400">{storeName}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-4 text-center text-zinc-500 text-sm">Checking impact…</div>
        ) : cascade?.blocked ? (
          <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-sm text-red-300">
            {cascade.reason}
          </div>
        ) : (
          <>
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-4 space-y-3 text-sm">
              <p className="font-medium text-amber-300">This will permanently delete:</p>
              <ul className="space-y-1 text-amber-200/80 list-disc list-inside">
                <li>The user account</li>
                {(cascade?.stores?.length ?? 0) > 0 && (
                  <li>
                    {cascade!.stores.length === 1
                      ? `Store: ${cascade!.stores[0].storeName}`
                      : `${cascade!.stores.length} stores (${cascade!.stores.map(s => s.storeName).join(", ")})`}
                  </li>
                )}
                {(cascade?.businesses?.length ?? 0) > 0 && (
                  <li>
                    {cascade!.businesses.length === 1
                      ? `Business: ${cascade!.businesses[0]}`
                      : `${cascade!.businesses.length} businesses`}
                  </li>
                )}
                <li>All associated products, sales, expenses, employees & suppliers</li>
              </ul>
              <p className="text-amber-400 font-medium">This cannot be undone.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Type <span className="font-mono text-zinc-200">DELETE</span> to confirm
              </label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400">Cancel</Button>
          {!cascade?.blocked && !loading && (
            <Button
              onClick={handleDelete}
              disabled={confirm !== "DELETE" || deleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting…" : "Delete forever"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setLoading(true);
    try {
      const r = await resetUserPassword(userId, pw.trim() || undefined);
      setResult(r.tempPassword);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100">Reset Password</h2>
            <p className="text-xs text-zinc-400">Leave blank to auto-generate a secure password</p>
          </div>
        </div>

        {result ? (
          <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg p-4 space-y-2">
            <p className="text-xs text-emerald-400 font-medium">New password (copy now — won't be shown again):</p>
            <p className="font-mono text-lg text-emerald-200 break-all select-all">{result}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">New Password (optional)</label>
              <Input
                type="text"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Leave blank to auto-generate"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} className="text-zinc-400">Cancel</Button>
              <Button onClick={handleReset} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                {loading ? "Resetting…" : "Reset Password"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="flex justify-end">
            <Button onClick={onClose} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminStoreDetailPage() {
  const [, params] = useRoute("/admin/stores/:userId");
  const [, navigate] = useLocation();
  const userId = params?.userId ?? "";

  const [detail, setDetail] = useState<AdminStoreDetail | null>(null);
  const [tabData, setTabData] = useState<Partial<TabData>>({});
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { switchToStore } = useAuth();

  // Edit state — profile fields
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Edit state — user account fields
  const [editingUser, setEditingUser] = useState(false);
  const [userFields, setUserFields] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPwModal, setShowResetPwModal] = useState(false);

  function setField(setter: React.Dispatch<React.SetStateAction<Record<string, string>>>) {
    return (k: string, v: string) => setter(prev => ({ ...prev, [k]: v }));
  }

  function initFieldsFromDetail(d: AdminStoreDetail) {
    const p = d.profile as Record<string, unknown>;
    setProfileFields({
      storeName:           String(p.storeName ?? ""),
      ownerName:           String(p.ownerName ?? ""),
      businessType:        String(p.businessType ?? "other"),
      storeCity:           String(p.storeCity ?? ""),
      storeAddress:        String(p.storeAddress ?? ""),
      country:             String(p.country ?? ""),
      stateCode:           String(p.stateCode ?? ""),
      taxRate:             String(p.taxRate ?? "0"),
      currency:            String(p.currency ?? "USD"),
      language:            String(p.language ?? "en"),
      storageMode:         String(p.storageMode ?? "cloud"),
      storeSize:           String(p.storeSize ?? ""),
      numEmployees:        String(p.numEmployees ?? "0"),
      onboardingCompleted: String(p.onboardingCompleted ?? "false"),
    });
    setUserFields({
      fullName:    d.user.fullName ?? "",
      email:       d.user.email ?? "",
      phoneNumber: d.user.phoneNumber ?? "",
      role:        d.user.role ?? "store_owner",
    });
  }

  useEffect(() => {
    if (!userId) return;
    getStoreDetail(userId)
      .then((d) => { setDetail(d); initFieldsFromDetail(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  async function loadTab(tab: string) {
    if (tab === "overview" || loadedTabs.has(tab)) return;
    setLoadedTabs(prev => new Set([...prev, tab]));
    try {
      if (tab === "products") {
        const data = await getStoreProducts(userId);
        setTabData(prev => ({ ...prev, products: data }));
      } else if (tab === "sales") {
        const data = await getStoreSales(userId);
        setTabData(prev => ({ ...prev, sales: data }));
      } else if (tab === "employees") {
        const data = await getStoreEmployees(userId);
        setTabData(prev => ({ ...prev, employees: data }));
      } else if (tab === "expenses") {
        const data = await getStoreExpenses(userId);
        setTabData(prev => ({ ...prev, expenses: data }));
      } else if (tab === "suppliers") {
        const data = await getStoreSuppliers(userId);
        setTabData(prev => ({ ...prev, suppliers: data }));
      }
    } catch { /* ignore tab load errors */ }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      await updateStoreProfile(userId, {
        storeName:           profileFields.storeName,
        ownerName:           profileFields.ownerName,
        businessType:        profileFields.businessType,
        storeCity:           profileFields.storeCity || null,
        storeAddress:        profileFields.storeAddress || null,
        country:             profileFields.country || null,
        stateCode:           profileFields.stateCode || null,
        taxRate:             parseFloat(profileFields.taxRate) || 0,
        currency:            profileFields.currency,
        language:            profileFields.language,
        storageMode:         profileFields.storageMode,
        storeSize:           profileFields.storeSize || null,
        numEmployees:        parseInt(profileFields.numEmployees) || 0,
        onboardingCompleted: profileFields.onboardingCompleted === "true",
      });
      setSaveSuccess(true);
      setEditingProfile(false);
      setTimeout(() => setSaveSuccess(false), 3000);
      const d = await getStoreDetail(userId);
      setDetail(d);
      initFieldsFromDetail(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveUser() {
    setSavingUser(true);
    try {
      await updateStoreUser(userId, {
        fullName:    userFields.fullName || undefined,
        email:       userFields.email || undefined,
        phoneNumber: userFields.phoneNumber,
        role:        userFields.role || undefined,
      });
      setSaveSuccess(true);
      setEditingUser(false);
      setTimeout(() => setSaveSuccess(false), 3000);
      const d = await getStoreDetail(userId);
      setDetail(d);
      initFieldsFromDetail(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingUser(false);
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="space-y-4 animate-pulse max-w-5xl mx-auto">
            <div className="h-8 w-48 bg-zinc-800 rounded" />
            <div className="h-40 bg-zinc-800 rounded-xl" />
            <div className="h-64 bg-zinc-800 rounded-xl" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !detail) {
    return (
      <AdminLayout>
        <div className="p-8 max-w-5xl mx-auto">
          <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error ?? "Store not found"}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const profile = detail.profile as Record<string, unknown>;

  return (
    <AdminLayout>
      {showDeleteModal && (
        <DeleteModal
          userId={userId}
          storeName={String(profile.storeName || "(Unnamed)")}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => navigate("/admin/stores")}
        />
      )}
      {showResetPwModal && (
        <ResetPasswordModal userId={userId} onClose={() => setShowResetPwModal(false)} />
      )}

      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Back + header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/stores">
              <a className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">{String(profile.storeName || "(Unnamed)")}</h1>
              <p className="text-sm text-zinc-500 capitalize">{String(profile.businessType)} · {detail.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            <Button
              onClick={() => switchToStore(userId, "/dashboard")}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <LogIn className="w-3.5 h-3.5" /> Enter Store
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowResetPwModal(true)}
              className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Key className="w-3.5 h-3.5" /> Reset Password
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(true)}
              className="gap-2 border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Store
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Revenue", value: fmt(detail.stats.revenue), icon: DollarSign },
            { label: "Expenses", value: fmt(detail.stats.expenseTotal), icon: Receipt },
            { label: "Sales", value: String(detail.stats.saleCount), icon: Receipt },
            { label: "Products", value: String(detail.stats.productCount), icon: Package },
            { label: "Employees", value: String(detail.stats.employeeCount), icon: Users },
            { label: "Suppliers", value: String(detail.stats.supplierCount), icon: TruckIcon },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <Icon className="w-4 h-4 text-emerald-400 mx-auto mb-1.5" />
              <p className="text-base font-bold text-zinc-200">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" onValueChange={loadTab} className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            {["overview", "products", "sales", "employees", "expenses", "suppliers"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="capitalize text-zinc-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4">
            {/* Store Profile Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-300 font-medium">
                  <Store className="w-4 h-4 text-emerald-400" /> Store Profile
                </div>
                {editingProfile ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingProfile(false)} className="text-zinc-400 h-7">
                      <X className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-7">
                      <Save className="w-3 h-3" />
                      {savingProfile ? "Saving…" : "Save"}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}
                    className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-7">
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                )}
              </div>

              {editingProfile ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditField label="Store Name" fieldKey="storeName" value={profileFields.storeName} onChange={setField(setProfileFields)} />
                  <EditField label="Owner Name" fieldKey="ownerName" value={profileFields.ownerName} onChange={setField(setProfileFields)} />
                  <EditField label="Business Type" fieldKey="businessType" value={profileFields.businessType} onChange={setField(setProfileFields)}
                    options={[
                      { label: "Retail", value: "retail" },
                      { label: "Restaurant / Food", value: "restaurant" },
                      { label: "Grocery / Supermarket", value: "grocery" },
                      { label: "Pharmacy", value: "pharmacy" },
                      { label: "Salon / Beauty", value: "salon" },
                      { label: "Electronics", value: "electronics" },
                      { label: "Clothing & Fashion", value: "clothing" },
                      { label: "Hardware / Tools", value: "hardware" },
                      { label: "Other", value: "other" },
                    ]}
                  />
                  <EditField label="Store Size" fieldKey="storeSize" value={profileFields.storeSize} onChange={setField(setProfileFields)}
                    options={[
                      { label: "(not set)", value: "" },
                      { label: "Solo / Owner-operated", value: "solo" },
                      { label: "Small (1–5 employees)", value: "small" },
                      { label: "Medium (6–20)", value: "medium" },
                      { label: "Large (20+)", value: "large" },
                    ]}
                  />
                  <EditField label="City" fieldKey="storeCity" value={profileFields.storeCity} onChange={setField(setProfileFields)} />
                  <EditField label="Address" fieldKey="storeAddress" value={profileFields.storeAddress} onChange={setField(setProfileFields)} />
                  <EditField label="Country (ISO 2)" fieldKey="country" value={profileFields.country} onChange={setField(setProfileFields)} />
                  <EditField label="State / Province" fieldKey="stateCode" value={profileFields.stateCode} onChange={setField(setProfileFields)} />
                  <EditField label="Tax Rate (%)" fieldKey="taxRate" type="number" value={profileFields.taxRate} onChange={setField(setProfileFields)} />
                  <EditField label="Employees" fieldKey="numEmployees" type="number" value={profileFields.numEmployees} onChange={setField(setProfileFields)} />
                  <EditField label="Currency" fieldKey="currency" value={profileFields.currency} onChange={setField(setProfileFields)}
                    options={[
                      { label: "USD ($)", value: "USD" },
                      { label: "EUR (€)", value: "EUR" },
                      { label: "GBP (£)", value: "GBP" },
                      { label: "NGN (₦)", value: "NGN" },
                      { label: "KES (KSh)", value: "KES" },
                      { label: "ZAR (R)", value: "ZAR" },
                      { label: "GHS (₵)", value: "GHS" },
                      { label: "CAD (C$)", value: "CAD" },
                      { label: "AUD (A$)", value: "AUD" },
                      { label: "INR (₹)", value: "INR" },
                    ]}
                  />
                  <EditField label="Language" fieldKey="language" value={profileFields.language} onChange={setField(setProfileFields)}
                    options={[
                      { label: "English", value: "en" },
                      { label: "French", value: "fr" },
                      { label: "Spanish", value: "es" },
                      { label: "Arabic", value: "ar" },
                      { label: "Swahili", value: "sw" },
                      { label: "Portuguese", value: "pt" },
                    ]}
                  />
                  <EditField label="Storage Mode" fieldKey="storageMode" value={profileFields.storageMode} onChange={setField(setProfileFields)}
                    options={[
                      { label: "Cloud", value: "cloud" },
                      { label: "Local", value: "local" },
                    ]}
                  />
                  <EditField label="Onboarding Completed" fieldKey="onboardingCompleted" value={profileFields.onboardingCompleted}
                    onChange={setField(setProfileFields)}
                    options={[
                      { label: "Yes", value: "true" },
                      { label: "No (pending)", value: "false" },
                    ]}
                  />
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <Field label="Store Name" value={String(profile.storeName ?? "")} />
                  <Field label="Owner Name" value={String(profile.ownerName ?? "")} />
                  <Field label="Business Type" value={String(profile.businessType ?? "")} />
                  <Field label="Store Size" value={String(profile.storeSize ?? "")} />
                  <Field label="City" value={String(profile.storeCity ?? "")} />
                  <Field label="Address" value={String(profile.storeAddress ?? "")} />
                  <Field label="Country" value={String(profile.country ?? "")} />
                  <Field label="State / Province" value={String(profile.stateCode ?? "")} />
                  <Field label="Tax Rate" value={`${profile.taxRate ?? 0}%`} />
                  <Field label="Employees" value={String(profile.numEmployees ?? 0)} />
                  <Field label="Currency" value={String(profile.currency ?? "USD")} />
                  <Field label="Language" value={String(profile.language ?? "en")} />
                  <Field label="Storage Mode" value={String(profile.storageMode ?? "")} />
                  <Field label="Onboarding" value={(profile.onboardingCompleted as boolean) ? "Complete" : "Pending"} />
                  <Field label="Created" value={fmtDate(String(profile.createdAt))} />
                </dl>
              )}
            </div>

            {/* User Account Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-300 font-medium">
                  <User className="w-4 h-4 text-emerald-400" /> Account
                </div>
                {editingUser ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingUser(false)} className="text-zinc-400 h-7">
                      <X className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveUser} disabled={savingUser}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-7">
                      <Save className="w-3 h-3" />
                      {savingUser ? "Saving…" : "Save"}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditingUser(true)}
                    className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-7">
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                )}
              </div>

              {editingUser ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditField label="Full Name" fieldKey="fullName" value={userFields.fullName} onChange={setField(setUserFields)} />
                  <EditField label="Email" fieldKey="email" type="email" value={userFields.email} onChange={setField(setUserFields)} />
                  <EditField label="Phone Number" fieldKey="phoneNumber" type="tel" value={userFields.phoneNumber} onChange={setField(setUserFields)} />
                  <EditField label="Role" fieldKey="role" value={userFields.role} onChange={setField(setUserFields)}
                    options={[
                      { label: "Store Owner", value: "store_owner" },
                      { label: "Business Owner", value: "business_owner" },
                    ]}
                  />
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <Field label="Full Name" value={detail.user.fullName ?? ""} />
                  <Field label="Email" value={detail.user.email ?? ""} />
                  <Field label="Phone" value={detail.user.phoneNumber ?? ""} />
                  <Field label="Email Verified" value={detail.user.emailVerified ? "Yes" : "No"} />
                  <Field label="Role" value={detail.user.role ?? ""} />
                  <Field label="Account Created" value={fmtDate(detail.user.createdAt)} />
                  <Field label="Last Login" value={detail.user.lastLoginAt ? fmtDate(detail.user.lastLoginAt) : "Never"} />
                </dl>
              )}
            </div>
          </TabsContent>

          {/* Products */}
          <TabsContent value="products">
            <DataTable
              data={(tabData.products ?? []) as Record<string, unknown>[]}
              columns={["name", "sku", "category", "price", "quantity"]}
            />
          </TabsContent>

          {/* Sales */}
          <TabsContent value="sales">
            <DataTable
              data={(tabData.sales ?? []) as Record<string, unknown>[]}
              columns={["receiptNumber", "total", "subtotal", "tax", "createdAt"]}
              formatters={{ total: fmt, subtotal: fmt, tax: fmt, createdAt: fmtDate }}
            />
          </TabsContent>

          {/* Employees */}
          <TabsContent value="employees">
            <DataTable
              data={(tabData.employees ?? []) as Record<string, unknown>[]}
              columns={["name", "role", "hourlyWage"]}
              formatters={{ hourlyWage: (v) => `$${Number(v).toFixed(2)}/hr` }}
            />
          </TabsContent>

          {/* Expenses */}
          <TabsContent value="expenses">
            <DataTable
              data={(tabData.expenses ?? []) as Record<string, unknown>[]}
              columns={["description", "category", "amount", "date"]}
              formatters={{ amount: fmt, date: fmtDate }}
            />
          </TabsContent>

          {/* Suppliers */}
          <TabsContent value="suppliers">
            <DataTable
              data={(tabData.suppliers ?? []) as Record<string, unknown>[]}
              columns={["name", "contactName", "phone", "email"]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ─── Data Table ───────────────────────────────────────────────────────────────

function DataTable({
  data, columns, formatters = {},
}: {
  data: Record<string, unknown>[];
  columns: string[];
  formatters?: Record<string, (v: unknown) => string>;
}) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 bg-zinc-900 rounded-xl border border-zinc-800">
        No data yet.
      </div>
    );
  }
  const label = (col: string) => col.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {columns.map((c) => (
              <th key={c} className="text-left px-4 py-3 text-xs text-zinc-500 font-medium whitespace-nowrap">
                {label(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-800/40 transition-colors">
              {columns.map((c) => {
                const raw = row[c];
                const val = formatters[c] ? formatters[c](raw) : String(raw ?? "—");
                return (
                  <td key={c} className="px-4 py-2.5 text-zinc-300 whitespace-nowrap">
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
