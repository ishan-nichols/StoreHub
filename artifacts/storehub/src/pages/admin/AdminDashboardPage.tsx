import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, DollarSign, Package, Store, TrendingUp, Users } from "lucide-react";
import { Link } from "wouter";
import AdminLayout from "./AdminLayout";
import { PageHero, SectionTitle, SummaryTile, SurfaceCard } from "../../components/page-shell";
import { getAdminStats, listStores, type AdminStats, type AdminStore } from "../../services/adminService";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminStats(), listStores()])
      .then(([dashboardStats, storeList]) => {
        setStats(dashboardStats);
        setStores(storeList.slice(0, 8));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`);

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHero
          eyebrow="Admin dashboard"
          title="A calmer control room for every StoreHub store."
          description="Track onboarding, revenue, product volume, and recent account activity without bouncing between screens."
          stats={
            <>
              <SummaryTile label="Stores" value={String(stats?.totalStores ?? 0)} />
              <SummaryTile label="Revenue" value={fmt(stats?.totalRevenue ?? 0)} />
              <SummaryTile label="Products" value={String(stats?.totalProducts ?? 0)} />
              <SummaryTile label="Onboarded" value={stats ? `${stats.onboardedCount} / ${stats.totalStores}` : "0 / 0"} />
            </>
          }
        />

        {error && (
          <SurfaceCard className="border border-red-200 bg-red-50">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={16} />
              {error}
            </div>
          </SurfaceCard>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="soft-panel h-28 animate-pulse rounded-[30px]" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { label: "Total stores", value: String(stats.totalStores), icon: Store, hint: `${stats.onboardedCount} fully onboarded` },
              { label: "Total revenue", value: fmt(stats.totalRevenue), icon: DollarSign, hint: "Across all stores" },
              { label: "Average revenue", value: fmt(stats.avgRevenuePerStore), icon: TrendingUp, hint: "Per store" },
              { label: "New this month", value: String(stats.newThisMonth), icon: Users, hint: "Fresh signups" },
              { label: "Total products", value: String(stats.totalProducts), icon: Package, hint: "Catalog coverage" },
              { label: "Setup progress", value: `${stats.onboardedCount} / ${stats.totalStores}`, icon: Store, hint: "Stores that completed setup" },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <SurfaceCard key={card.label}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-stone-500">{card.label}</div>
                      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{card.value}</div>
                      <div className="mt-2 text-sm text-stone-500">{card.hint}</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                      <Icon size={20} />
                    </div>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        ) : null}

        <SurfaceCard className="overflow-hidden p-0">
          <div className="px-6 py-5">
            <SectionTitle
              title="Recent stores"
              description="The newest accounts and their current setup status."
              aside={
                <Link href="/admin/stores">
                  <a className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800">
                    View all
                    <ArrowRight size={14} />
                  </a>
                </Link>
              }
            />
          </div>

          {loading ? (
            <div className="space-y-2 px-6 pb-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-[#faf7f1]" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-stone-500">No stores yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-[#faf7f1]">
                    <th className="px-4 py-3 text-left font-semibold text-stone-500">Store</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-500">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-500">Revenue</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-500">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stores.map((store) => (
                    <tr key={store.userId} className="transition-colors hover:bg-[#fcfbf8]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-900">{store.storeName || "(Unnamed)"}</div>
                        <div className="text-xs text-stone-400">{store.email}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-500">{store.businessType}</td>
                      <td className="px-4 py-3 text-stone-700">{fmt(store.revenue)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${store.onboardingCompleted ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                          {store.onboardingCompleted ? "Active" : "Setup"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/stores/${store.userId}`}>
                          <a className="text-xs font-medium text-amber-700 hover:text-amber-800">View →</a>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SurfaceCard>
      </div>
    </AdminLayout>
  );
}
