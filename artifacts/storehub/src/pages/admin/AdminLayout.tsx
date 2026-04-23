import { Link, useLocation } from "wouter";
import { LayoutDashboard, Store, PlusCircle, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin",        label: "Dashboard",   icon: LayoutDashboard },
  { href: "/admin/stores", label: "All Stores",  icon: Store },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-zinc-800">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-lg tracking-tight">StoreHub Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/admin" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <a className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Quick action */}
        <div className="px-3 pb-4">
          <Link href="/admin/stores/new">
            <a className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
              <PlusCircle className="w-4 h-4" />
              Create Store
            </a>
          </Link>
        </div>

        {/* User footer */}
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{user?.fullName}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="text-zinc-500 hover:text-zinc-100 shrink-0"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
