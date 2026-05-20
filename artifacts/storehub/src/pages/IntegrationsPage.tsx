import { useState, useEffect, useCallback } from "react";
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  getConnectionState,
  saveConnectionState,
  clearConnectionState,
} from "../config/integrations";
import { syncSystem } from "../services/integrationService";
import { buildPreview, importProducts, importSales } from "../services/integrations/csv-import";
import type { CSVPreview } from "../services/integrations/csv-import";
import type { ConnectionState } from "../config/integrations";
import {
  Plug,
  Check,
  X,
  RefreshCw,
  Upload,
  AlertTriangle,
  Fuel,
  ShoppingBag,
  Link,
  Link2Off,
  Zap,
  Package,
  ShoppingCart,
  Users,
  Database,
} from "lucide-react";
import { formatDateTime } from "../utils";

// ─── System Definitions ──────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface SystemDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  initials: string;
  color: string;
  section: "petroleum" | "retail";
  fields: FieldDef[];
}

const HARDWARE_OPTIONS = [
  { value: "Ruby", label: "Ruby" },
  { value: "Ruby2", label: "Ruby2" },
  { value: "RubyCi", label: "RubyCi" },
  { value: "Topaz", label: "Topaz" },
  { value: "TopazXL", label: "Topaz XL" },
  { value: "Sapphire", label: "Sapphire" },
];

const REPORT_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7days", label: "Last 7 Days" },
  { value: "last30days", label: "Last 30 Days" },
];

const SYSTEMS: SystemDef[] = [
  // ── Petroleum & C-Store ──
  {
    id: "verifone",
    name: "Verifone Commander",
    shortName: "Verifone",
    description: "Covers Ruby, Ruby2, RubyCi, Topaz, Topaz XL, and Sapphire through one Commander connection",
    initials: "VF",
    color: "bg-blue-600",
    section: "petroleum",
    fields: [
      { key: "hardwareModel", label: "Hardware Model", type: "select", options: HARDWARE_OPTIONS },
      { key: "host", label: "Commander IP Address", type: "text", placeholder: "192.168.1.100" },
      { key: "username", label: "Username", type: "text", placeholder: "admin" },
      { key: "password", label: "Password", type: "password" },
      { key: "reportPeriod", label: "Report Period", type: "select", options: REPORT_PERIOD_OPTIONS },
    ],
  },
  {
    id: "gilbarco",
    name: "Gilbarco Passport",
    shortName: "Gilbarco",
    description: "Cloud API for Passport POS — high-volume gas stations and truck stops",
    initials: "GP",
    color: "bg-emerald-600",
    section: "petroleum",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "gp_live_…" },
      { key: "accountId", label: "Account ID", type: "text" },
      { key: "storeId", label: "Store ID", type: "text" },
    ],
  },
  {
    id: "wayne",
    name: "Wayne Nucleus",
    shortName: "Wayne",
    description: "Dover Fueling Solutions — branded petroleum retailers and fuel chains",
    initials: "WN",
    color: "bg-orange-600",
    section: "petroleum",
    fields: [
      { key: "clientId", label: "Client ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", type: "password" },
      { key: "siteId", label: "Site ID", type: "text" },
    ],
  },
  {
    id: "ncr",
    name: "NCR Voyix Radiant",
    shortName: "NCR",
    description: "Radiant POS for c-stores, QSR, and fuel + convenience combos",
    initials: "NCR",
    color: "bg-purple-600",
    section: "petroleum",
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "siteToken", label: "Site Token", type: "password" },
    ],
  },
  {
    id: "petrosoft",
    name: "Petrosoft CStoreOffice",
    shortName: "Petrosoft",
    description: "Cloud back-office for independent gas stations and c-stores",
    initials: "PS",
    color: "bg-red-600",
    section: "petroleum",
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "storeId", label: "Store ID", type: "text" },
    ],
  },
  // ── General Retail ──
  {
    id: "square",
    name: "Square",
    shortName: "Square",
    description: "Popular POS for cafes, food trucks, and retail boutiques",
    initials: "SQ",
    color: "bg-gray-900",
    section: "retail",
    fields: [
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "EAAAl…" },
      { key: "locationId", label: "Location ID", type: "text" },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    shortName: "Shopify",
    description: "Online + in-store retail — syncs both e-commerce and POS orders",
    initials: "SH",
    color: "bg-green-700",
    section: "retail",
    fields: [
      { key: "shopDomain", label: "Shop Domain", type: "text", placeholder: "mystore.myshopify.com" },
      { key: "accessToken", label: "Admin API Token", type: "password" },
    ],
  },
  {
    id: "lightspeed",
    name: "Lightspeed",
    shortName: "Lightspeed",
    description: "Specialty retail POS — bike shops, clothing, hardware stores",
    initials: "LS",
    color: "bg-red-500",
    section: "retail",
    fields: [
      { key: "accessToken", label: "Access Token", type: "password" },
      { key: "accountId", label: "Account ID", type: "text" },
    ],
  },
  {
    id: "clover",
    name: "Clover",
    shortName: "Clover",
    description: "Flexible POS for restaurants, cafes, and retail",
    initials: "CL",
    color: "bg-lime-600",
    section: "retail",
    fields: [
      { key: "accessToken", label: "Access Token", type: "password" },
      { key: "merchantId", label: "Merchant ID", type: "text" },
    ],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    shortName: "QuickBooks",
    description: "Accounting sync — expenses, invoices, payroll, and P&L reports",
    initials: "QB",
    color: "bg-blue-500",
    section: "retail",
    fields: [
      { key: "accessToken", label: "Access Token", type: "password" },
      { key: "realmId", label: "Company ID (Realm ID)", type: "text" },
    ],
  },
  {
    id: "toast",
    name: "Toast POS",
    shortName: "Toast",
    description: "Restaurant POS — for stores with full food service operations",
    initials: "TP",
    color: "bg-amber-600",
    section: "retail",
    fields: [
      { key: "clientId", label: "Client ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", type: "password" },
      { key: "restaurantGuid", label: "Restaurant GUID", type: "text" },
    ],
  },
];

