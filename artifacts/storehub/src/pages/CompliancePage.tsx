import { useState, useEffect } from "react";
import {
  Shield,
  FileText,
  Receipt,
  Flame,
  Wine,
  Cigarette,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Zap,
  Users,
  DollarSign,
  Building,
  Building2,
  FlaskConical,
  FileCheck,
} from "lucide-react";
import {
  getItems,
  saveItem,
  updateItem,
  deleteItem,
  markCompleted,
  getAlerts,
  getDefaultItemsForBusinessType,
  scheduleNotifications,
  type ComplianceItem,
  type ComplianceAlert,
  type ComplianceCategory,
} from "../services/complianceService";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";

// ─── Icons per category ────────────────────────────────────────────────────────

function CategoryIcon({ category, size = 18 }: { category: ComplianceCategory; size?: number }) {
  switch (category) {
    case "business_license":   return <Shield size={size} />;
    case "health_permit":      return <BadgeCheck size={size} />;
    case "sales_tax":          return <Receipt size={size} />;
    case "income_tax":         return <FileText size={size} />;
    case "alcohol_license":    return <Wine size={size} />;
    case "tobacco_license":    return <Cigarette size={size} />;
    case "food_handler":       return <BadgeCheck size={size} />;
    case "fire_inspection":    return <Flame size={size} />;
    // Canada
    case "gst_hst_filing":     return <Receipt size={size} />;
    case "cpp_ei_remittance":  return <Users size={size} />;
    case "wsib_wcb":           return <Shield size={size} />;
    case "t4_slips":           return <FileText size={size} />;
    case "provincial_license": return <Building size={size} />;
    // Mexico
    case "iva_filing":         return <Receipt size={size} />;
    case "isr_filing":         return <DollarSign size={size} />;
    case "imss_registration":  return <Users size={size} />;
    case "sat_cfdi":           return <FileCheck size={size} />;
    case "municipal_license":  return <Building2 size={size} />;
    case "cofepris":           return <FlaskConical size={size} />;
    default:                   return <FileText size={size} />;
  }
}

const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  business_license:   "Business License",
  health_permit:      "Health Permit",
  sales_tax:          "Sales Tax",
  income_tax:         "Income Tax",
  alcohol_license:    "Alcohol License",
  tobacco_license:    "Tobacco License",
  food_handler:       "Food Handler Cert",
  fire_inspection:    "Fire Inspection",
  // Canada
  gst_hst_filing:     "GST/HST Filing",
  cpp_ei_remittance:  "CPP/EI Remittance",
  wsib_wcb:           "WSIB/WCB",
  t4_slips:           "T4 Slips",
  provincial_license: "Provincial Licence",
  // Mexico
  iva_filing:         "Declaración IVA",
  isr_filing:         "ISR / Pago Provisional",
  imss_registration:  "Registro IMSS",
  sat_cfdi:           "CFDI SAT",
  municipal_license:  "Licencia Municipal",
  cofepris:           "COFEPRIS",
  custom:             "Custom",
};

const CATEGORY_COLORS: Record<ComplianceCategory, string> = {
  business_license:   "text-blue-600 bg-blue-50",
  health_permit:      "text-emerald-600 bg-emerald-50",
  sales_tax:          "text-amber-600 bg-amber-50",
  income_tax:         "text-amber-700 bg-amber-50",
  alcohol_license:    "text-purple-600 bg-purple-50",
  tobacco_license:    "text-stone-600 bg-stone-100",
  food_handler:       "text-teal-600 bg-teal-50",
  fire_inspection:    "text-red-600 bg-red-50",
  // Canada
  gst_hst_filing:     "text-red-700 bg-red-50",
  cpp_ei_remittance:  "text-blue-600 bg-blue-50",
  wsib_wcb:           "text-orange-600 bg-orange-50",
  t4_slips:           "text-indigo-600 bg-indigo-50",
  provincial_license: "text-blue-700 bg-blue-50",
  // Mexico
  iva_filing:         "text-green-700 bg-green-50",
  isr_filing:         "text-amber-700 bg-amber-50",
  imss_registration:  "text-blue-600 bg-blue-50",
  sat_cfdi:           "text-teal-700 bg-teal-50",
  municipal_license:  "text-stone-700 bg-stone-100",
  cofepris:           "text-purple-700 bg-purple-50",
  custom:             "text-stone-600 bg-stone-100",
};

