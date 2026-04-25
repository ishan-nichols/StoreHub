import { useEffect, useReducer } from "react";
import { Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import {
  getMyBusiness, getBusinessStats, setupBusiness,
  type BusinessInfo, type BusinessStats,
} from "../../services/businessService";
import { PageHero, SummaryTile, SurfaceCard, SectionTitle } from "../../components/page-shell";
import {
  AlertCircle, ArrowRight, Building2, CheckCircle, Clock,
  DollarSign, Loader2, Package, PlusCircle, Store, Users,
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
  | { phase: "setup";  error: string | null; saving: boolean }
  | { phase: "ready";  business: BusinessInfo; stats: BusinessStats; error: string | null }
  | { phase: "error";  message: string };

type Action =
  | { type: "LOADED"; business: BusinessInfo; stats: BusinessStats }
  | { type: "NEEDS_SETUP" }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "SETUP_START" }
  | { type: "SETUP_ERROR"; error: string }
  | { type: "SETUP_DONE"; business: BusinessInfo }
  | { type: "STATS_REFRESH"; stats: BusinessStats };

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return { phase: "ready", business: action.business, stats: action.stats, error: null };
    case "NEEDS_SETUP":
      return { phase: "setup", error: null, saving: false };
    case "LOAD_ERROR":
      return { phase: "error", message: action.message };
    case "SETUP_START":
      return state.phase === "setup" ? { ...state, saving: true, error: null } : state;
    case "SETUP_ERROR":
      return state.phase === "setup" ? { ...state, saving: false, error: action.error } : state;
    case "SETUP_DONE":
      return {
        phase: "ready",
        business: action.business,
        stats: { totalStores: 0, totalRevenue: 0, totalProducts: 0, totalEmployees: 0, stores: [] },
        error: null,
      };
    case "STATS_REFRESH":
      return state.phase === "ready" ? { ...state, stats: action.stats } : state;
    default:
      return state;
  }
}

// ── Business setup card ──────────────────────────────────────────────────────

function SetupCard({ state, dispatch }: {
  state: Extract<State, { phase: "setup" }>;
  dispatch: React.Dispatch<Action>;
}) {
  const { recheckAuth } = useAuth();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim();
    if (!name) return;
    dispatch({ type: "SETUP_START" });
    try {
      const biz = await setupBusiness(name);
      // Refresh auth context so req.businessId is available for next API call.
      await recheckAuth();
      dispatch({ type: "SETUP_DONE", business: biz });
    } catch (err) {
      dispatch({ type: "SETUP_ERROR", error: (err as Error).message });
    }
  }

  return (
    <SurfaceCard className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200">
          <Building2 size={24} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Name your business</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            This is the umbrella entity that owns all your stores.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-400">
            Business name
          </label>
          <input
            name="name"
            required
            autoFocus
            placeholder="e.g. Acme Retail Group"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {state.error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={state.saving}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {state.saving
            ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
            : "Create business"}
        </button>
      </form>
    </SurfaceCard>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BusinessDashboardPage() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reduce, { phase: "loading" });

  useEffect(() => {
    async function boot() {
      try {
        const biz = await getMyBusiness();
        if (!biz) {
          dispatch({ type: "NEEDS_SETUP" });
          return;
        }
        const stats = await getBusinessStats(biz.id);
        dispatch({ type: "LOADED", business: biz, stats });
      } catch (err) {
        dispatch({ type: "LOAD_ERROR", message: (err as Error).message });
      }
    }
    void boot();
  }, []);

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.phase === "loading") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="soft-panel h-28 animate-pulse rounded-[30px]" />
        ))}
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state.phase === "error") {
    return (
      <SurfaceCard className="border border-red-200 bg-red-50 max-w-lg mx-auto">
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {state.message}
        </div>
      </SurfaceCard>
    );
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (state.phase === "setup") {
    return (
      <div className="space-y-8">
        <PageHero
          eyebrow="Welcome"
          title={`Hi ${firstName}, let's get started.`}
          description="Create your business entity before adding stores."
          stats={<></>}
        />
        <SetupCard state={state} dispatch={dispatch} />
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  const { business, stats } = state;

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Business overview"
        title={`Welcome back, ${firstName}.`}
        description={`Managing ${stats.totalStores} store${stats.totalStores === 1 ? "" : "s"} under ${business.name}.`}
        stats={
          <>
            <SummaryTile label="Stores"    value={String(stats.totalStores)}   hint="Active locations"    />
            <SummaryTile label="Revenue"   value={fmtRevenue(stats.totalRevenue)} hint="All stores combined" />
            <SummaryTile label="Products"  value={String(stats.totalProducts)}  hint="Combined catalog"    />
            <SummaryTile label="Employees" value={String(stats.totalEmployees)} hint="Total headcount"     />
          </>
        }
      />

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {([
          { label: "Total stores",     value: String(stats.totalStores),    Icon: Store,      hint: "All locations"        },
          { label: "Combined revenue", value: fmtRevenue(stats.totalRevenue), Icon: DollarSign, hint: "All time, all stores" },
          { label: "Total products",   value: String(stats.totalProducts),   Icon: Package,    hint: "Combined catalog"     },
          { label: "Total employees",  value: String(stats.totalEmployees),  Icon: Users,      hint: "Across all stores"    },
        ] as const).map(({ label, value, Icon, hint }) => (
          <SurfaceCard key={label}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-stone-500">{label}</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{value}</div>
                <div className="mt-2 text-sm text-stone-500">{hint}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Icon size={20} />
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>

      {/* Store list preview OR empty state */}
      {stats.stores.length > 0 ? (
        <SurfaceCard className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle title="Your stores" description="Performance snapshot across all locations." />
            <Link href="/business/stores">
              <a className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                View all <ArrowRight size={14} />
              </a>
            </Link>
          </div>

          <div className="space-y-3">
            {stats.stores.slice(0, 5).map((store) => (
              <div key={store.userId}
                className="flex items-center gap-4 rounded-[20px] border border-white/60 bg-white/60 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700">
                  <Store size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-stone-900">{store.storeName}</span>
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                      {BUSINESS_TYPES[store.businessType] ?? store.businessType}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">{store.ownerName}</div>
                </div>
                <div className="hidden items-center gap-6 sm:flex">
                  <div className="text-right">
                    <div className="text-xs text-stone-400">Revenue</div>
                    <div className="text-sm font-semibold text-stone-800">{fmtRevenue(store.revenue)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-400">Products</div>
                    <div className="text-sm font-semibold text-stone-800">{store.productCount}</div>
                  </div>
                </div>
                <div className="shrink-0">
                  {store.onboardingCompleted
                    ? <CheckCircle size={16} className="text-emerald-500" />
                    : <Clock size={16} className="text-amber-500" />}
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="py-14 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
            <Building2 size={28} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-stone-900">No stores yet</h3>
            <p className="mt-1 text-sm text-stone-500">Add your first store to start tracking performance.</p>
          </div>
          <Link href="/business/stores/new">
            <a className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
              <PlusCircle size={16} /> Add first store
            </a>
          </Link>
        </SurfaceCard>
      )}

      {/* Business info card */}
      <SurfaceCard className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="Business profile" description="Your business entity details." />
          <Link href="/business/settings">
            <a className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
              Edit <ArrowRight size={14} />
            </a>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Business name" value={business.name} />
          {business.description && <InfoRow label="Description" value={business.description} />}
          {business.website && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">Website</div>
              <a href={business.website} target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-sm font-medium text-indigo-600 hover:underline">
                {business.website}
              </a>
            </div>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-stone-800">{value}</div>
    </div>
  );
}
