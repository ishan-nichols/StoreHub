import { useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "../contexts/useApp";
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, TrendingDown,
  Truck, Users, Settings, Menu, X, Store, ExternalLink,
  BarChart2, Zap, Plug,
} from "lucide-react";

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, t, trackFeature } = useApp();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSolo    = profile?.storeSize === "solo" || (profile?.numEmployees === 0 && profile?.onboardingVersion === 2);
  const painPoints = profile?.painPoints ?? [];
  const goal       = profile?.goal ?? "";

  // Build base nav item pool
  const baseItems: NavItem[] = [
    { key: "dashboard",    label: t.nav.dashboard,  icon: <LayoutDashboard size={20} />, path: "/dashboard"    },
    { key: "pos",          label: t.nav.pos,         icon: <ShoppingCart size={20} />,   path: "/pos"          },
    { key: "inventory",    label: t.nav.inventory,   icon: <Package size={20} />,         path: "/inventory"    },
    { key: "sales",        label: t.nav.sales,       icon: <Receipt size={20} />,         path: "/sales"        },
    { key: "expenses",     label: t.nav.expenses,    icon: <TrendingDown size={20} />,    path: "/expenses"     },
    { key: "reports",      label: "Reports",          icon: <BarChart2 size={20} />,       path: "/reports"      },
    { key: "automations",  label: "Automations",      icon: <Zap size={20} />,             path: "/automations"  },
    { key: "integrations", label: "Integrations",     icon: <Plug size={20} />,            path: "/integrations" },
    { key: "suppliers",    label: t.nav.suppliers,   icon: <Truck size={20} />,            path: "/suppliers"    },
    ...(!isSolo
      ? [{ key: "employees", label: t.nav.employees, icon: <Users size={20} />, path: "/employees" }]
      : []),
    { key: "settings",     label: t.nav.settings,    icon: <Settings size={20} />,        path: "/settings"     },
  ];

  // Reorder based on pain points and goal
  function buildNavItems(): NavItem[] {
    const items = [...baseItems];
    const priorityKeys: string[] = [];

    // goal-based priority
    if (goal === "profit" || goal === "numbers" || painPoints.includes("profits") || painPoints.includes("numbers")) {
      priorityKeys.push("reports");
    }
    if (painPoints.includes("employees") && !isSolo) {
      priorityKeys.push("employees");
    }
    if (painPoints.includes("suppliers")) {
      priorityKeys.push("suppliers");
    }
    if (painPoints.includes("reorder")) {
      priorityKeys.push("inventory");
    }

    if (priorityKeys.length === 0) return items;

    // Move prioritized items up — right after "dashboard"
    const dashIdx   = items.findIndex(i => i.key === "dashboard");
    const others    = items.filter(i => !priorityKeys.includes(i.key));
    const priority  = priorityKeys.map(k => items.find(i => i.key === k)!).filter(Boolean);
    const before    = others.slice(0, dashIdx + 1);
    const after     = others.slice(dashIdx + 1);
    return [...before, ...priority, ...after];
  }

  const navItems = buildNavItems();

  function navigate(item: NavItem) {
    trackFeature(item.key);
    setLocation(item.path);
    setMobileOpen(false);
  }

  function isActive(path: string) {
    return location === path || (path !== "/" && location.startsWith(path));
  }

  const storeName = profile?.storeName ?? "StoreHub";

  const SidebarContent = () => (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-amber-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Store size={22} className="text-amber-500" />
          <div>
            <div className="font-bold text-amber-600 text-base leading-tight">{storeName}</div>
            <div className="text-xs text-gray-400">StoreHub</div>
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => navigate(item)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
              isActive(item.path)
                ? "bg-amber-500 text-white shadow-md shadow-amber-200 dark:shadow-amber-900/30"
                : "text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-gray-700 hover:text-amber-700"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Employee Portal link — only shown when not solo */}
      {!isSolo && (
        <div className="px-3 pb-2 border-t border-amber-100 dark:border-gray-700 pt-3">
          <a
            href="/employee"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <Users size={14} />
            Employee Sign-In Portal
            <ExternalLink size={11} className="ml-auto opacity-60" />
          </a>
        </div>
      )}

      {/* Owner info */}
      <div className="px-4 py-3 border-t border-amber-100 dark:border-gray-700">
        <div className="text-xs text-gray-400">
          {profile?.ownerName && (
            <span className="font-medium text-gray-600 dark:text-gray-300">{profile.ownerName}</span>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shadow-sm shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white dark:bg-gray-800 h-full shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-xl text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition-colors">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Store size={18} className="text-amber-500" />
            <span className="font-bold text-amber-600 text-sm">{storeName}</span>
          </div>
          <div className="w-10" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
