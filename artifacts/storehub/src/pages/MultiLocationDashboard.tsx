import { useState, useEffect } from "react";
import {
  MapPin,
  TrendingUp,
  Package,
  Users,
  ArrowRight,
  RefreshCw,
  Plus,
  X,
  AlertCircle,
  LayoutGrid,
  Building2,
  ArrowLeftRight,
  Clock,
  Trash2,
} from "lucide-react";
import { PageHero, SurfaceCard, SectionTitle } from "../components/page-shell";
import { useLocation } from "../contexts/LocationContext";
import {
  createLocation,
  updateLocation,
  deleteLocation,
  type StoreLocation,
} from "../services/locationService";

// ─── Transfer Log (localStorage) ─────────────────────────────────────────────

interface TransferEntry {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  productName: string;
  quantity: string;
  note: string;
  createdAt: string;
}

const TRANSFER_KEY = "storehub_pending_transfers";

function getTransfers(): TransferEntry[] {
  try {
    const raw = localStorage.getItem(TRANSFER_KEY);
    return raw ? (JSON.parse(raw) as TransferEntry[]) : [];
  } catch {
    return [];
  }
}

function saveTransfers(transfers: TransferEntry[]): void {
  localStorage.setItem(TRANSFER_KEY, JSON.stringify(transfers));
}

