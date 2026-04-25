import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard, Store, PlusCircle, Settings, LogOut, Building2, Menu, X,
} from "lucide-react";

const NAV = [
  { href: "/business",         label: "Dashboard", icon: LayoutDashboard, note: "Business overview"   },
  { href: "/business/stores",  label: "Stores",    icon: Store,           note: "All your locations"  },
  { href: "/business/settings",label: "Settings",  icon: Settings,        note: "Business profile"    },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return location === href || (href !== "/business" && location.startsWith(href));
  }

  function Sidebar() {
    return (
      <div className="flex h-full flex-col">
        {/* Header card — click to go home */}
        <div className="px-5 pb-5 pt-6">
          <Link href="/business">
            <a
              onClick={() => setMobileOpen(false)}
              className="glass-panel motion-card rounded-[28px] p-4 block w-full text-left hover:brightness-[1.02] transition-all active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 text-white shadow-lg">
                  <Building2 size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-700/70">Business Owner</p>
                  <h1 className="truncate text-base font-semibold text-stone-900">{user?.fullName ?? "My Business"}</h1>
                  <p className="mt-1 text-xs text-stone-500">Multi-store management hub.</p>
                </div>
              </div>
            </a>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 space-y-1 px-3 pb-4">
          {NAV.map(({ href, label, icon: Icon, note }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}>
                <a
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-[22px] px-4 py-3 transition-all ${
                    active
                      ? "bg-stone-950 text-white shadow-lg shadow-stone-900/10"
                      : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-white/10" : "bg-white text-indigo-600 shadow-sm"}`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{label}</div>
                    <div className={`text-xs ${active ? "text-white/60" : "text-stone-400"}`}>{note}</div>
                  </div>
                </a>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-5">
          <Link href="/business/stores/new">
            <a
              onClick={() => setMobileOpen(false)}
              className="mb-3 flex items-center gap-3 rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 text-sm text-stone-700 shadow-sm backdrop-blur-md hover:-translate-y-0.5 transition-transform"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <PlusCircle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Add store</div>
                <div className="text-xs text-stone-500">Create a new location.</div>
              </div>
            </a>
          </Link>

          <div className="rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 text-sm font-semibold text-white">
                {(user?.fullName?.slice(0, 1) ?? "B").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-900">{user?.fullName ?? "Business owner"}</div>
                <div className="truncate text-xs text-stone-500">{user?.email}</div>
              </div>
              <button
                onClick={() => void logout()}
                className="rounded-2xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-bg flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-[320px] shrink-0 border-r border-white/40 bg-white/35 md:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[88%] max-w-[320px] bg-[#f4efe6] shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/75 text-stone-500"
            >
              <X size={18} />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/40 bg-white/45 backdrop-blur-xl">
          <div className="flex items-center gap-4 px-4 py-4 md:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-stone-600 shadow-sm md:hidden"
            >
              <Menu size={18} />
            </button>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Business</div>
              <div className="text-lg font-semibold text-stone-900">
                {NAV.find(n => isActive(n.href))?.label ?? "Overview"}
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
