import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown, Plus, Check, X, AlertCircle } from "lucide-react";
import { useLocation } from "../contexts/LocationContext";
import { createLocation } from "../services/locationService";

interface Props {
  onLocationChange?: (id: string) => void;
}

function AddLocationForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
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
      await createLocation({ name: name.trim(), isDefault: false, city: city.trim() || undefined });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-stone-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-700">New Location</p>
        <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-600">
          <X size={14} />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Location name"
        className="mb-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-400"
        autoFocus
      />
      <input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="City (optional)"
        className="mb-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-400"
      />
      {error && (
        <p className="mb-2 flex items-center gap-1 text-xs text-red-500">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-amber-500 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
      >
        {saving ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

export default function LocationSwitcher({ onLocationChange }: Props) {
  const { locations, activeLocation, activeLocationId, setActiveLocation, refreshLocations } =
    useLocation();
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAdd(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Only render when 2+ locations
  if (locations.length < 2) return null;

  const handleSelect = (id: string) => {
    setActiveLocation(id);
    onLocationChange?.(id);
    setOpen(false);
  };

  const handleCreated = async () => {
    await refreshLocations();
    setShowAdd(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/80 px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-white"
      >
        <MapPin size={14} className="text-amber-500" />
        <span className="max-w-[140px] truncate">{activeLocation?.name ?? "Select location"}</span>
        <ChevronDown
          size={14}
          className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
          {/* Location list */}
          <ul className="max-h-64 overflow-y-auto py-1">
            {locations.map((loc) => (
              <li key={loc.id}>
                <button
                  onClick={() => handleSelect(loc.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
                >
                  <MapPin size={13} className="shrink-0 text-amber-400" />
                  <span className="flex-1 truncate text-left">
                    {loc.name}
                    {loc.city && (
                      <span className="ml-1 text-xs text-stone-400">· {loc.city}</span>
                    )}
                  </span>
                  {loc.id === activeLocationId && (
                    <Check size={14} className="shrink-0 text-amber-500" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Add location */}
          {showAdd ? (
            <AddLocationForm onClose={() => setShowAdd(false)} onCreated={handleCreated} />
          ) : (
            <div className="border-t border-stone-100 p-1">
              <button
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-stone-500 hover:bg-stone-50"
              >
                <Plus size={13} /> Add location
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
