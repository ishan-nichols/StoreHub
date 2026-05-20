import { useState, useEffect } from "react";
import {
  Shield, MapPin, Clock, Bell, FileText, Plus, X, Trash2, Check,
  AlertTriangle, Info, Zap, ToggleLeft, ToggleRight, ChevronDown,
  ChevronUp, Users, Calendar, Eye, Megaphone, RefreshCw, Ban,
  CheckCircle, XCircle, Edit2, AlertCircle,
} from "lucide-react";
import {
  listLocationRules, createLocationRule, updateLocationRule, deleteLocationRule,
  listTimeRules, createTimeRule, updateTimeRule, deleteTimeRule,
  listAccessLog, clearAccessLog,
  listOverrides, setOverride, removeOverride,
  type LocationRule, type TimeRule, type TimeWindow, type AccessLogEntry,
} from "../services/accessControlService";
import {
  listAllRequests, approveRequest, denyRequest, deleteRequest,
  type TimeOffRequest, type TimeOffType,
} from "../services/timeOffService";
import {
  listAll as listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  type Announcement, type AnnouncementPriority,
} from "../services/announcementService";
import { getEmployees, type Employee } from "../services/dataService";
import { PageHero, SummaryTile } from "../components/page-shell";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function minutesToHHMM(total: number) { return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`; }
function hhmmToMinutes(s: string) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_OFF_TYPE_LABELS: Record<TimeOffType, string> = {
  vacation: "Vacation",
  sick:     "Sick Leave",
  personal: "Personal",
  unpaid:   "Unpaid",
  other:    "Other",
};

const PRIORITY_CONFIG: Record<AnnouncementPriority, { label: string; color: string; icon: React.ReactNode }> = {
  info:    { label: "Info",    color: "bg-blue-100 text-blue-700",   icon: <Info size={14} /> },
  warning: { label: "Warning", color: "bg-amber-100 text-amber-700", icon: <AlertTriangle size={14} /> },
  urgent:  { label: "Urgent",  color: "bg-red-100 text-red-600",     icon: <Zap size={14} /> },
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "access" | "timeoff" | "announcements" | "auditlog";

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL TAB
// ═══════════════════════════════════════════════════════════════════════════════

function LocationRuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule:     LocationRule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={`rounded-[20px] border p-4 transition-colors ${rule.active ? "border-emerald-200 bg-emerald-50/30" : "border-stone-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="shrink-0 text-stone-400" />
            <p className="font-semibold text-stone-900 truncate">{rule.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">{rule.address || `${rule.latitude.toFixed(4)}, ${rule.longitude.toFixed(4)}`}</p>
          <p className="mt-1 text-xs text-stone-400">Radius: {rule.radiusMeters}m</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onToggle(rule.id, !rule.active)} className="transition hover:opacity-75">
            {rule.active
              ? <ToggleRight size={30} className="text-emerald-500" />
              : <ToggleLeft size={30} className="text-stone-300" />}
          </button>
          {confirming ? (
            <div className="flex gap-1">
              <button onClick={() => onDelete(rule.id)} className="rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white">Yes</button>
              <button onClick={() => setConfirming(false)} className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-500">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="p-1.5 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddLocationRuleModal({ onClose, onSave }: { onClose: () => void; onSave: (r: Omit<LocationRule, "id" | "createdAt">) => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("200");
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");

  function detectLocation() {
    if (!navigator.geolocation) { setError("Geolocation not available."); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setDetecting(false);
      },
      () => { setError("Could not detect location."); setDetecting(false); },
      { timeout: 8000 }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const latN = parseFloat(lat); const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) { setError("Enter valid coordinates."); return; }
    onSave({ name, address, latitude: latN, longitude: lngN, radiusMeters: parseInt(radius) || 200, active: true });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h3 className="font-semibold text-stone-900">Add Location Rule</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100"><X size={16} className="text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Location Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Store" required className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Address (optional)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Latitude</label>
              <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="40.7128" required className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Longitude</label>
              <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-74.0060" required className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <button type="button" onClick={detectLocation} disabled={detecting} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200 py-2.5 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-60">
            <MapPin size={14} /> {detecting ? "Detecting…" : "Use my current location"}
          </button>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Allowed Radius (meters)</label>
            <input type="number" min="50" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">Add Location</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const DEFAULT_WINDOWS: TimeWindow[] = [1,2,3,4,5].map((d) => ({ dayOfWeek: d, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 }));

function AddTimeRuleModal({ onClose, onSave }: { onClose: () => void; onSave: (r: Omit<TimeRule, "id" | "createdAt">) => void }) {
  const [name, setName] = useState("Working Hours");
  const [blockOutside, setBlockOutside] = useState(true);
  const [windows, setWindows] = useState<TimeWindow[]>(DEFAULT_WINDOWS);

  const enabledDays = new Set(windows.map((w) => w.dayOfWeek));

  function toggleDay(dow: number) {
    if (enabledDays.has(dow)) {
      setWindows((prev) => prev.filter((w) => w.dayOfWeek !== dow));
    } else {
      setWindows((prev) => [...prev, { dayOfWeek: dow, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 }].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
    }
  }

  function updateWindow(dow: number, field: keyof TimeWindow, value: string) {
    setWindows((prev) => prev.map((w) => {
      if (w.dayOfWeek !== dow) return w;
      if (field === "startHour" || field === "endHour" || field === "startMinute" || field === "endMinute") {
        const mins = hhmmToMinutes(value);
        return { ...w, [field === "startHour" || field === "startMinute" ? "startHour" : "endHour"]: Math.floor(mins / 60), [field === "startHour" || field === "startMinute" ? "startMinute" : "endMinute"]: mins % 60 };
      }
      return w;
    }));
  }

  function handleWindowTime(dow: number, which: "start" | "end", value: string) {
    const mins = hhmmToMinutes(value);
    setWindows((prev) => prev.map((w) => {
      if (w.dayOfWeek !== dow) return w;
      if (which === "start") return { ...w, startHour: Math.floor(mins / 60), startMinute: mins % 60 };
      return { ...w, endHour: Math.floor(mins / 60), endMinute: mins % 60 };
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ name, windows, blockOutsideHours: blockOutside, active: true });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h3 className="font-semibold text-stone-900">Add Time Rule</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100"><X size={16} className="text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Rule Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-700">Block access outside hours</p>
              <p className="text-xs text-stone-400">Prevents employees from accessing the portal outside their scheduled windows</p>
            </div>
            <button type="button" onClick={() => setBlockOutside((v) => !v)} className="transition hover:opacity-75">
              {blockOutside ? <ToggleRight size={30} className="text-emerald-500" /> : <ToggleLeft size={30} className="text-stone-300" />}
            </button>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Active Days</p>
            <div className="flex flex-wrap gap-2">
              {[0,1,2,3,4,5,6].map((dow) => (
                <button
                  type="button"
                  key={dow}
                  onClick={() => toggleDay(dow)}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${enabledDays.has(dow) ? "bg-amber-500 text-white" : "border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100"}`}
                >
                  {DAY_SHORT[dow]}
                </button>
              ))}
            </div>
          </div>
          {[...enabledDays].sort((a, b) => a - b).map((dow) => {
            const w = windows.find((x) => x.dayOfWeek === dow)!;
            return (
              <div key={dow} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="mb-3 text-sm font-semibold text-stone-700">{DAY_NAMES[dow]}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-500">Start Time</label>
                    <input type="time" value={minutesToHHMM(w.startHour * 60 + w.startMinute)} onChange={(e) => handleWindowTime(dow, "start", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-500">End Time</label>
                    <input type="time" value={minutesToHHMM(w.endHour * 60 + w.endMinute)} onChange={(e) => handleWindowTime(dow, "end", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">Save Rule</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccessControlTab() {
  const [locationRules, setLocationRules] = useState<LocationRule[]>([]);
  const [timeRules,     setTimeRules]     = useState<TimeRule[]>([]);
  const [accessLog,     setAccessLog]     = useState<AccessLogEntry[]>([]);
  const [showAddLoc,    setShowAddLoc]    = useState(false);
  const [showAddTime,   setShowAddTime]   = useState(false);
  const [logExpanded,   setLogExpanded]   = useState(false);

  function refresh() {
    setLocationRules(listLocationRules());
    setTimeRules(listTimeRules());
    setAccessLog(listAccessLog(50));
  }

  useEffect(() => { refresh(); }, []);

  const DECISION_STYLES: Record<string, string> = {
    allowed:          "bg-emerald-100 text-emerald-700",
    blocked_location: "bg-orange-100 text-orange-700",
    blocked_time:     "bg-red-100 text-red-700",
    allowed_override: "bg-indigo-100 text-indigo-700",
  };

  const ACTION_ICONS: Record<string, React.ReactNode> = {
    clock_in:     <Clock size={12} />,
    clock_out:    <Clock size={12} />,
    portal_login: <Shield size={12} />,
    module_access:<Eye size={12} />,
    access_denied:<Ban size={12} />,
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Location Rules */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 flex items-center gap-2"><MapPin size={16} className="text-amber-500" /> Location Rules</h3>
            <p className="text-xs text-stone-400 mt-0.5">Define allowed locations. Employees must be within the radius to clock in from a personal device.</p>
          </div>
          <button onClick={() => setShowAddLoc(true)} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            <Plus size={14} /> Add Location
          </button>
        </div>
        {locationRules.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-stone-200 py-10 text-center text-stone-400">
            <MapPin size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No location rules yet. Add your first one to restrict access by location.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {locationRules.map((r) => (
              <LocationRuleCard
                key={r.id}
                rule={r}
                onToggle={(id, active) => { updateLocationRule(id, { active }); refresh(); }}
                onDelete={(id) => { deleteLocationRule(id); refresh(); }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Time Rules */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 flex items-center gap-2"><Clock size={16} className="text-indigo-500" /> Time Rules</h3>
            <p className="text-xs text-stone-400 mt-0.5">Restrict portal access to specific hours. Employees outside the window see an access blocked screen.</p>
          </div>
          <button onClick={() => setShowAddTime(true)} className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={14} /> Add Rule
          </button>
        </div>
        {timeRules.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-stone-200 py-10 text-center text-stone-400">
            <Clock size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No time rules yet. Without a rule, access is allowed at any time.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {timeRules.map((r) => (
              <div key={r.id} className={`rounded-[20px] border p-4 ${r.active ? "border-indigo-200 bg-indigo-50/30" : "border-stone-200 bg-white"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-stone-900">{r.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {r.blockOutsideHours ? "Blocks access outside hours" : "Advisory only"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.windows.map((w, i) => (
                        <span key={i} className="rounded-xl bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                          {DAY_SHORT[w.dayOfWeek]} {minutesToHHMM(w.startHour * 60 + w.startMinute)}–{minutesToHHMM(w.endHour * 60 + w.endMinute)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { updateTimeRule(r.id, { active: !r.active }); refresh(); }} className="transition hover:opacity-75">
                      {r.active ? <ToggleRight size={30} className="text-indigo-500" /> : <ToggleLeft size={30} className="text-stone-300" />}
                    </button>
                    <button onClick={() => { deleteTimeRule(r.id); refresh(); }} className="p-1.5 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Access Log */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-stone-900 flex items-center gap-2"><FileText size={16} className="text-stone-400" /> Access Log</h3>
          <div className="flex gap-2">
            <button onClick={() => { refresh(); }} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-50">
              <RefreshCw size={12} /> Refresh
            </button>
            {accessLog.length > 0 && (
              <button onClick={() => { clearAccessLog(); refresh(); }} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
                <Trash2 size={12} /> Clear log
              </button>
            )}
          </div>
        </div>
        {accessLog.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-stone-200 py-8 text-center text-stone-400">
            <FileText size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No access events logged yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-stone-200 bg-white">
            <div className="divide-y divide-stone-50">
              {(logExpanded ? accessLog : accessLog.slice(0, 10)).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 text-xs">
                  <span className="text-stone-300 shrink-0">{ACTION_ICONS[entry.action]}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-stone-800">{entry.employeeName}</span>
                    <span className="ml-2 text-stone-400 capitalize">{entry.action.replace(/_/g, " ")}</span>
                    {entry.moduleName && <span className="ml-1 text-stone-400">· {entry.moduleName}</span>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${DECISION_STYLES[entry.decision] ?? "bg-stone-100 text-stone-500"}`}>
                    {entry.decision.replace(/_/g, " ")}
                  </span>
                  {entry.locationState === "on_site" && <span className="shrink-0 text-emerald-400 text-[10px]">On-site</span>}
                  {entry.locationState === "remote"  && <span className="shrink-0 text-orange-400 text-[10px]">Remote {entry.distanceMeters !== null ? `${Math.round(entry.distanceMeters)}m` : ""}</span>}
                  <span className="shrink-0 text-stone-300">{fmtDateTime(entry.timestamp)}</span>
                </div>
              ))}
            </div>
            {accessLog.length > 10 && (
              <button onClick={() => setLogExpanded((v) => !v)} className="flex w-full items-center justify-center gap-2 border-t border-stone-100 py-3 text-xs text-stone-400 hover:bg-stone-50">
                {logExpanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {accessLog.length} entries</>}
              </button>
            )}
          </div>
        )}
      </section>

      {showAddLoc && <AddLocationRuleModal onClose={() => setShowAddLoc(false)} onSave={(r) => { createLocationRule(r); refresh(); }} />}
      {showAddTime && <AddTimeRuleModal onClose={() => setShowAddTime(false)} onSave={(r) => { createTimeRule(r); refresh(); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIME OFF TAB
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG = {
  pending:  { color: "bg-amber-100 text-amber-700",   icon: <Clock size={12} /> },
  approved: { color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle size={12} /> },
  denied:   { color: "bg-red-100 text-red-600",       icon: <XCircle size={12} /> },
  cancelled:{ color: "bg-stone-100 text-stone-500",   icon: <Ban size={12} /> },
};

function TimeOffTab() {
  const [requests,   setRequests]   = useState<TimeOffRequest[]>([]);
  const [filter,     setFilter]     = useState<"all" | "pending" | "approved" | "denied">("pending");
  const [reviewId,   setReviewId]   = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewErr,  setReviewErr]  = useState("");

  function refresh() { setRequests(listAllRequests()); }
  useEffect(() => { refresh(); }, []);

  const displayed = requests.filter((r) => filter === "all" || r.status === filter);

  function handleApprove(id: string) {
    approveRequest(id, "Manager", reviewNote);
    setReviewId(null);
    setReviewNote("");
    refresh();
  }

  function handleDeny(id: string) {
    if (!reviewNote.trim()) { setReviewErr("Please provide a reason for denial."); return; }
    denyRequest(id, "Manager", reviewNote);
    setReviewId(null);
    setReviewNote("");
    setReviewErr("");
    refresh();
  }

  const pendingCount   = requests.filter((r) => r.status === "pending").length;
  const approvedCount  = requests.filter((r) => r.status === "approved").length;
  const totalDaysOff   = requests.filter((r) => r.status === "approved").reduce((s, r) => s + r.totalDays, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[20px] bg-amber-50 p-4">
          <p className="text-2xl font-bold text-stone-900">{pendingCount}</p>
          <p className="text-xs text-stone-500 mt-0.5">Pending Requests</p>
        </div>
        <div className="rounded-[20px] bg-emerald-50 p-4">
          <p className="text-2xl font-bold text-stone-900">{approvedCount}</p>
          <p className="text-xs text-stone-500 mt-0.5">Approved</p>
        </div>
        <div className="rounded-[20px] bg-indigo-50 p-4">
          <p className="text-2xl font-bold text-stone-900">{totalDaysOff}</p>
          <p className="text-xs text-stone-500 mt-0.5">Days Approved</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["pending", "approved", "denied", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors capitalize ${filter === f ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Request list */}
      {displayed.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-stone-200 py-12 text-center text-stone-400">
          <Calendar size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {filter === "all" ? "" : filter} requests.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map((req) => {
            const sc = STATUS_CONFIG[req.status];
            const isReviewing = reviewId === req.id;
            return (
              <div key={req.id} className="rounded-[20px] border border-stone-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-stone-900">{req.employeeName}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${sc.color}`}>
                        {sc.icon} {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                        {TIME_OFF_TYPE_LABELS[req.type]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">
                      {fmtDate(req.startDate)} → {fmtDate(req.endDate)}
                      <span className="ml-2 text-stone-400">({req.totalDays} day{req.totalDays !== 1 ? "s" : ""})</span>
                    </p>
                    {req.reason && <p className="mt-1 text-xs text-stone-400 italic">"{req.reason}"</p>}
                    {req.reviewNote && (
                      <p className="mt-1 text-xs text-stone-500">
                        <span className="font-medium">{req.reviewedBy}:</span> {req.reviewNote}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-stone-300">Submitted {fmtDateTime(req.createdAt)}</p>
                  </div>

                  {req.status === "pending" && !isReviewing && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setReviewId(req.id); setReviewNote(""); setReviewErr(""); }}
                        className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                      >
                        <Edit2 size={12} /> Review
                      </button>
                    </div>
                  )}

                  <button onClick={() => { deleteRequest(req.id); refresh(); }} className="p-1.5 text-stone-300 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>

                {isReviewing && (
                  <div className="mt-4 border-t border-stone-100 pt-4 flex flex-col gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-600">Manager note (required to deny)</label>
                      <textarea
                        rows={2}
                        value={reviewNote}
                        onChange={(e) => { setReviewNote(e.target.value); setReviewErr(""); }}
                        placeholder="Optional note for employee…"
                        className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {reviewErr && <p className="mt-1 text-xs text-red-500">{reviewErr}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setReviewId(null); setReviewErr(""); }} className="flex-1 rounded-xl border border-stone-200 py-2 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
                      <button onClick={() => handleDeny(req.id)} className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600">Deny</button>
                      <button onClick={() => handleApprove(req.id)} className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Approve</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [employees,     setEmployees]     = useState<Employee[]>([]);
  const [showCreate,    setShowCreate]    = useState(false);
  const [editId,        setEditId]        = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Create/edit form
  const [title,      setTitle]      = useState("");
  const [body,       setBody]       = useState("");
  const [priority,   setPriority]   = useState<AnnouncementPriority>("info");
  const [pinned,     setPinned]     = useState(false);
  const [targetAll,  setTargetAll]  = useState(true);
  const [targetEIds, setTargetEIds] = useState<string[]>([]);
  const [expiresAt,  setExpiresAt]  = useState("");

  function refresh() {
    setAnnouncements(listAnnouncements());
  }

  useEffect(() => {
    refresh();
    getEmployees().then(setEmployees);
  }, []);

  function resetForm() {
    setTitle(""); setBody(""); setPriority("info");
    setPinned(false); setTargetAll(true); setTargetEIds([]); setExpiresAt("");
    setShowCreate(false); setEditId(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      updateAnnouncement(editId, {
        title, body, priority, pinned, targetAll,
        targetEmployeeIds: targetAll ? [] : targetEIds,
        expiresAt: expiresAt || null,
      });
    } else {
      createAnnouncement({
        title, body, priority, pinned, targetAll,
        targetEmployeeIds: targetAll ? [] : targetEIds,
        expiresAt: expiresAt || null,
        createdBy: "Manager",
      });
    }
    resetForm();
    refresh();
  }

  function startEdit(ann: Announcement) {
    setTitle(ann.title);
    setBody(ann.body);
    setPriority(ann.priority);
    setPinned(ann.pinned);
    setTargetAll(ann.targetAll);
    setTargetEIds(ann.targetEmployeeIds);
    setExpiresAt(ann.expiresAt ?? "");
    setEditId(ann.id);
    setShowCreate(true);
  }

  const showForm = showCreate || editId !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-stone-900">Announcements</h3>
          <p className="text-xs text-stone-400 mt-0.5">Post notices and updates for your employees. They see these on the portal.</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            <Plus size={14} /> New Announcement
          </button>
        )}
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-[20px] border border-amber-200 bg-amber-50/40 p-6 flex flex-col gap-4">
          <h4 className="font-semibold text-stone-900">{editId ? "Edit Announcement" : "New Announcement"}</h4>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Schedule change, team meeting…" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Message</label>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Details…" className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Priority</label>
              <div className="flex gap-2">
                {(["info", "warning", "urgent"] as const).map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-colors border ${priority === p ? cfg.color + " border-transparent" : "border-stone-200 bg-white text-stone-500"}`}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Expires</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPinned((v) => !v)} className="transition hover:opacity-75">
                {pinned ? <ToggleRight size={26} className="text-amber-500" /> : <ToggleLeft size={26} className="text-stone-300" />}
              </button>
              <span className="text-sm text-stone-700">Pin to top</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTargetAll((v) => !v)} className="transition hover:opacity-75">
                {targetAll ? <ToggleRight size={26} className="text-amber-500" /> : <ToggleLeft size={26} className="text-stone-300" />}
              </button>
              <span className="text-sm text-stone-700">All employees</span>
            </div>
          </div>
          {!targetAll && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Target employees</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {employees.map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => setTargetEIds((prev) => prev.includes(em.id) ? prev.filter((id) => id !== em.id) : [...prev, em.id])}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${targetEIds.includes(em.id) ? "bg-amber-500 text-white" : "border border-stone-200 bg-white text-stone-600"}`}
                  >
                    {em.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={resetForm} className="flex-1 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600">
              {editId ? "Update" : "Post Announcement"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {announcements.length === 0 && !showForm ? (
        <div className="rounded-[20px] border border-dashed border-stone-200 py-12 text-center text-stone-400">
          <Megaphone size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No announcements yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((ann) => {
            const cfg = PRIORITY_CONFIG[ann.priority];
            return (
              <div key={ann.id} className={`rounded-[20px] border p-5 ${ann.priority === "urgent" ? "border-red-200 bg-red-50/30" : ann.priority === "warning" ? "border-amber-200 bg-amber-50/30" : "border-stone-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {ann.pinned && <span className="text-xs font-bold text-amber-600">📌 PINNED</span>}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      {ann.targetAll ? (
                        <span className="text-xs text-stone-400 flex items-center gap-1"><Users size={10} /> All employees</span>
                      ) : (
                        <span className="text-xs text-stone-400">{ann.targetEmployeeIds.length} employee{ann.targetEmployeeIds.length !== 1 ? "s" : ""}</span>
                      )}
                      <span className="text-xs text-stone-300">· {ann.readByEmployeeIds.length} read</span>
                    </div>
                    <h4 className="font-semibold text-stone-900">{ann.title}</h4>
                    <p className="mt-1 text-sm text-stone-600 whitespace-pre-wrap leading-relaxed">{ann.body}</p>
                    <p className="mt-2 text-xs text-stone-400">
                      Posted {fmtDate(ann.createdAt)}
                      {ann.expiresAt && ` · Expires ${fmtDate(ann.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEdit(ann)} className="p-1.5 rounded-xl text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors">
                      <Edit2 size={14} />
                    </button>
                    {deleteConfirm === ann.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => { deleteAnnouncement(ann.id); setDeleteConfirm(null); refresh(); }} className="rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white">Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-500">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(ann.id)} className="p-1.5 rounded-xl text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HR PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function HRPage() {
  const [activeTab, setActiveTab] = useState<Tab>("access");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setPendingCount(listAllRequests().filter((r) => r.status === "pending").length);
  }, [activeTab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "access",        label: "Access Control",  icon: <Shield size={15} />   },
    { id: "timeoff",       label: "Time Off",        icon: <Calendar size={15} /> },
    { id: "announcements", label: "Announcements",   icon: <Bell size={15} />     },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <PageHero
        eyebrow="HR & Access"
        title="Human Resources"
        description="Manage employee access rules, time-off requests, and team announcements."
        stats={
          <>
            <SummaryTile label="Pending Requests" value={String(pendingCount)} hint={pendingCount > 0 ? "Needs review" : "All clear"} />
            <SummaryTile label="Location Rules" value={String(listLocationRules().length)} />
            <SummaryTile label="Time Rules" value={String(listTimeRules().length)} />
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${activeTab === t.id ? "bg-stone-900 text-white" : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"}`}
          >
            {t.icon}
            {t.label}
            {t.id === "timeoff" && pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white leading-none">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "access"        && <AccessControlTab />}
      {activeTab === "timeoff"       && <TimeOffTab />}
      {activeTab === "announcements" && <AnnouncementsTab />}
    </div>
  );
}
