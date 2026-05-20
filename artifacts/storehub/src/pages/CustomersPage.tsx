import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Crown,
  Clock,
  Star,
  Phone,
  Mail,
  StickyNote,
  Plus,
  X,
  ChevronRight,
  ShoppingBag,
  Sparkles,
  AlertCircle,
  Search,
  Settings,
  ToggleLeft,
  ToggleRight,
  Coins,
  RefreshCw,
  Megaphone,
  Zap,
} from "lucide-react";
import {
  PageHero,
  SummaryTile,
  SurfaceCard,
  SectionTitle,
} from "../components/page-shell";
import {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  addPoints,
  redeemPoints,
  generateOffer,
  getPointsPerDollar,
  setPointsPerDollar,
  type Customer,
  type CustomerWithHistory,
} from "../services/customerService";
import CampaignsTab from "./CampaignsTab";
import { getRewardTiers, setRewardTiers, type RewardTier } from "../services/loyaltyService";
import SmartGroupsTab from "./SmartGroupsTab";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "all" | "smartGroups" | "loyalty" | "campaigns";

// ─── Add Customer Modal ───────────────────────────────────────────────────────

function AddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const c = await createCustomer({ name, phone, email });
      onCreated(c);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[30px] border border-white/60 bg-white/90 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-950">New Customer</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-stone-100">
            <X size={18} className="text-stone-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              type="tel"
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              type="email"
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {error && (
            <p className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
              <AlertCircle size={16} /> {error}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-stone-200 px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Customer Slide-Over Panel ────────────────────────────────────────────────

function CustomerPanel({
  customerId,
  onClose,
  onUpdated,
}: {
  customerId: string;
  onClose: () => void;
  onUpdated: (c: Customer) => void;
}) {
  const [data, setData] = useState<CustomerWithHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Points controls
  const [pointsInput, setPointsInput] = useState("");
  const [pointsOp, setPointsOp] = useState<"add" | "redeem">("add");
  const [pointsBusy, setPointsBusy] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  // AI offer
  const [offer, setOffer] = useState<string | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [displayedOffer, setDisplayedOffer] = useState("");
  const intervalRef = useRef<number | null>(null);

  // Notes editing
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getCustomer(customerId);
      setData(d);
      setNotes(d.notes ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Typing animation for offer
  useEffect(() => {
    if (!offer) return;
    setDisplayedOffer("");
    let i = 0;
    intervalRef.current = window.setInterval(() => {
      setDisplayedOffer(offer.slice(0, i + 1));
      i++;
      if (i >= offer.length && intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    }, 18);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [offer]);

  const handlePoints = async () => {
    if (!data) return;
    const pts = parseFloat(pointsInput);
    if (!pts || pts <= 0) {
      setPointsError("Enter a valid amount");
      return;
    }
    setPointsBusy(true);
    setPointsError(null);
    try {
      if (pointsOp === "add") {
        await addPoints(data.id, pts);
        setData((d) => d && { ...d, loyaltyPoints: d.loyaltyPoints + pts });
        onUpdated({ ...data, loyaltyPoints: data.loyaltyPoints + pts });
      } else {
        await redeemPoints(data.id, pts);
        setData((d) => d && { ...d, loyaltyPoints: d.loyaltyPoints - pts });
        onUpdated({ ...data, loyaltyPoints: data.loyaltyPoints - pts });
      }
      setPointsInput("");
    } catch (e) {
      setPointsError((e as Error).message);
    } finally {
      setPointsBusy(false);
    }
  };

  const handleGenerateOffer = async () => {
    if (!data) return;
    setOfferBusy(true);
    try {
      const result = await generateOffer(data.id, data);
      setOffer(result);
    } catch (e) {
      setOffer(`Error: ${(e as Error).message}`);
    } finally {
      setOfferBusy(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!data) return;
    setNotesSaving(true);
    try {
      const updated = await updateCustomer(data.id, { notes });
      setData((d) => d && { ...d, notes: updated.notes });
      onUpdated(updated);
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-white/60 bg-white/95 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white/90 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-semibold text-stone-950">Customer Profile</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100">
            <X size={18} className="text-stone-500" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-stone-400" />
          </div>
        )}
        {error && (
          <div className="m-6 rounded-2xl bg-red-50 p-4 text-sm text-red-600">
            <AlertCircle size={16} className="mb-1 inline" /> {error}
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-5 p-6">
            {/* Identity */}
            <div className="rounded-[24px] border border-stone-100 bg-stone-50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-stone-950">{data.name || "Unnamed"}</h3>
                  {data.phone && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500">
                      <Phone size={13} /> {data.phone}
                    </p>
                  )}
                  {data.email && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-500">
                      <Mail size={13} /> {data.email}
                    </p>
                  )}
                </div>
                {data.isLapsed && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                    Lapsed
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-stone-400">
                Customer since {new Date(data.createdAt).toLocaleDateString()} · Last seen {timeAgo(data.lastVisitAt)}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[20px] bg-amber-50 p-4 text-center">
                <p className="text-xs text-stone-500">Total Spent</p>
                <p className="mt-1 text-lg font-bold text-stone-950">{fmt(data.totalSpent)}</p>
              </div>
              <div className="rounded-[20px] bg-indigo-50 p-4 text-center">
                <p className="text-xs text-stone-500">Visits</p>
                <p className="mt-1 text-lg font-bold text-stone-950">{data.visitCount}</p>
              </div>
              <div className="rounded-[20px] bg-emerald-50 p-4 text-center">
                <p className="text-xs text-stone-500">Points</p>
                <p className="mt-1 text-lg font-bold text-stone-950">{data.loyaltyPoints.toFixed(0)}</p>
              </div>
            </div>

            {/* Points controls */}
            <div className="rounded-[24px] border border-stone-100 bg-white p-5">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Coins size={15} className="text-amber-500" /> Loyalty Points
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setPointsOp("add")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${pointsOp === "add" ? "bg-amber-500 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50"}`}
                >
                  Add
                </button>
                <button
                  onClick={() => setPointsOp("redeem")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition ${pointsOp === "redeem" ? "bg-indigo-600 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50"}`}
                >
                  Redeem
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  placeholder="Points amount"
                  className="flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={handlePoints}
                  disabled={pointsBusy || !pointsInput}
                  className="rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {pointsBusy ? "…" : "Apply"}
                </button>
              </div>
              {pointsError && (
                <p className="mt-2 text-xs text-red-500">{pointsError}</p>
              )}
            </div>

            {/* AI Offer */}
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/60 p-5">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Sparkles size={15} className="text-amber-500" /> Personalized Offer
              </h4>
              {displayedOffer ? (
                <p className="text-sm leading-relaxed text-stone-700">{displayedOffer}</p>
              ) : (
                <p className="text-sm text-stone-400">
                  Generate a personalized offer for this customer based on their purchase history.
                </p>
              )}
              <button
                onClick={handleGenerateOffer}
                disabled={offerBusy}
                className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {offerBusy ? (
                  <><RefreshCw size={14} className="animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles size={14} /> {offer ? "Regenerate" : "Generate Offer"}</>
                )}
              </button>
            </div>

            {/* Purchase History */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <ShoppingBag size={15} className="text-indigo-500" /> Recent Purchases
              </h4>
              {data.purchaseHistory.length === 0 ? (
                <p className="text-sm text-stone-400">No purchase history linked yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.purchaseHistory.slice(0, 5).map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-stone-800">#{sale.receiptNumber}</p>
                        <p className="text-xs text-stone-400">
                          {sale.items.length} item{sale.items.length !== 1 ? "s" : ""} ·{" "}
                          {timeAgo(sale.createdAt)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-stone-900">{fmt(sale.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <StickyNote size={15} className="text-stone-400" /> Notes
              </h4>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this customer…"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={notesSaving || notes === (data.notes ?? "")}
                  className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {notesSaving ? "Saving…" : "Save Notes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer Card ─────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  onClick,
}: {
  customer: Customer;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-[24px] border border-white/60 bg-white/60 p-5 shadow-sm text-left transition hover:bg-white hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold text-stone-950">{customer.name || "Unnamed"}</p>
            {customer.isLapsed && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                Lapsed
              </span>
            )}
          </div>
          {customer.phone && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <Phone size={11} /> {customer.phone}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-stone-300 transition group-hover:text-stone-500" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-stone-400">Spent</p>
          <p className="text-sm font-semibold text-stone-800">{fmt(customer.totalSpent)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-400">Visits</p>
          <p className="text-sm font-semibold text-stone-800">{customer.visitCount}</p>
        </div>
        <div>
          <p className="text-xs text-stone-400">Points</p>
          <p className="text-sm font-semibold text-amber-600">{customer.loyaltyPoints.toFixed(0)}</p>
        </div>
      </div>

      <p className="mt-2 text-right text-xs text-stone-400">
        <Clock size={10} className="inline mr-0.5" />
        {timeAgo(customer.lastVisitAt)}
      </p>
    </button>
  );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────

function CustomersTab({
  customers: initialCustomers,
  onOpenPanel,
  onCustomerCreated,
}: {
  customers: Customer[];
  onOpenPanel: (id: string) => void;
  onCustomerCreated: (c: Customer) => void;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = initialCustomers.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Search + Add */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-2xl border border-stone-200 bg-white/80 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-stone-400">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search ? "No customers match your search." : "No customers yet. Add your first one!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CustomerCard key={c.id} customer={c} onClick={() => onOpenPanel(c.id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddCustomerModal onClose={() => setShowAdd(false)} onCreated={onCustomerCreated} />
      )}
    </div>
  );
}

// ─── Loyalty Settings Tab (was Settings) ──────────────────────────────────────

function SettingsTab() {
  const [rate, setRate] = useState(() => getPointsPerDollar());
  const [enabled, setEnabled] = useState(() => localStorage.getItem("storehub_loyalty_enabled") !== "false");
  const [redemptionRate, setRedemptionRate] = useState(() => {
    const v = parseFloat(localStorage.getItem("storehub_loyalty_redemption") ?? "100");
    return Number.isFinite(v) ? v : 100;
  });
  const [tiers, setTiers] = useState<RewardTier[]>(() => getRewardTiers());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setPointsPerDollar(rate);
    localStorage.setItem("storehub_loyalty_enabled", String(enabled));
    localStorage.setItem("storehub_loyalty_redemption", String(redemptionRate));
    setRewardTiers(tiers);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateTier = (idx: number, field: keyof RewardTier, value: string | number) => {
    setTiers((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  return (
    <SurfaceCard>
      <SectionTitle title="Loyalty Program Settings" description="Configure points earning and redemption." />
      <div className="mt-6 flex flex-col gap-6 max-w-lg">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-stone-800">Enable Loyalty Program</p>
            <p className="text-sm text-stone-500">Award points to customers on each purchase.</p>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            className="text-amber-500 transition hover:opacity-80"
          >
            {enabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} className="text-stone-300" />}
          </button>
        </div>

        {/* Points per dollar */}
        <div>
          <label className="mb-2 block font-medium text-stone-800">
            Earning Rate: $1 = X points
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 1)}
              className="w-32 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-sm text-stone-500">points per dollar spent</span>
          </div>
        </div>

        {/* Redemption rate */}
        <div>
          <label className="mb-2 block font-medium text-stone-800">
            Redemption Rate: X points = $1 off
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              step="1"
              value={redemptionRate}
              onChange={(e) => setRedemptionRate(parseInt(e.target.value) || 100)}
              className="w-32 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-sm text-stone-500">points per $1 discount</span>
          </div>
        </div>

        {/* Reward Tiers */}
        <div>
          <label className="mb-1 block font-medium text-stone-800">Reward Tiers</label>
          <p className="text-sm text-stone-500 mb-3">
            Preset redemption milestones. Dollar value = points ÷ redemption rate.
            When a customer crosses a tier, the "reward unlocked" campaign fires.
          </p>
          <div className="flex flex-col gap-3">
            {tiers.map((tier, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={tier.emoji}
                  onChange={(e) => updateTier(idx, "emoji", e.target.value)}
                  className="w-12 text-center rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
                <input
                  type="text"
                  value={tier.name}
                  onChange={(e) => updateTier(idx, "name", e.target.value)}
                  placeholder="Name"
                  className="w-24 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
                <input
                  type="number"
                  min={1}
                  value={tier.pointsRequired}
                  onChange={(e) => updateTier(idx, "pointsRequired", parseInt(e.target.value) || 0)}
                  className="w-24 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-sm text-stone-500">pts</span>
                <span className="text-sm text-green-700 font-medium">
                  = ${(tier.pointsRequired / redemptionRate).toFixed(2)} off
                </span>
                <button
                  onClick={() => setTiers((prev) => prev.filter((_, i) => i !== idx))}
                  className="ml-auto text-rose-400 hover:text-rose-600 text-xs px-2 py-1 rounded-lg hover:bg-rose-50 transition"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTiers((prev) => [...prev, { name: "New Tier", pointsRequired: 500, emoji: "🎁" }])}
            className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            + Add Tier
          </button>
        </div>

        <div className="pt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            {saved ? (
              <><Star size={14} /> Saved!</>
            ) : (
              <><Settings size={14} /> Save Settings</>
            )}
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingMain, setLoadingMain] = useState(true);
  const [mainError, setMainError] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingMain(true);
    setMainError(null);
    listCustomers()
      .then(setCustomers)
      .catch((e) => setMainError((e as Error).message))
      .finally(() => setLoadingMain(false));
  }, []);

  const handleCustomerCreated = (c: Customer) => {
    setCustomers((prev) => [c, ...prev]);
  };

  const handleCustomerUpdated = (updated: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  const totalCustomers = customers.length;
  const totalLapsed = customers.filter((c) => c.isLapsed).length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const avgSpend = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "all",         label: "All Customers", icon: <Users size={15} /> },
    { id: "smartGroups", label: "Smart Groups",  icon: <Crown size={15} /> },
    { id: "loyalty",     label: "Loyalty",       icon: <Star size={15} /> },
    { id: "campaigns",   label: "Campaigns",     icon: <Megaphone size={15} /> },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHero
        eyebrow="Customer Intelligence"
        title="Customers"
        description="Track loyalty, build smart segments, and run targeted marketing campaigns."
        stats={
          <>
            <SummaryTile
              label="Total Customers"
              value={String(totalCustomers)}
              hint={loadingMain ? "Loading…" : undefined}
            />
            <SummaryTile label="Total Revenue" value={fmt(totalRevenue)} />
            <SummaryTile label="Avg. Spend" value={fmt(avgSpend)} />
            <SummaryTile
              label="Lapsed"
              value={String(totalLapsed)}
              hint="14+ days no visit"
            />
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
              activeTab === t.id
                ? "bg-stone-900 text-white"
                : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === "campaigns" && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none">
                <Zap size={9} />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {mainError && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm text-red-600">
          <AlertCircle size={16} /> {mainError}
        </div>
      )}

      {/* Tab Content */}
      {loadingMain && activeTab === "all" ? (
        <div className="flex justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-stone-400" />
        </div>
      ) : (
        <>
          {activeTab === "all" && (
            <CustomersTab
              customers={customers}
              onOpenPanel={setPanelId}
              onCustomerCreated={handleCustomerCreated}
            />
          )}
          {activeTab === "smartGroups" && (
            <SmartGroupsTab onNavigateToCampaigns={() => setActiveTab("campaigns")} />
          )}
          {activeTab === "loyalty" && <SettingsTab />}
          {activeTab === "campaigns" && <CampaignsTab />}
        </>
      )}

      {/* Slide-Over Panel */}
      {panelId && (
        <CustomerPanel
          customerId={panelId}
          onClose={() => setPanelId(null)}
          onUpdated={handleCustomerUpdated}
        />
      )}
    </div>
  );
}
