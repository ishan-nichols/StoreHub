import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, Store, User, DollarSign, Package, Users, Receipt,
  TruckIcon, AlertCircle, Pencil, Save, X, CheckCircle2
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import {
  getStoreDetail, getStoreProducts, getStoreSales,
  getStoreEmployees, getStoreExpenses, getStoreSuppliers,
  updateStoreProfile,
  type AdminStoreDetail,
} from "../../services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabData = { products: unknown[]; sales: unknown[]; employees: unknown[]; expenses: unknown[]; suppliers: unknown[] };

export default function AdminStoreDetailPage() {
  const [, params] = useRoute("/admin/stores/:userId");
  const userId = params?.userId ?? "";

  const [detail, setDetail] = useState<AdminStoreDetail | null>(null);
  const [tabData, setTabData] = useState<Partial<TabData>>({});
  const [loadedTab, setLoadedTab] = useState<string>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getStoreDetail(userId)
      .then((d) => {
        setDetail(d);
        setEditFields({
          storeName: String((d.profile as Record<string, unknown>).storeName ?? ""),
          ownerName: String((d.profile as Record<string, unknown>).ownerName ?? ""),
          storeCity: String((d.profile as Record<string, unknown>).storeCity ?? ""),
          storeAddress: String((d.profile as Record<string, unknown>).storeAddress ?? ""),
          taxRate: String((d.profile as Record<string, unknown>).taxRate ?? "0"),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  async function loadTab(tab: string) {
    if (tab === loadedTab || tab === "overview") return;
    setLoadedTab(tab);
    try {
      if (tab === "products" && !tabData.products) {
        const data = await getStoreProducts(userId);
        setTabData((prev) => ({ ...prev, products: data }));
      } else if (tab === "sales" && !tabData.sales) {
        const data = await getStoreSales(userId);
        setTabData((prev) => ({ ...prev, sales: data }));
      } else if (tab === "employees" && !tabData.employees) {
        const data = await getStoreEmployees(userId);
        setTabData((prev) => ({ ...prev, employees: data }));
      } else if (tab === "expenses" && !tabData.expenses) {
        const data = await getStoreExpenses(userId);
        setTabData((prev) => ({ ...prev, expenses: data }));
      } else if (tab === "suppliers" && !tabData.suppliers) {
        const data = await getStoreSuppliers(userId);
        setTabData((prev) => ({ ...prev, suppliers: data }));
      }
    } catch { /* ignore tab load errors */ }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStoreProfile(userId, {
        storeName: editFields.storeName,
        ownerName: editFields.ownerName,
        storeCity: editFields.storeCity,
        storeAddress: editFields.storeAddress,
        taxRate: parseFloat(editFields.taxRate) || 0,
      });
      setSaveSuccess(true);
      setEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
      const d = await getStoreDetail(userId);
      setDetail(d);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
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
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Back + header */}
        <div className="flex items-start justify-between">
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
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            {!editing ? (
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Profile
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setEditing(false)} className="text-zinc-400">
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
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

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Store profile */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-zinc-300 font-medium">
                  <Store className="w-4 h-4 text-emerald-400" /> Store Profile
                </div>
                {editing ? (
                  <div className="space-y-3">
                    {[
                      { key: "storeName", label: "Store Name" },
                      { key: "ownerName", label: "Owner Name" },
                      { key: "storeCity", label: "City" },
                      { key: "storeAddress", label: "Address" },
                      { key: "taxRate", label: "Tax Rate (%)" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs text-zinc-500 block mb-1">{label}</label>
                        <Input
                          value={editFields[key] ?? ""}
                          onChange={(e) => setEditFields((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    {[
                      ["Store Name", String(profile.storeName ?? "—")],
                      ["Owner", String(profile.ownerName ?? "—")],
                      ["Business Type", String(profile.businessType ?? "—")],
                      ["City", String(profile.storeCity ?? "—")],
                      ["Address", String(profile.storeAddress ?? "—")],
                      ["Tax Rate", `${profile.taxRate ?? 0}%`],
                      ["Currency", String(profile.currency ?? "USD")],
                      ["Language", String(profile.language ?? "en")],
                      ["Storage Mode", String(profile.storageMode ?? "—")],
                      ["Onboarding", profile.onboardingCompleted ? "Complete" : "Pending"],
                      ["Created", fmtDate(String(profile.createdAt))],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="text-zinc-500">{k}</dt>
                        <dd className="text-zinc-300 text-right capitalize">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* User account */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-zinc-300 font-medium">
                  <User className="w-4 h-4 text-emerald-400" /> Account
                </div>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Name", detail.user.fullName],
                    ["Email", detail.user.email ?? "—"],
                    ["Phone", detail.user.phoneNumber ?? "—"],
                    ["Email Verified", detail.user.emailVerified ? "Yes" : "No"],
                    ["Role", detail.user.role],
                    ["Account Created", fmtDate(detail.user.createdAt)],
                    ["Last Login", detail.user.lastLoginAt ? fmtDate(detail.user.lastLoginAt) : "Never"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-zinc-500">{k}</dt>
                      <dd className="text-zinc-300 text-right capitalize">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
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