// ─── Filing authority helper ──────────────────────────────────────────────────

function getFilingAuthority(item: ComplianceItem, country: "US" | "CA" | "MX"): string | null {
  if (country === "CA") {
    switch (item.category) {
      case "gst_hst_filing":
      case "cpp_ei_remittance":
      case "t4_slips":
      case "income_tax":
        return "CRA";
      case "wsib_wcb":
        return item.jurisdiction ? `Province: ${item.jurisdiction}` : "Provincial";
      case "business_license":
      case "provincial_license":
      case "health_permit":
      case "food_handler":
      case "alcohol_license":
      case "tobacco_license":
        return item.jurisdiction ? `Province: ${item.jurisdiction}` : "Provincial";
      default:
        return item.jurisdiction ?? null;
    }
  }
  if (country === "MX") {
    switch (item.category) {
      case "iva_filing":
      case "isr_filing":
      case "sat_cfdi":
        return "SAT";
      case "imss_registration":
        return "IMSS";
      case "cofepris":
        return "COFEPRIS";
      case "municipal_license":
      case "alcohol_license":
      case "tobacco_license":
        return "Municipal";
      default:
        return item.jurisdiction ?? null;
    }
  }
  // US
  switch (item.category) {
    case "income_tax":
      return "IRS";
    case "sales_tax":
    case "business_license":
    case "health_permit":
    case "food_handler":
    case "alcohol_license":
    case "tobacco_license":
    case "fire_inspection":
      return item.jurisdiction ? `State: ${item.jurisdiction}` : "State";
    default:
      return item.jurisdiction ?? null;
  }
}

