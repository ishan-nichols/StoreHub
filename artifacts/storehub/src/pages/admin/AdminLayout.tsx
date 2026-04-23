import { Link, useLocation } from "wouter";
import { LayoutDashboard, LogOut, PlusCircle, ShieldCheck, Store } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, note: "Platform overview" },
  { href: "/admin/stores", label: "Stores", icon: Store, note: "Manage accounts" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="app-shell-bg flex min-h-screen">
      <aside className="hidden w-[320px] shrink-0 border-r border-white/40 bg-white/35 md:block">
        <div className="flex h-full flex-col">
          <div className="px-5 pb-5 pt-6">
            <div className="glass-panel rounded-[28px] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-950 text-white">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">Admin</p>
                  <h1 className="text-base font-semibold text-stone-950">StoreHub Control</h1>
                  <p className="mt-1 text-xs text-stone-500">Oversight for all stores, activity, and account setup.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-1 px-3">
            {NAV.map(({ href, label, icon: Icon, note }) => {
              const active = location === href || (href !== "/admin" && location.startsWith(href));
              return (
                <Link key={href} href={href}>
                  <a className={`flex items-center gap-3 rounded-[22px] px-4 py-3 transition ${active ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-white/70 hover:text-stone-900"}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-white/10" : "bg-white text-amber-700"}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className={`text-xs ${active ? "text-white/60" : "text-stone-400"}`}>{note}</div>
                    </div>
                  </a>
                </Link>
              );
            })}
          </div>

          <div className="px-4 pb-5 pt-4">
            <Link href="/admin/stores/new">
              <a className="mb-3 flex items-center gap-3 rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 text-sm text-stone-700 shadow-sm backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <PlusCircle size={18} />
                </div>
                <div>
                  <div className="font-semibold">Create store</div>
                  <div className="text-xs text-stone-500">Spin up a new owner account and workspace.</div>
                </div>
              </a>
            </Link>

            <div className="rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 text-sm font-semibold text-white">
                  {(user?.fullName?.slice(0, 1) ?? "A").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-900">{user?.fullName ?? "Admin"}</div>
                  <div className="truncate text-xs text-stone-500">{user?.email}</div>
                </div>
                <button onClick={() => void logout()} className="rounded-2xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6">{children}</main>
    </div>
  );
}
