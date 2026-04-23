import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import {
  getMyBusiness, getBusinessStats,
  type BusinessInfo, type BusinessStats,
} from "../../services/businessService";
import { PageHero, SummaryTile, SurfaceCard, SectionTitle } from "../../components/page-shell";
import {
  AlertCircle, ArrowRight, Building2, DollarSign, Package, Store,
  TrendingUp, Users, CheckCircle, Clock,
} from "lucide-react";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  cstore: "C-Store", grocery: "Grocery", butcher: "Butcher", bakery: "Bakery",
  liquor: "Liquor", clothing: "Clothing", restaurant: "Restaurant",
  pharmacy: "Pharmacy", general: "General", other: "Other",
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function BusinessDashboardPage() {
  const { user } = useAuth();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const biz = await getMyBusiness();
        if (!biz) { setError("No business found for your account."); return; }
        setBusiness(biz);
        const s = await getBusinessStats(biz.id);
        setStats(s);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Business overview"
        title={`Welcome back, ${firstName}.`}
        description={
          business
            ? `Managing ${stats?.totalStores ?? 0} store${(stats?.totalStores ?? 0) === 1 ? "" : "s"} under ${business.name}.`
            : "Your multi-store management hub."
        }
        stats={
          <>
            <SummaryTile label="Stores"    value={String(stats?.totalStores ?? 0)}   hint="Active locations"     />
            <SummaryTile label="Revenue"   value={fmt(stats?.totalRevenue ?? 0)}      hint="Across all stores"    />
            <SummaryTile label="Products"  value={String(stats?.totalProducts ?? 0)}  hint="Combined catalog"     />
            <SummaryTile label="Employees" value={String(stats?.totalEmployees ?? 0)} hint="Total headcount"      />
          </>
        }
      />

      {error && (
        <SurfaceCard className="border border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        </SurfaceCard>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="soft-panel h-28 animate-pulse rounded-[30px]" />
          ))}
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total stores",    value: String(stats?.totalStores ?? 0),   icon: Store,       hint: "All locations"       },
              { label: "Combined revenue",value: fmt(stats?.totalRevenue ?? 0),      icon: DollarSign,  hint: "All time, all stores" },
              { label: "Total products",  value: String(stats?.totalProducts ?? 0),  icon: Package,     hint: "Combined catalog"    },
              { label: "Total employees", value: String(stats?.totalEmployees ?? 0), icon: Users,       hint: "Across all stores"   },
            ].map(({ label, value, icon: Icon, hint }) => (
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

          {/* Store list preview */}
          {(stats?.stores ?? []).length > 0 && (
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionTitle
                  title="Your stores"
                  description="Performance snapshot across all locations."
                />
                <Link href="/business/stores">
                  <a className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                    View all <ArrowRight size={14} />
                  </a>
                </Link>
              </div>

              <div className="space-y-3">
                {(stats?.stores ?? []).slice(0, 5).map((store) => (
                  <div
                    key={store.userId}
                    className="flex items-center gap-4 rounded-[20px] border border-white/60 bg-white/60 px-4 py-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700">
                      <Store size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-stone-900">{store.storeName}</span>
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                          {BUSINESS_TYPE_LABELS[store.businessType] ?? store.businessType}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">{store.ownerName}</div>
                    </div>
                    <div className="hidden items-center gap-6 sm:flex">
                      <div className="text-right">
                        <div className="text-xs text-stone-400">Revenue</div>
                        <div className="text-sm font-semibold text-stone-800">{fmt(store.revenue)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-stone-400">Products</div>
                        <div className="text-sm font-semibold text-stone-800">{store.productCount}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {store.onboardingCompleted ? (
                        <CheckCircle size={16} className="text-emerald-500" />
                      ) : (
                        <Clock size={16} className="text-amber-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          )}

          {/* Empty state */}
          {(stats?.stores ?? []).length === 0 && !loading && (
            <SurfaceCard className="py-12 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-600">
                <Building2 size={28} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900">No stores yet</h3>
                <p className="mt-1 text-sm text-stone-500">Add your first store to start tracking performance.</p>
              </div>
              <Link href="/business/stores/new">
                <a className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors">
                  <Store size={16} /> Add first store
                </a>
              </Link>
            </SurfaceCard>
          )}

          {/* Business info card */}
          {business && (
            <SurfaceCard className="space-y-3">
              <SectionTitle title="Business profile" description="Your business entity details." />
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoRow label="Business name" value={business.name} />
                {business.description && <InfoRow label="Description" value={business.description} />}
                {business.website && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Website</div>
                    <a href={business.website} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-600 hover:underline mt-1 block">
                      {business.website}
                    </a>
                  </div>
                )}
              </div>
              <Link href="/business/settings">
                <a className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                  Edit profile <ArrowRight size={14} />
                </a>
              </Link>
            </SurfaceCard>
          )}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-stone-800">{value}</div>
    </div>
  );
}