// ─── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({
  daysUntilDue,
  renewalPeriodDays,
  overdue,
}: {
  daysUntilDue: number;
  renewalPeriodDays: number;
  overdue: boolean;
}) {
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let progress = 0;
  if (!overdue) {
    const elapsed = renewalPeriodDays - daysUntilDue;
    progress = Math.min(1, Math.max(0, elapsed / renewalPeriodDays));
  } else {
    progress = 1;
  }

  const offset = circumference * (1 - progress);
  const color = overdue ? "#ef4444" : daysUntilDue <= 14 ? "#f59e0b" : "#10b981";

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e7e5e4"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

interface FormData {
  name: string;
  category: ComplianceCategory;
  dueDate: string;
  renewalPeriodDays: number;
  notes: string;
  jurisdiction: string;
  alertDays: string; // comma-separated
}

const DEFAULT_FORM: FormData = {
  name: "",
  category: "custom",
  dueDate: "",
  renewalPeriodDays: 365,
  notes: "",
  jurisdiction: "",
  alertDays: "30, 14, 7, 1",
};

// ─── CompliancePage ────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { profile } = useApp();  const { activeStoreId } = useAuth();  const country = (profile?.country as "US" | "CA" | "MX") ?? "US";
  const regionCode = profile?.stateCode ? `${country}-${profile.stateCode}` : undefined;

  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionDate, setCompletionDate] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  function refresh() {
    const loaded = getItems();
    setItems(loaded);
    setAlerts(getAlerts());
    scheduleNotifications(loaded);
  }

  useEffect(() => {
    refresh();
  }, [activeStoreId]);

  async function handleAutoSetup() {
    if (!profile) return;
    setSetupLoading(true);
    const businessType = [
      profile.businessType,
      profile.foodBevType,
      profile.retailType,
      profile.servesAlcohol ? "alcohol" : "",
      profile.sellsTobacco ? "tobacco" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const defaults = getDefaultItemsForBusinessType(businessType, regionCode, country);
    for (const d of defaults) {
      saveItem({ ...d });
    }
    refresh();
    setSetupLoading(false);
  }

  function openAdd() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowAddForm(true);
  }

  function openEdit(item: ComplianceItem) {
    setForm({
      name: item.name,
      category: item.category,
      dueDate: item.dueDate,
      renewalPeriodDays: item.renewalPeriodDays,
      notes: item.notes ?? "",
      jurisdiction: item.jurisdiction ?? "",
      alertDays: item.alertDays.join(", "),
    });
    setEditingId(item.id);
    setShowAddForm(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.dueDate) return;
    const alertDays = form.alertDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const payload = {
      name: form.name.trim(),
      category: form.category,
      dueDate: form.dueDate,
      renewalPeriodDays: form.renewalPeriodDays,
      notes: form.notes.trim() || undefined,
      jurisdiction: form.jurisdiction.trim() || undefined,
      alertDays,
    };

    if (editingId) {
      updateItem(editingId, payload);
    } else {
      saveItem(payload);
    }
    setShowAddForm(false);
    refresh();
  }

  function handleDelete(id: string) {
    deleteItem(id);
    refresh();
  }

  function handleMarkCompleted(id: string) {
    const date = completionDate || new Date().toISOString().split("T")[0];
    markCompleted(id);
    updateItem(id, { completedAt: new Date(date).toISOString() });
    setCompletingId(null);
    setCompletionDate("");
    refresh();
  }

  function dismissAlert(itemId: string) {
    setDismissedAlerts((prev) => new Set([...prev, itemId]));
  }

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.item.id));

  // Check for alcohol/tobacco items
  const hasAlcohol = items.some((i) => i.category === "alcohol_license");
  const hasTobacco = items.some((i) => i.category === "tobacco_license");

  // Sort items by dueDate
  const sortedItems = [...items].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  // Country-aware page title and description
  const pageTitle = "Compliance Autopilot";
  const pageDesc =
    country === "CA"
      ? "CRA, Provincial & Municipal deadlines in one place"
      : country === "MX"
      ? "SAT, IMSS y permisos municipales en un solo lugar"
      : "Never miss a deadline";

  // Country-aware age-verification banners
  const alcoholBannerText =
    country === "CA"
      ? "Vérification d'âge / Age verification required. Provincial regulations vary — check local minimum age limits for alcohol sales."
      : country === "MX"
      ? "Verificación de edad requerida. Prohibida la venta de alcohol a menores de 18 años."
      : "Age verification required for alcohol sales. Always check ID — customers must be 21+.";

  const tobaccoBannerText =
    country === "CA"
      ? "Vérification d'âge / Age verification required. Provincial regulations vary — check local age limits for tobacco and vape sales."
      : country === "MX"
      ? "Verificación de edad requerida. Prohibida la venta de tabaco a menores de 18 años."
      : "Age verification required for tobacco/vape sales. Customers must be 21+. No exceptions.";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">{pageTitle}</h1>
          <p className="text-stone-500 text-sm mt-1">{pageDesc}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow transition-colors shrink-0"
        >
          <Plus size={15} /> Add Item
        </button>
      </div>

      {/* Age-restricted sale banners */}
      {hasAlcohol && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3 text-sm">
          <Wine size={18} className="text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {alcoholBannerText}
          </span>
        </div>
      )}
      {hasTobacco && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3 text-sm">
          <Cigarette size={18} className="text-amber-600 shrink-0" />
          <span className="text-amber-800 font-medium">
            {tobaccoBannerText}
          </span>
        </div>
      )}

      {/* Alert banners */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          {visibleAlerts.map((alert) => (
            <AlertBanner
              key={alert.item.id}
              alert={alert}
              onDismiss={() => dismissAlert(alert.item.id)}
            />
          ))}
        </div>
      )}

      {/* Setup prompt */}
      {items.length === 0 && (
        <div className="rounded-[30px] border border-white/60 bg-white/60 p-8 shadow-sm text-center space-y-4">
          <Shield size={40} className="text-amber-400 mx-auto" />
          <div>
            <div className="font-bold text-stone-800 text-lg">
              Let&apos;s set up your compliance calendar
            </div>
            <div className="text-stone-500 text-sm mt-1">
              What type of business are you? We&apos;ll auto-fill the required permits and deadlines.
            </div>
          </div>
          {profile ? (
            <div className="space-y-3">
              <div className="text-sm text-stone-600">
                Detected:{" "}
                <span className="font-semibold capitalize">
                  {profile.businessType}
                  {profile.foodBevType ? ` · ${profile.foodBevType}` : ""}
                  {profile.retailType ? ` · ${profile.retailType}` : ""}
                </span>
                {profile.stateCode && ` · ${profile.stateCode}`}
                {country !== "US" && (
                  <span className="ml-1">
                    · {country === "CA" ? "🇨🇦 Canada" : "🇲🇽 México"}
                  </span>
                )}
              </div>
              <button
                onClick={handleAutoSetup}
                disabled={setupLoading}
                className="flex items-center gap-2 mx-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-colors"
              >
                <Zap size={15} />
                {setupLoading ? "Setting up…" : "Auto-setup compliance items"}
              </button>
            </div>
          ) : (
            <p className="text-stone-400 text-sm">
              Or add items manually using the button above.
            </p>
          )}
        </div>
      )}

      {/* Compliance calendar */}
      {sortedItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-stone-700">Compliance Calendar</h2>
          {sortedItems.map((item) => (
            <ComplianceCard
              key={item.id}
              item={item}
              country={country}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
              onComplete={() => setCompletingId(item.id)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-bold text-stone-800">
                {editingId ? "Edit Compliance Item" : "Add Compliance Item"}
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded-lg text-stone-400 hover:bg-stone-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-stone-500 block mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Annual Business License"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-stone-500 block mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as ComplianceCategory }))
                  }
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due date + renewal period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-500 block mb-1">Due Date *</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 block mb-1">
                    Renewal Period (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.renewalPeriodDays}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, renewalPeriodDays: parseInt(e.target.value, 10) || 365 }))
                    }
                    className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Jurisdiction */}
              <div>
                <label className="text-xs font-semibold text-stone-500 block mb-1">
                  Jurisdiction (optional)
                </label>
                <input
                  value={form.jurisdiction}
                  onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                  placeholder="e.g. Ontario, Municipio de Guadalajara"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Alert days */}
              <div>
                <label className="text-xs font-semibold text-stone-500 block mb-1">
                  Alert days before due (comma-separated)
                </label>
                <input
                  value={form.alertDays}
                  onChange={(e) => setForm((f) => ({ ...f, alertDays: e.target.value }))}
                  placeholder="30, 14, 7, 1"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-stone-500 block mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any special instructions or requirements…"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 border border-stone-300 rounded-xl py-3 text-sm font-semibold text-stone-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.dueDate}
                className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors"
              >
                {editingId ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark completed modal */}
      {completingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-stone-800">Mark as Completed</h3>
            <div>
              <label className="text-xs font-semibold text-stone-500 block mb-1">
                Completion Date
              </label>
              <input
                type="date"
                value={completionDate || new Date().toISOString().split("T")[0]}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCompletingId(null)}
                className="flex-1 border border-stone-300 rounded-xl py-2.5 text-sm font-semibold text-stone-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkCompleted(completingId)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
              >
                Mark Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AlertBanner ──────────────────────────────────────────────────────────────

