import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Store, DollarSign, TrendingUp, Users, Package, ArrowRight, AlertCircle
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { getAdminStats, listStores, type AdminStats, type AdminStore } from "../../services/adminService";

function StatCard({
  label, value, icon: Icon, sub,
}: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-zinc-400">{label}</span>
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminStats(), listStores()])
      .then(([s, list]) => {
        setStats(s);
        setStores(list.slice(0, 8));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <AdminLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Overview of all StoreHub stores</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Stores"       value={String(stats.totalStores)}       icon={Store}      sub={`${stats.onboardedCount} onboarded`} />
            <StatCard label="Total Revenue"      value={fmt(stats.totalRevenue)}          icon={DollarSign} sub="all time, all stores" />
            <StatCard label="Avg Revenue/Store"  value={fmt(stats.avgRevenuePerStore)}    icon={TrendingUp} />
            <StatCard label="New This Month"     value={String(stats.newThisMonth)}       icon={Users} />
            <StatCard label="Total Products"     value={String(stats.totalProducts)}      icon={Package} />
            <StatCard label="Onboarded"          value={`${stats.onboardedCount} / ${stats.totalStores}`} icon={Store} sub="completed setup" />
          </div>
        ) : null}

        {/* Recent stores */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-zinc-200">Recent Stores</h2>
            <Link href="/admin/stores">
              <a className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </a>
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 rounded-lg border border-zinc-800 h-14 animate-pulse" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 bg-zinc-900 rounded-xl border border-zinc-800">
              <Store className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No stores yet.</p>
              <Link href="/admin/stores/new">
                <a className="text-emerald-400 hover:text-emerald-300 text-sm mt-1 inline-block">Create the first one →</a>
              </Link>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Store</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Revenue</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {stores.map((s) => (
                    <tr key={s.userId} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-200">{s.storeName || "(Unnamed)"}</p>
                        <p className="text-xs text-zinc-500">{s.email}</p>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 capitalize">{s.businessType}</td>
                      <td className="px-4 py-3 text-zinc-300">{fmt(s.revenue)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.onboardingCompleted
                            ? "bg-emerald-900 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {s.onboardingCompleted ? "Active" : "Setup"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/stores/${s.userId}`}>
                          <a className="text-xs text-emerald-400 hover:text-emerald-300">View →</a>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