function addTransfer(entry: Omit<TransferEntry, "id" | "createdAt">): TransferEntry {
  const transfers = getTransfers();
  const newEntry: TransferEntry = {
    ...entry,
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  saveTransfers([newEntry, ...transfers]);
  return newEntry;
}

function removeTransfer(id: string): void {
  saveTransfers(getTransfers().filter((t) => t.id !== id));
}

// ─── Location Card ────────────────────────────────────────────────────────────

function LocationCard({
  location,
  onSetDefault,
  onDelete,
}: {
  location: StoreLocation;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${location.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteLocation(location.id);
      onDelete(location.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100">
            <Building2 size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-stone-950">{location.name}</h3>
            {location.city && (
              <p className="flex items-center gap-1 text-xs text-stone-500">
                <MapPin size={11} /> {location.city}
                {location.stateCode && `, ${location.stateCode}`}
              </p>
            )}
          </div>
        </div>
        {location.isDefault && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Default
          </span>
        )}
      </div>

      {/* Address */}
      {location.addressLine1 && (
        <p className="text-sm text-stone-500">{location.addressLine1}</p>
      )}

      {/* Revenue placeholder */}
      <div className="rounded-2xl bg-stone-50 border border-stone-100 px-4 py-3">
        <div className="flex items-center gap-2 text-stone-400">
          <TrendingUp size={14} />
          <p className="text-xs">Revenue tracking per-location coming soon</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {!location.isDefault && (
          <button
            onClick={() => onSetDefault(location.id)}
            className="flex-1 rounded-2xl border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            Set as Default
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-2xl border border-red-100 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Add Location Form ────────────────────────────────────────────────────────

function AddLocationCard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createLocation({
        name: name.trim(),
        isDefault: false,
        addressLine1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        stateCode: stateCode.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
      });
      setName("");
      setAddressLine1("");
      setCity("");
      setStateCode("");
      setPostalCode("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-[30px] border-2 border-dashed border-stone-200 p-6 text-stone-400 transition hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-600"
      >
        <Plus size={24} />
        <span className="text-sm font-medium">Add Location</span>
      </button>
    );
  }

  return (
    <div className="rounded-[30px] border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-stone-800">New Location</h3>
        <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-stone-100">
          <X size={16} className="text-stone-500" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {[
          { label: "Name *", value: name, set: setName, placeholder: "Downtown Branch", required: true },
          { label: "Address", value: addressLine1, set: setAddressLine1, placeholder: "123 Main St" },
          { label: "City", value: city, set: setCity, placeholder: "Chicago" },
          { label: "State", value: stateCode, set: setStateCode, placeholder: "IL" },
          { label: "Zip", value: postalCode, set: setPostalCode, placeholder: "60601" },
        ].map((f) => (
          <div key={f.label}>
            <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
            <input
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.placeholder}
              required={f.required}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        ))}
        {error && (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-2xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create Location"}
        </button>
      </form>
    </div>
  );
}

// ─── Transfer Stock Section ───────────────────────────────────────────────────

function TransferSection({ locations }: { locations: StoreLocation[] }) {
  const [transfers, setTransfers] = useState<TransferEntry[]>(getTransfers);
  const [fromId, setFromId] = useState<string>(locations[0]?.id ?? "");
  const [toId, setToId] = useState<string>(locations[1]?.id ?? "");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !quantity.trim()) {
      setError("Product name and quantity are required");
      return;
    }
    if (fromId === toId) {
      setError("From and To locations must be different");
      return;
    }
    const fromLoc = locations.find((l) => l.id === fromId);
    const toLoc = locations.find((l) => l.id === toId);
    if (!fromLoc || !toLoc) return;

    const entry = addTransfer({
      fromLocationId: fromId,
      fromLocationName: fromLoc.name,
      toLocationId: toId,
      toLocationName: toLoc.name,
      productName: productName.trim(),
      quantity: quantity.trim(),
      note: note.trim(),
    });
    setTransfers((prev) => [entry, ...prev]);
    setProductName("");
    setQuantity("");
    setNote("");
    setError(null);
  };

  const handleDelete = (id: string) => {
    removeTransfer(id);
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Add transfer form */}
      <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
        <SectionTitle
          title="Log Stock Transfer"
          description="Note a pending transfer of stock between locations."
        />
        <form onSubmit={handleAdd} className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">From</label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">To</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Product</label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Whole Milk (1 gal)"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Quantity</label>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 12 units"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for transfer, pickup date, etc."
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {error && (
            <p className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
              <AlertCircle size={15} /> {error}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <ArrowLeftRight size={15} /> Log Transfer
            </button>
          </div>
        </form>
      </div>

      {/* Pending transfers */}
      {transfers.length > 0 && (
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
          <SectionTitle
            title="Pending Transfers"
            description={`${transfers.length} transfer${transfers.length !== 1 ? "s" : ""} logged locally`}
          />
          <div className="mt-4 flex flex-col gap-3">
            {transfers.map((t) => (
              <div
                key={t.id}
                className="flex items-start gap-4 rounded-2xl border border-stone-100 bg-stone-50 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                  <ArrowRight size={14} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-800">
                    {t.productName}{" "}
                    <span className="font-normal text-stone-500">× {t.quantity}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {t.fromLocationName} <ArrowRight size={12} className="inline mx-1" /> {t.toLocationName}
                  </p>
                  {t.note && <p className="mt-0.5 text-xs text-stone-400 italic">{t.note}</p>}
                  <p className="mt-1 flex items-center gap-1 text-xs text-stone-400">
                    <Clock size={11} /> {new Date(t.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="shrink-0 rounded-xl p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type View = "all" | string; // 'all' or a locationId

export default function MultiLocationDashboard() {
  const { locations, activeLocationId, setActiveLocation, refreshLocations, isMultiLocation } =
    useLocation();
  const [view, setView] = useState<View>("all");
  const [activeTab, setActiveTab] = useState<"locations" | "transfers">("locations");
  const [updatingDefault, setUpdatingDefault] = useState<string | null>(null);

  // On mount, sync view with activeLocationId
  useEffect(() => {
    if (activeLocationId) setView(activeLocationId);
  }, [activeLocationId]);

  const handleSetDefault = async (id: string) => {
    setUpdatingDefault(id);
    try {
      await updateLocation(id, { isDefault: true });
      await refreshLocations();
    } finally {
      setUpdatingDefault(null);
    }
  };

  const handleDeleted = async () => {
    await refreshLocations();
  };

  const displayedLocations = view === "all" ? locations : locations.filter((l) => l.id === view);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHero
        eyebrow="Multi-Location"
        title="All Locations"
        description="Manage your store locations, compare performance, and log stock transfers."
      />

      {/* View toggle + Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Location view switcher */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setView("all")}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
              view === "all"
                ? "bg-stone-900 text-white"
                : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
            }`}
          >
            <LayoutGrid size={14} /> All locations
          </button>
          {locations.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setView(l.id);
                setActiveLocation(l.id);
              }}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
                view === l.id
                  ? "bg-amber-500 text-white"
                  : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
              }`}
            >
              <MapPin size={14} /> {l.name}
            </button>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("locations")}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              activeTab === "locations"
                ? "bg-indigo-600 text-white"
                : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
            }`}
          >
            Locations
          </button>
          {isMultiLocation && (
            <button
              onClick={() => setActiveTab("transfers")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "transfers"
                  ? "bg-indigo-600 text-white"
                  : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
              }`}
            >
              Transfers
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === "locations" ? (
        <>
          {/* Location grid */}
          {displayedLocations.length === 0 ? (
            <SurfaceCard>
              <div className="py-8 text-center text-stone-400">
                <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No locations found. Add your first location below.</p>
              </div>
            </SurfaceCard>
          ) : (
            <div
              className={`grid gap-4 ${
                view === "all"
                  ? "sm:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-1 max-w-md"
              }`}
            >
              {displayedLocations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  location={loc}
                  onSetDefault={handleSetDefault}
                  onDelete={handleDeleted}
                />
              ))}

              {/* Always show add card in "all" view */}
              {view === "all" && (
                <AddLocationCard onCreated={() => void refreshLocations()} />
              )}
            </div>
          )}

          {/* If updating default, show spinner note */}
          {updatingDefault && (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <RefreshCw size={14} className="animate-spin" /> Updating default location…
            </p>
          )}
        </>
      ) : (
        <TransferSection locations={locations} />
      )}

      {/* Summary stats */}
      {isMultiLocation && (
        <SurfaceCard>
          <SectionTitle
            title="Network Summary"
            description="Across all your locations"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <p className="text-xs text-stone-500">Total Locations</p>
              <p className="mt-1 text-2xl font-bold text-stone-950">{locations.length}</p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-4 text-center">
              <p className="text-xs text-stone-500">Revenue (All)</p>
              <p className="mt-1 text-sm font-medium text-stone-400 italic">Coming soon</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <p className="text-xs text-stone-500">Pending Transfers</p>
              <p className="mt-1 text-2xl font-bold text-stone-950">{getTransfers().length}</p>
            </div>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