function AlertBanner({ alert, onDismiss }: { alert: ComplianceAlert; onDismiss: () => void }) {
  const config = {
    critical: {
      bg: "bg-red-50 border-red-200",
      icon: <AlertTriangle size={16} className="text-red-600 shrink-0" />,
      text: "text-red-800",
    },
    warning: {
      bg: "bg-amber-50 border-amber-200",
      icon: <AlertTriangle size={16} className="text-amber-600 shrink-0" />,
      text: "text-amber-800",
    },
    info: {
      bg: "bg-blue-50 border-blue-200",
      icon: <Info size={16} className="text-blue-600 shrink-0" />,
      text: "text-blue-800",
    },
  }[alert.severity];

  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-3 ${config.bg}`}>
      {config.icon}
      <span className={`text-sm font-medium flex-1 ${config.text}`}>{alert.message}</span>
      <button
        onClick={onDismiss}
        className="p-1 rounded-lg text-stone-400 hover:bg-white/60 transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── ComplianceCard ───────────────────────────────────────────────────────────

function ComplianceCard({
  item,
  country,
  onEdit,
  onDelete,
  onComplete,
}: {
  item: ComplianceItem;
  country: "US" | "CA" | "MX";
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const daysUntilDue = Math.ceil(
    (new Date(item.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const overdue = daysUntilDue < 0;
  const isCompleted = item.status === "completed";

  const statusBg = isCompleted
    ? "border-emerald-100 bg-emerald-50/60"
    : overdue
    ? "border-red-100 bg-red-50/60"
    : daysUntilDue <= 14
    ? "border-amber-100 bg-amber-50/60"
    : "border-white/60 bg-white/60";

  const filingAuthority = getFilingAuthority(item, country);

  return (
    <div className={`rounded-[30px] border p-5 shadow-sm ${statusBg}`}>
      <div className="flex items-start gap-4">
        {/* Progress ring */}
        <div className="relative shrink-0">
          <ProgressRing
            daysUntilDue={daysUntilDue}
            renewalPeriodDays={item.renewalPeriodDays}
            overdue={overdue}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${CATEGORY_COLORS[item.category].split(" ")[0]}`}>
              <CategoryIcon category={item.category} size={16} />
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-stone-800">{item.name}</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category]}`}
                >
                  {CATEGORY_LABELS[item.category]}
                </span>
              </div>
              {filingAuthority && (
                <div className="text-xs text-stone-400 mt-0.5">{filingAuthority}</div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {!isCompleted && (
                <button
                  onClick={onComplete}
                  className="p-2 rounded-lg text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                  title="Mark completed"
                >
                  <CheckCircle size={15} />
                </button>
              )}
              <button
                onClick={onEdit}
                className="p-2 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="p-2 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          {/* Countdown */}
          <div className="mt-2">
            {isCompleted ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                <CheckCircle size={14} />
                Completed
                {item.completedAt && (
                  <span className="font-normal text-stone-400 text-xs">
                    on {new Date(item.completedAt).toLocaleDateString()}
                  </span>
                )}
              </span>
            ) : overdue ? (
              <span className="text-sm font-bold text-red-600">
                OVERDUE by {Math.abs(daysUntilDue)} day{Math.abs(daysUntilDue) !== 1 ? "s" : ""}
              </span>
            ) : (
              <span
                className={`text-sm font-semibold ${
                  daysUntilDue <= 7
                    ? "text-red-600"
                    : daysUntilDue <= 14
                    ? "text-amber-600"
                    : "text-stone-600"
                }`}
              >
                Due in {daysUntilDue} day{daysUntilDue !== 1 ? "s" : ""}
              </span>
            )}
            {!isCompleted && (
              <span className="text-xs text-stone-400 ml-2">
                ({new Date(item.dueDate).toLocaleDateString()})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pl-16 space-y-2 text-sm text-stone-600">
          {item.notes && (
            <div className="bg-white/80 rounded-xl px-3 py-2 text-xs">{item.notes}</div>
          )}
          <div className="text-xs text-stone-400">
            Renews every {item.renewalPeriodDays} days · Alerts at{" "}
            {item.alertDays.join(", ")} days before due
          </div>
        </div>
      )}
    </div>
  );
}