const SYNC_FREQ_OPTIONS = [
  { value: "realtime", label: "Real-time" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [states,       setStates]       = useState<Record<string, ConnectionState>>({});
  const [syncing,      setSyncing]      = useState<string | null>(null);
  const [syncError,    setSyncError]    = useState<Record<string, string>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [formValues,   setFormValues]   = useState<Record<string, string>>({});
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  // Connect modal flow state
  const [connectStep,  setConnectStep]  = useState<"form" | "connecting" | "success">("form");
  const [syncedTypes,  setSyncedTypes]  = useState<string[]>([]);
  const [connectError, setConnectError] = useState("");

  // Increments after each successful sync — triggers FuelDashboard refresh
  const [syncTick, setSyncTick] = useState(0);
  const { activeStoreId } = useAuth();

  const loadStates = useCallback(() => {
    const newStates: Record<string, ConnectionState> = {};
    for (const sys of SYSTEMS) {
      const state = getConnectionState(sys.id);
      if (state) newStates[sys.id] = state;
    }
    setStates(newStates);
  }, [activeStoreId]);

  useEffect(() => { loadStates(); }, [loadStates]);

  function openConnectModal(sys: SystemDef) {
    const savedCreds = getCredentials(sys.id);
    setFormValues(savedCreds);
    setConnectingId(sys.id);
    setConnectStep("form");
    setConnectError("");
    setSyncedTypes([]);
  }

  async function handleConnect(sys: SystemDef) {
    setConnectStep("connecting");
    setConnectError("");

    saveCredentials(sys.id, formValues);
    saveConnectionState({
      systemId:      sys.id,
      connected:     true,
      lastSynced:    null,
      syncFrequency: (formValues.syncFrequency as ConnectionState["syncFrequency"]) ?? "daily",
      error:         null,
      hardwareModel: formValues.hardwareModel,
    });
    loadStates();

    const result = await syncSystem(sys.id);

    if (result.success) {
      setSyncedTypes(result.dataTypes);
      setSyncTick((t) => t + 1);
      setConnectStep("success");
      loadStates();
      // Auto-close after showing success
      setTimeout(() => {
        setConnectingId(null);
        setConnectStep("form");
        setSyncedTypes([]);
      }, 2800);
    } else {
      setConnectStep("form");
      setConnectError(result.error ?? "Connection failed. Please check your credentials and try again.");
      setSyncError((e) => ({ ...e, [sys.id]: result.error ?? "Connection failed." }));
    }
    loadStates();
  }

  function handleDisconnect(systemId: string) {
    if (!confirm("Disconnect this system? Your local StoreHub data won't be affected.")) return;
    clearCredentials(systemId);
    clearConnectionState(systemId);
    loadStates();
  }

  async function handleSync(systemId: string) {
    setSyncing(systemId);
    const result = await syncSystem(systemId);
    if (!result.success && result.error) {
      setSyncError((e) => ({ ...e, [systemId]: result.error! }));
    } else {
      setSyncError((e) => { const n = { ...e }; delete n[systemId]; return n; });
      setSyncTick((t) => t + 1);
    }
    setSyncing(null);
    loadStates();
  }

  function updateFrequency(systemId: string, freq: string) {
    const state = states[systemId];
    if (!state) return;
    const updated: ConnectionState = { ...state, syncFrequency: freq as ConnectionState["syncFrequency"] };
    saveConnectionState(updated);
    loadStates();
  }

  const petroleum = SYSTEMS.filter((s) => s.section === "petroleum");
  const retail = SYSTEMS.filter((s) => s.section === "retail");
  const connectedPetroleum = petroleum.find((s) => states[s.id]?.connected);
  const connectedCount = SYSTEMS.filter((s) => states[s.id]?.connected).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Plug className="text-amber-500" size={26} />
            Connect Your System
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Link your existing POS, accounting, or fuel management system
          </p>
        </div>
        {connectedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <Check size={15} />
            {connectedCount} system{connectedCount > 1 ? "s" : ""} connected
          </div>
        )}
      </div>

      {/* Petroleum & C-Store Systems */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Fuel size={18} className="text-amber-500" />
          <h2 className="font-semibold text-gray-800 dark:text-white">Petroleum & C-Store Systems</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {petroleum.map((sys) => (
            <SystemCard
              key={sys.id}
              sys={sys}
              state={states[sys.id] ?? null}
              syncing={syncing === sys.id}
              error={syncError[sys.id]}
              onConnect={() => openConnectModal(sys)}
              onDisconnect={() => handleDisconnect(sys.id)}
              onSync={() => handleSync(sys.id)}
              onFreqChange={(f) => updateFrequency(sys.id, f)}
            />
          ))}
        </div>
      </section>

      {/* General Retail Systems */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag size={18} className="text-amber-500" />
          <h2 className="font-semibold text-gray-800 dark:text-white">General Retail Systems</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {retail.map((sys) => (
            <SystemCard
              key={sys.id}
              sys={sys}
              state={states[sys.id] ?? null}
              syncing={syncing === sys.id}
              error={syncError[sys.id]}
              onConnect={() => openConnectModal(sys)}
              onDisconnect={() => handleDisconnect(sys.id)}
              onSync={() => handleSync(sys.id)}
              onFreqChange={(f) => updateFrequency(sys.id, f)}
            />
          ))}

          {/* CSV Import card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-600 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                CSV
              </div>
              <div>
                <div className="font-semibold text-gray-800 dark:text-white text-sm">Manual CSV Import</div>
                <div className="text-xs text-gray-500">Any system not on this list</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Upload a CSV of your sales or inventory. The app auto-detects columns and maps them — preview before importing.
            </p>
            <button
              onClick={() => setCsvModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors"
            >
              <Upload size={14} /> Import CSV
            </button>
          </div>
        </div>
      </section>

      {/* Fuel Dashboard — shown when a petroleum system is connected */}
      {connectedPetroleum && <FuelDashboard systemName={connectedPetroleum.name} systemId={connectedPetroleum.id} syncTick={syncTick} />}

      {/* Connect Modal */}
      {connectingId && (
        <ConnectModal
          sys={SYSTEMS.find((s) => s.id === connectingId)!}
          values={formValues}
          onChange={(k, v) => setFormValues((f) => ({ ...f, [k]: v }))}
          onSubmit={() => {
            const sys = SYSTEMS.find((s) => s.id === connectingId)!;
            handleConnect(sys);
          }}
          onClose={() => { if (connectStep !== "connecting") { setConnectingId(null); setConnectStep("form"); } }}
          step={connectStep}
          syncedTypes={syncedTypes}
          connectError={connectError}
        />
      )}

      {/* CSV Import Modal */}
      {csvModalOpen && <CSVImportModal onClose={() => setCsvModalOpen(false)} />}
    </div>
  );
}

// ─── System Card ─────────────────────────────────────────────────────────────

function SystemCard({
  sys,
  state,
  syncing,
  error,
  onConnect,
  onDisconnect,
  onSync,
  onFreqChange,
}: {
  sys: SystemDef;
  state: ConnectionState | null;
  syncing: boolean;
  error?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onFreqChange: (freq: string) => void;
}) {
  const connected = state?.connected === true;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border p-5 flex flex-col gap-3 shadow-sm ${
      connected ? "border-emerald-200 dark:border-emerald-800" : "border-gray-100 dark:border-gray-700"
    }`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl ${sys.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
          {sys.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 dark:text-white text-sm">{sys.name}</div>
          <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sys.description}</div>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        {connected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full">
            <Check size={11} /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
            <X size={11} /> Not Connected
          </span>
        )}
        {state?.hardwareModel && (
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {state.hardwareModel}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Last synced */}
      {state?.lastSynced && (
        <div className="text-xs text-gray-400">
          Last synced: {formatDateTime(state.lastSynced)}
        </div>
      )}

      {/* Sync frequency (when connected) */}
      {connected && (
        <select
          value={state?.syncFrequency ?? "daily"}
          onChange={(e) => onFreqChange(e.target.value)}
          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 w-full focus:outline-none focus:ring-1 focus:ring-amber-400"
        >
          {SYNC_FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sync: {o.label}
            </option>
          ))}
        </select>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {connected ? (
          <>
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-60"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={onDisconnect}
              className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-red-600 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            >
              <Link2Off size={13} />
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-gray-800 dark:bg-gray-200 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl transition-colors"
          >
            <Link size={12} /> Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Connect Modal ────────────────────────────────────────────────────────────

function ConnectModal({
  sys,
  values,
  onChange,
  onSubmit,
  onClose,
  step,
  syncedTypes,
  connectError,
}: {
  sys: SystemDef;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  step: "form" | "connecting" | "success";
  syncedTypes: string[];
  connectError: string;
}) {
  const DATA_TYPE_ICONS: Record<string, React.ReactElement> = {
    products:     <Package size={14} className="text-amber-500" />,
    sales:        <ShoppingCart size={14} className="text-blue-500" />,
    employees:    <Users size={14} className="text-purple-500" />,
    fuel:         <Database size={14} className="text-emerald-500" />,
    expenses:     <Database size={14} className="text-red-500" />,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden">

        {/* Close button — hidden while connecting */}
        {step !== "connecting" && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        )}

        {/* ── Connecting State ── */}
        {step === "connecting" && (
          <div className="text-center py-8">
            <div className={`w-16 h-16 rounded-2xl ${sys.color} flex items-center justify-center text-white text-lg font-bold mx-auto mb-4 shadow-lg`}>
              {sys.initials}
            </div>
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
            </div>
            <p className="font-semibold text-gray-800 dark:text-white">Connecting to {sys.name}…</p>
            <p className="text-xs text-gray-400 mt-1">Testing connection and importing data</p>
          </div>
        )}

        {/* ── Success State ── */}
        {step === "success" && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">Connected!</p>
            <p className="text-sm text-gray-500 mb-4">{sys.name} is now linked to StoreHub</p>
            {syncedTypes.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-left">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data imported</p>
                <div className="flex flex-col gap-1.5">
                  {syncedTypes.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      {DATA_TYPE_ICONS[t] ?? <Check size={14} className="text-emerald-500" />}
                      <span className="capitalize">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4">Closing automatically…</p>
          </div>
        )}

        {/* ── Form State ── */}
        {step === "form" && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl ${sys.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {sys.initials}
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Connect {sys.name}</h2>
                <p className="text-xs text-gray-500">Enter your credentials to link this system</p>
              </div>
            </div>

            {connectError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-300">{connectError}</p>
              </div>
            )}

            <div className="space-y-3">
              {sys.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={values[field.key] ?? field.options?.[0]?.value ?? ""}
                      onChange={(e) => onChange(field.key, e.target.value)}
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ""}
                      onChange={(e) => onChange(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Sync Frequency</label>
                <select
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={values.syncFrequency ?? "daily"}
                  onChange={(e) => onChange("syncFrequency", e.target.value)}
                >
                  {SYNC_FREQ_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={onSubmit}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                <Zap size={15} /> Connect & Sync
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-3 text-center">
              Credentials are stored locally on this device only
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Fuel Dashboard ───────────────────────────────────────────────────────────

function FuelDashboard({ systemName, systemId, syncTick }: { systemName: string; systemId: string; syncTick: number }) {
  const [fuelData, setFuelData] = useState<{ grades: Array<{ grade: string; gallonsSold: number; revenue: number; tankLevel: number | null; tankCapacity: number | null }>; totalFuelRevenue: number; totalStoreRevenue: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    import("../services/integrationService").then(({ getFuelData }) => {
      getFuelData().then((data) => {
        if (data.length > 0) setFuelData(data[0]);
        setLoading(false);
      });
    });
  }, [systemId, syncTick]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const totalRevenue = (fuelData?.totalFuelRevenue ?? 0) + (fuelData?.totalStoreRevenue ?? 0);
  const fuelPct = totalRevenue > 0 ? ((fuelData?.totalFuelRevenue ?? 0) / totalRevenue) * 100 : 0;

  return (
    <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
      <div className="flex items-center gap-2 mb-5">
        <Fuel size={20} className="text-amber-400" />
        <h2 className="font-bold text-white">Fuel Dashboard</h2>
        <span className="ml-1 text-xs text-slate-400">via {systemName}</span>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm animate-pulse">Loading fuel data…</div>
      ) : !fuelData || fuelData.grades.length === 0 ? (
        <div className="text-slate-400 text-sm">No fuel data available. Run a sync to fetch data.</div>
      ) : (
        <>
          {/* Revenue split */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Fuel Revenue", value: fmt(fuelData.totalFuelRevenue), sub: `${fuelPct.toFixed(0)}% of total` },
              { label: "Store Revenue", value: fmt(fuelData.totalStoreRevenue), sub: `${(100 - fuelPct).toFixed(0)}% of total` },
              { label: "Total Revenue", value: fmt(totalRevenue), sub: "Combined" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-3">
                <div className="text-lg font-bold text-amber-400">{stat.value}</div>
                <div className="text-xs text-slate-300 mt-0.5">{stat.label}</div>
                <div className="text-xs text-slate-500">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Grades */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fuel Grades — Today</div>
            {fuelData.grades.map((g) => {
              const tankPct = g.tankLevel !== null && g.tankCapacity ? (g.tankLevel / g.tankCapacity) * 100 : null;
              const tankWarn = tankPct !== null && tankPct < 25;
              return (
                <div key={g.grade} className="bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{g.grade}</span>
                    <span className="text-amber-400 font-bold">{fmt(g.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{g.gallonsSold.toLocaleString()} gal sold</span>
                    {g.tankLevel !== null && (
                      <span className={tankWarn ? "text-red-400 font-semibold" : ""}>
                        {tankWarn ? "⚠ " : ""}Tank: {g.tankLevel?.toLocaleString()} gal
                        {g.tankCapacity && ` / ${g.tankCapacity.toLocaleString()}`}
                        {tankPct !== null && ` (${tankPct.toFixed(0)}%)`}
                      </span>
                    )}
                  </div>
                  {tankPct !== null && (
                    <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${tankWarn ? "bg-red-400" : "bg-amber-400"}`}
                        style={{ width: `${tankPct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function CSVImportModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"products" | "sales">("products");
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [rawCSV, setRawCSV] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [importCount, setImportCount] = useState(0);

  const PRODUCT_FIELDS = ["name", "sku", "price", "quantity", "category", "unit"];
  const SALE_FIELDS = ["id", "total", "timestamp", "productName", "quantity"];
  const fields = mode === "products" ? PRODUCT_FIELDS : SALE_FIELDS;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawCSV(text);
      const p = buildPreview(text, mode);
      setPreview(p);
      const autoMap: Record<string, string> = {};
      p.columns.forEach((col) => {
        if (col.mappedTo) autoMap[col.mappedTo] = col.header;
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (mode === "products") {
      const products = importProducts(rawCSV, mapping);
      import("../services/integrationService").then(({ addCSVProducts }) => addCSVProducts(products));
      setImportCount(products.length);
    } else {
      const sales = importSales(rawCSV, mapping);
      import("../services/integrationService").then(({ addCSVSales }) => addCSVSales(sales));
      setImportCount(sales.length);
    }
    setStep("done");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <X size={18} />
        </button>
        <h2 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <Upload size={18} className="text-amber-500" /> CSV Import
        </h2>
        <p className="text-xs text-gray-500 mb-5">Import sales or inventory data from any CSV file</p>

        {step === "upload" && (
          <>
            <div className="flex gap-2 mb-4">
              {(["products", "sales"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
                    mode === m ? "bg-amber-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {m === "products" ? "Inventory / Products" : "Sales Data"}
                </button>
              ))}
            </div>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-2xl p-10 cursor-pointer hover:border-amber-400 transition-colors">
              <Upload size={28} className="text-gray-300 mb-2" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to upload CSV</span>
              <span className="text-xs text-gray-400 mt-1">Comma-separated values (.csv)</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
          </>
        )}

        {step === "map" && preview && (
          <>
            <div className="text-sm text-gray-500 mb-3">
              {preview.rowCount} rows detected. Map columns below (auto-detected where possible):
            </div>
            <div className="space-y-2 mb-4">
              {fields.map((field) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 w-28 shrink-0 capitalize">
                    {field}
                  </label>
                  <select
                    className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={mapping[field] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {preview.rawHeaders.map((h) => (
                      <option key={h} value={h}>{h} {preview.rows[0]?.[h] ? `(e.g. "${preview.rows[0][h]}")` : ""}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700 mb-4">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {preview.rawHeaders.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-gray-700">
                      {preview.rawHeaders.map((h) => (
                        <td key={h} className="px-3 py-2 text-gray-700 dark:text-gray-300">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                <Check size={15} /> Import {preview.rowCount} rows
              </button>
              <button onClick={() => setStep("upload")} className="px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-xl">
                Back
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-emerald-500" />
            </div>
            <div className="font-bold text-gray-800 dark:text-white mb-1">
              {importCount} {mode === "products" ? "products" : "sales"} imported
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Data is available in your reports and dashboard. Go to{" "}
              {mode === "products" ? "Inventory" : "Sales History"} to review.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
