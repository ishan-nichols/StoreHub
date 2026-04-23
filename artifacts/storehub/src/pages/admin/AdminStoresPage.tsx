import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Search, PlusCircle, Trash2, ExternalLink, AlertCircle } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { listStores, deleteStore, type AdminStore } from "../../services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminStoresPage() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listStores()
      .then(setStores)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = stores.filter((s) => {
    const q = query.toLowerCase();
    return (
      s.storeName.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      s.businessType.toLowerCase().includes(q) ||
      (s.storeCity ?? "").toLowerCase().includes(q)
    );
  });

  async function handleDelete(userId: string, storeName: string) {
    if (!confirm(`Delete "${storeName || "this store"}"? This cannot be undone.`)) return;
    setDeleting(userId);
    try {
      await deleteStore(userId);
      setStores((prev) => prev.filter((s) => s.userId !== userId));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <AdminLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Stores</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {loading ? "Loading..." : `${stores.length} store${stores.length !== 1 ? "s" : ""} total`}
            </p>
          </div>
          <Link href="/admin/stores/new">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <PlusCircle className="w-4 h-4" />
              Create Store
            </Button>
          </Link>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by store name, email, type, or city…"
            className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg border border-zinc-800 h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 bg-zinc-900 rounded-xl border border-zinc-800">
            {query ? "No stores match your search." : "No stores yet."}
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Store</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Revenue</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Products</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Employees</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Created</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((s) => (
                  <tr key={s.userId} className="hover:bg-zinc-800/40 transition-colors group">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200">{s.storeName || "(Unnamed)"}</p>
                      <p className="text-xs text-zinc-500">{s.email}</p>
                      {s.storeCity && <p className="text-xs text-zinc-600">{s.storeCity}</p>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 capitalize">{s.businessType}</td>
                    <td className="px-4 py-3 font-medium text-zinc-300">{fmt(s.revenue)}</td>
                    <td className="px-4 py-3 text-zinc-400">{s.productCount}</td>
                    <td className="px-4 py-3 text-zinc-400">{s.employeeCount}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.onboardingCompleted
                          ? "bg-emerald-900 text-emerald-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}>
                        {s.onboardingCompleted ? "Active" : "Setup"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/admin/stores/${s.userId}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-600 hover:text-red-400"
                          disabled={deleting === s.userId}
                          onClick={() => handleDelete(s.userId, s.storeName)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
