import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "../contexts/useApp";
import {
  ArrowUpRight,
  BarChart2,
  LayoutDashboard,
  Menu,
  Package,
  Plug,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";

interface NavItem {
  key: string;
  label: string;
  note: string;
  path: string;
  icon: React.ReactNode;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, t, trackFeature, uiPreferences } = useApp();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  const isSolo = profile?.storeSize === "solo" || (profile?.numEmployees === 0 && profile?.onboardingVersion === 2);
  const painPoints = profile?.painPoints ?? [];
  const goal = profile?.goal ?? "";

  const baseItems: NavItem[] = [
    { key: "dashboard", label: t.nav.dashboard, note: "Daily pulse", path: "/dashboard", icon: <LayoutDashboard size={18} /> },
    { key: "pos", label: t.nav.pos, note: "Fast checkout", path: "/pos", icon: <ShoppingCart size={18} /> },
    { key: "inventory", label: t.nav.inventory, note: "Products and stock", path: "/inventory", icon: <Package size={18} /> },
    { key: "sales", label: t.nav.sales, note: "Orders and receipts", path: "/sales", icon: <Receipt size={18} /> },
    { key: "expenses", label: t.nav.expenses, note: "Money going out", path: "/expenses", icon: <Wallet size={18} /> },
    { key: "reports", label: "Reports", note: "What is changing", path: "/reports", icon: <BarChart2 size={18} /> },
    { key: "automations", label: "Automations", note: "Work on autopilot", path: "/automations", icon: <Zap size={18} /> },
    { key: "integrations", label: "Integrations", note: "Connect tools", path: "/integrations", icon: <Plug size={18} /> },
    { key: "suppliers", label: t.nav.suppliers, note: "Vendors and deliveries", path: "/suppliers", icon: <Truck size={18} /> },
    ...(!isSolo ? [{ key: "employees", label: t.nav.employees, note: "Team access", path: "/employees", icon: <Users size={18} /> }] : []),
    { key: "settings", label: t.nav.settings, note: "Store preferences", path: "/settings", icon: <Settings size={18} /> },
  ];

  const navItems = useMemo(() => {
    const priorityKeys: string[] = [];
    if (goal === "profit" || goal === "numbers" || painPoints.includes("profits") || painPoints.includes("numbers")) {
      priorityKeys.push("reports");
    }
    if (painPoints.includes("employees") && !isSolo) priorityKeys.push("employees");
    if (painPoints.includes("suppliers")) priorityKeys.push("suppliers");
    if (painPoints.includes("reorder")) priorityKeys.push("inventory");
    if (priorityKeys.length === 0) return baseItems;

    const pinned = priorityKeys.map((key) => baseItems.find((item) => item.key === key)).filter(Boolean) as NavItem[];
    const rest = baseItems.filter((item) => !priorityKeys.includes(item.key));
    const dashboard = rest.shift();
    return dashboard ? [dashboard, ...pinned, ...rest] : [...pinned, ...rest];
  }, [baseItems, goal, isSolo, painPoints]);

  const activeItem = navItems.find((item) => location.startsWith(item.path)) ?? navItems[0];
  const storeName = profile?.storeName || "StoreHub";
  const ownerFirstName = profile?.ownerName?.split(" ")[0] || "there";

  useEffect(() => {
    const el = mainRef.current;
    if (!el || uiPreferences.motionLevel === "reduced") return;

    let frame = 0;
    let target = el.scrollTop;
    let current = el.scrollTop;
    let programmatic = false;
    const rootStyles = getComputedStyle(document.documentElement);
    const lerpRaw = Number.parseFloat(rootStyles.getPropertyValue("--scroll-lerp"));
    const baseLerp = Number.isFinite(lerpRaw) ? lerpRaw : 0.14;

    const animate = () => {
      const distance = Math.abs(target - current);
      const adaptiveLerp = Math.min(0.28, baseLerp + Math.min(0.09, distance / 2400));
      current += (target - current) * adaptiveLerp;
      if (Math.abs(target - current) < 0.5) {
        current = target;
      }

      programmatic = true;
      el.scrollTop = current;
      programmatic = false;

      if (Math.abs(target - current) >= 0.5) {
        frame = window.requestAnimationFrame(animate);
      } else {
        frame = 0;
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      // Only prevent default for mouse wheel; allow natural trackpad momentum
      const isMouseWheel = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) > 100;
      if (isMouseWheel || uiPreferences.motionLevel === "reduced") {
        event.preventDefault();
      }

      const maxScroll = el.scrollHeight - el.clientHeight;
      const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1;
      const weightedDelta = event.deltaY * modeScale * 0.9;
      target = Math.max(0, Math.min(maxScroll, target + weightedDelta));
      if (!frame) {
        frame = window.requestAnimationFrame(animate);
      }
    };

    const onScroll = () => {
      if (programmatic) return;
      target = el.scrollTop;
      current = el.scrollTop;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [uiPreferences.motionLevel]);

  function navigate(item: NavItem) {
    trackFeature(item.key);
    setLocation(item.path);
    setMobileOpen(false);
  }

  function isActive(path: string) {
    return location === path || (path !== "/" && location.startsWith(path));
  }

  function SidebarContent() {
    return (
      <div className="flex h-full flex-col">
        <div className="px-5 pb-5 pt-6">
          <button
            onClick={() => { setLocation("/dashboard"); setMobileOpen(false); }}
            className="glass-panel motion-card rounded-[28px] p-4 w-full text-left hover:brightness-[1.02] transition-all active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              {profile?.logoDataUrl ? (
                <img
                  src={profile.logoDataUrl}
                  alt={storeName}
                  className="h-12 w-12 rounded-2xl object-contain bg-white shadow-sm border border-stone-100 shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-amber-600 text-white shadow-lg shadow-amber-200/80">
                  <Store size={20} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700/70">StoreHub</p>
                <h1 className="truncate text-base font-semibold text-stone-900">{storeName}</h1>
                <p className="mt-1 text-xs text-stone-500">Built for calm, quick store management.</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-stone-950 px-4 py-3 text-white">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Today</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Focus</p>
                  <p className="text-xs text-white/60">{activeItem?.note ?? "Store overview"}</p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.key}
                onClick={() => navigate(item)}
                className={`nav-motion-item group flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left transition-all ${
                  active
                    ? "bg-stone-950 text-white shadow-lg shadow-stone-900/10"
                    : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-white/10" : "bg-white text-amber-700 shadow-sm"}`}>
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className={`text-xs ${active ? "text-white/60" : "text-stone-400 group-hover:text-stone-500"}`}>{item.note}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-5">
          {!isSolo && (
            <a
              href="/employee"
              target="_blank"
              rel="noopener noreferrer"
              className="soft-panel motion-card mb-3 flex items-center gap-3 rounded-[24px] px-4 py-3 text-sm text-stone-700 transition-transform hover:-translate-y-0.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Employee portal</div>
                <div className="text-xs text-stone-500">Clock-ins, quick access, shared with your team.</div>
              </div>
              <ArrowUpRight size={16} className="text-stone-400" />
            </a>
          )}

          <div className="motion-card rounded-[24px] border border-white/70 bg-white/72 px-4 py-3 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 text-sm font-semibold text-white">
                {ownerFirstName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-stone-900">{profile?.ownerName ?? "Store owner"}</div>
                <div className="truncate text-xs text-stone-500">{profile?.businessType ?? "Retail"} workspace</div>
              </div>
              <Sparkles size={16} className="ml-auto text-amber-500" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-bg flex h-screen overflow-hidden">
      <aside className="hidden h-screen w-[320px] shrink-0 border-r border-white/40 bg-white/35 md:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[88%] max-w-[320px] bg-[#f4efe6] shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="motion-button absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/75 text-stone-500"
            >
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/40 bg-white/45 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="motion-button flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-stone-600 shadow-sm md:hidden"
              >
                <Menu size={18} />
              </button>
              {/* Logo in mobile header */}
              {profile?.logoDataUrl && (
                <button onClick={() => setLocation("/dashboard")} className="md:hidden shrink-0">
                  <img src={profile.logoDataUrl} alt={storeName} className="h-9 w-9 rounded-xl object-contain bg-white border border-stone-100 shadow-sm" />
                </button>
              )}
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Workspace</div>
                <div className="text-lg font-semibold text-stone-900">{activeItem?.label ?? "StoreHub"}</div>
              </div>
            </div>

            <div className="hidden items-center gap-3 rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm text-stone-600 shadow-sm sm:flex">
              <Sparkles size={15} className="text-amber-500" />
              <span>{storeName}</span>
            </div>
          </div>
        </header>

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-8 md:py-6">
          <div className="page-reveal">{children}</div>
        </main>
      </div>
    </div>
  );
}
