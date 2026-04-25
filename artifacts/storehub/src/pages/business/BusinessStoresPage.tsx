import { useEffect, useReducer } from "react";
import { Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import {
  getMyBusiness, getBusinessStats,
  type StoreInfo,
} from "../../services/businessService";
import { PageHero, SummaryTile, SurfaceCard, SectionTitle } from "../../components/page-shell";
import {
  AlertCircle, Building2, CheckCircle, Clock, DollarSign,
  LogIn, Package, PlusCircle, Store, Users,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const BUSINESS_TYPES: Record<string, string> = {
  cstore: "C-Store", grocery: "Grocery", butcher: "Butcher", bakery: "Bakery",
  liquor: "Liquor", clothing: "Clothing", restaurant: "Restaurant",
  pharmacy: "Pharmacy", general: "General", other: "Other",
};

function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ── State ────────────────────────────────────────────────────────────────────

type State =
  | { phase: "loading" }
  | { phase: "ready"; stores: StoreInfo[]; businessId: string }
  | { phase: "no-business" }
  | { phase: "error"; message: string };

type Action =
  | { type: "LOADED"; stores: StoreInfo[]; businessId: string }
  | { type: "NO_BUSINESS" }
  | { type: "ERROR"; message: string };

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":     return { phase: "ready", stores: action.stores, businessId: action.businessId };
    case "NO_BUSINESS": return { phase: "no-business" };
    case "ERROR":      return { phase: "error", message: action.message };
    default:           return state;
  }
}

// ── Store card ───────────────────────────────────────────────────────────────

function StoreCard({
  store,
  onEnter,
}: {
  store: StoreInfo;
  onEnter: () => void;
}) {
  return (
    <div className="group rounded-[20px] border border-white/60 bg-white/60 p-4 transition-all hover:border-indigo-200 hover:bg-white/80 hover:shadow-md">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700">
          <Store size={20} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-stone-900">{store.storeName}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
              {BUSINESS_TYPES[store.businessType] ?? store.businessType}
            </span>
            {store.onboardingCompleted ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle size={11} /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Clock size={11} /> Setup pending
              </span>
            )}
          </div>

          {/* Owner + city */}
          <div className="mt-0.5 text-sm text-stone-500">
            {store.ownerName}{store.storeCity ? ` · ${store.storeCity}` : ""}
          </div>

          {/* Stats + Enter button */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-5">
              <Stat icon={DollarSign} label="Revenue"   value={fmtRevenue(store.revenue)}      />
              <Stat icon={Package}    label="Products"  value={String(store.productCount)}      />
              <Stat icon={Users}      label="Employees" value={String(store.employeeCount)}     />
            </div>
            <button
              onClick={onEnter}
              className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 transition-colors"
            >
              <LogIn size={13} /> Enter store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-stone-400" />
      <span className="text-xs text-stone-500">{label}:</span>
      <span className="text-xs font-semibold text-stone-800">{value}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BusinessStoresPage() {
  const { businessId: ctxBusinessId, switchToStore } = useAuth();
  const [state, dispatch] = useReducer(reduce, { phase: "loading" });

  useEffect(() => {
    async function load() {
      try {
        // Prefer businessId from auth context (avoids an extra round-trip).
        let bid = ctxBusinessId;
        if (!bid) {
          const biz = await getMyBusiness();
          if (!biz) { dispatch({ type: "NO_BUSINESS" }); return; }
          bid = biz.id;
        }
        const stats = await getBusinessStats(bid);
        dispatch({ type: "LOADED", stores: stats.stores, businessId: bid });
      } catch (err) {
        dispatch({ type: "ERROR", message: (err as Error).message });
      }
    }
    void load();
  }, [ctxBusinessId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.phase === "loading") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="soft-panel h-24 animate-pulse rounded-[24px]" />
        ))}
      </div>
    );
  }

  // ── No business ────────────────────────────────────────────────────────────
  if (state.phase === "no-business") {
    return (
      <SurfaceCard className="py-14 text-center space-y-5 max-w-lg mx-auto">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
          <Building2 size={28} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-stone-900">No business set up yet</h3>
          <p className="mt-1 text-sm text-stone-500">
            Go to the dashboard to create your business before adding stores.
          </p>
        </div>
        <Link href="/business">
          <a className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
            Go to dashboard
          </a>
        </Link>
      </SurfaceCard>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state.phase === "error") {
    return (
      <SurfaceCard className="border border-red-200 bg-red-50">
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {state.message}
        </div>
      </SurfaceCard>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  const { stores } = state;
  const onboarded    = stores.filter(s => s.onboardingCompleted).length;
  const totalRevenue = stores.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Your stores"
        title="All locations, one view."
        description="Every store in your portfolio with live performance metrics."
        stats={
          <>
            <SummaryTile label="Total stores" value={String(stores.length)}  hint="Locations"               />
            <SummaryTile label="Onboarded"    value={String(onboarded)}      hint={`${stores.length - onboarded} pending setup`} />
            <SummaryTile label="Total revenue" value={fmtRevenue(totalRevenue)} hint="All stores combined"   />
          </>
        }
      />

      {stores.length === 0 ? (
        <SurfaceCard className="py-14 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
            <Building2 size={28} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-stone-900">No stores yet</h3>
            <p className="mt-1 text-sm text-stone-500">Add your first store to begin tracking performance.</p>
          </div>
          <Link href="/business/stores/new">
            <a className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
              <PlusCircle size={16} /> Add first store
            </a>
          </Link>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle
              title={`${stores.length} store${stores.length === 1 ? "" : "s"}`}
              description="Tap any store to enter and manage it."
            />
            <Link href="/business/stores/new">
              <a className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                <PlusCircle size={15} /> Add store
              </a>
            </Link>
          </div>

          <div className="space-y-3">
            {stores.map((store) => (
              <StoreCard
                key={store.userId}
                store={store}
                onEnter={() => void switchToStore(store.userId, "/dashboard")}
              />
            ))}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
