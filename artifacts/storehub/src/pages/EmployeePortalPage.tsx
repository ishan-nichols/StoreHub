/**
 * Employee Portal — unified kiosk for all store staff.
 *
 * Store identification (in order of priority):
 *  1. localStorage key  "sh_portal_store_id"  → "store device" mode (set by manager)
 *  2. URL query param   ?store=STORE_USER_ID   → personal device / shared link
 *  3. Neither           → ask manager for the link
 *
 * Authentication: server-side PIN verification via /api/portal/:id/verify-pin.
 * A short-lived portal JWT is stored in memory and used for clock-in/out.
 *
 * Location: browser Geolocation compared with store coordinates.
 *  • Store device mode → location check skipped (device is already at the store).
 *  • Personal device   → on-site badge if within 500 m.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  User, Clock, LogIn, LogOut, Timer, Calendar, DollarSign, MapPin,
  Wifi, WifiOff, ChevronLeft, X, Link2, Shield, MonitorSmartphone,
  ShoppingCart, Package, Receipt, Wallet, BarChart2, Truck,
  Users, TrendingUp, UserCheck, Settings, Landmark,
  CalendarDays, Plane, Megaphone, Bell, BellDot, CheckCircle2,
  AlertTriangle, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { API_BASE_URL } from "../services/dataService";
import {
  listRequestsByEmployee, createRequest, cancelRequest,
  TimeOffRequest, TimeOffType,
} from "../services/timeOffService";
import {
  listForEmployee, markRead, unreadCount as getUnreadCount,
  Announcement,
} from "../services/announcementService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreInfo {
  storeName:      string;
  storeCity:      string | null;
  storeLatitude:  number | null;
  storeLongitude: number | null;
  employees:      { id: string; name: string; role: string }[];
}

interface Identity {
  type:        "employee" | "manager";
  id:          string | null;
  name:        string;
  role:        string;
  isManager:   boolean;
  permissions: Record<string, boolean> | null;
}

interface ShiftRow {
  id:          string;
  shiftStart:  string;
  shiftEnd:    string | null;
  hoursWorked: number | null;
}

interface LocationStatus {
  state:    "idle" | "checking" | "on_site" | "remote" | "unavailable";
  distance: number | null;
}

interface ScheduledShift {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  role: string;
  notes: string;
  status: "draft" | "published" | "acknowledged" | "cancelled";
  weekKey: string;
}

const SCHEDULE_KEY = "storehub_schedule_v2";

function readScheduleForEmployee(employeeId: string): ScheduledShift[] {
  try {
    const all: ScheduledShift[] = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "[]");
    const today = new Date().toISOString().slice(0, 10);
    return all
      .filter((s) => s.employeeId === employeeId && s.date >= today && s.status !== "cancelled")
      .sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt))
      .slice(0, 20);
  } catch { return []; }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_DEVICE_KEY = "sh_portal_store_id";
const ON_SITE_METERS   = 500;

const MODULE_CONFIG: Array<{
  key: string; label: string; href: string;
  icon: React.ElementType; color: string; bg: string;
}> = [
  { key: "pos",        label: "POS / Checkout",  href: "/pos",         icon: ShoppingCart, color: "text-amber-700",  bg: "bg-amber-100"  },
  { key: "inventory",  label: "Inventory",        href: "/inventory",   icon: Package,      color: "text-blue-700",   bg: "bg-blue-100"   },
  { key: "sales",      label: "Sales",            href: "/sales",       icon: Receipt,      color: "text-green-700",  bg: "bg-green-100"  },
  { key: "expenses",   label: "Expenses",         href: "/expenses",    icon: Wallet,       color: "text-red-700",    bg: "bg-red-100"    },
  { key: "reports",    label: "Reports",          href: "/reports",     icon: BarChart2,    color: "text-purple-700", bg: "bg-purple-100" },
  { key: "suppliers",  label: "Suppliers",        href: "/suppliers",   icon: Truck,        color: "text-stone-700",  bg: "bg-stone-100"  },
  { key: "customers",  label: "Customers",        href: "/customers",   icon: UserCheck,    color: "text-pink-700",   bg: "bg-pink-100"   },
  { key: "cashflow",   label: "Cash Flow",        href: "/cashflow",    icon: TrendingUp,   color: "text-stone-700",  bg: "bg-stone-100"  },
  { key: "employees",  label: "Employees",        href: "/employees",   icon: Users,        color: "text-indigo-700", bg: "bg-indigo-100" },
  { key: "tax",        label: "Tax Center",       href: "/tax",         icon: Landmark,     color: "text-stone-700",  bg: "bg-stone-100"  },
  { key: "settings",   label: "Settings",         href: "/settings",    icon: Settings,     color: "text-gray-700",   bg: "bg-gray-100"   },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
}

function useTimer(start: string | null) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!start) { setSec(0); return; }
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [start]);
  return sec;
}

// ─── Portal API calls (no auth cookie needed) ─────────────────────────────────

const portalBase = (storeId: string) => `${API_BASE_URL}/api/portal/${storeId}`;

async function apiGetInfo(storeId: string): Promise<StoreInfo> {
  const r = await fetch(`${portalBase(storeId)}/info`);
  if (!r.ok) throw new Error((await r.json()).error ?? "Store not found");
  return r.json();
}

async function apiVerifyPin(storeId: string, pin: string): Promise<{ token: string; identity: Identity }> {
  const r = await fetch(`${portalBase(storeId)}/verify-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Invalid PIN");
  return data;
}

async function apiActiveShift(storeId: string, token: string): Promise<ShiftRow | null> {
  const r = await fetch(`${portalBase(storeId)}/active-shift`, {
    headers: { "x-portal-token": token },
  });
  if (!r.ok) return null;
  return r.json();
}

async function apiMyShifts(storeId: string, token: string): Promise<ShiftRow[]> {
  const r = await fetch(`${portalBase(storeId)}/my-shifts`, {
    headers: { "x-portal-token": token },
  });
  if (!r.ok) return [];
  return r.json();
}

async function apiClockIn(storeId: string, token: string): Promise<ShiftRow> {
  const r = await fetch(`${portalBase(storeId)}/clock-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-portal-token": token },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Clock-in failed");
  return d;
}

async function apiClockOut(storeId: string, token: string, shiftId: string): Promise<ShiftRow> {
  const r = await fetch(`${portalBase(storeId)}/clock-out/${shiftId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-portal-token": token },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Clock-out failed");
  return d;
}

// ─── Sub-screens ──────────────────────────────────────────────────────────────

/** Shown when no store can be identified. */
function NoStoreScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-amber-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto">
          <MonitorSmartphone size={36} className="text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-stone-800">Employee Portal</h1>
        <p className="text-stone-500 text-sm leading-relaxed">
          Ask your manager to share the portal link or set up this device as a store terminal.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left text-sm space-y-2">
          <p className="font-semibold text-amber-800">How to get access:</p>
          <ul className="text-amber-700 space-y-1 list-disc list-inside">
            <li>Ask your manager for the portal link</li>
            <li>Or have them open the <strong>Employees</strong> page and set up this device</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Location badge shown in the dashboard. */
function LocationBadge({ loc, isDevice }: { loc: LocationStatus; isDevice: boolean }) {
  if (isDevice) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
        <MonitorSmartphone size={11} /> Store Device
      </span>
    );
  }
  if (loc.state === "checking") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-500 animate-pulse">
        <MapPin size={11} /> Checking location…
      </span>
    );
  }
  if (loc.state === "on_site") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <Wifi size={11} /> On-site
        {loc.distance !== null && <span className="opacity-60 ml-0.5">· {Math.round(loc.distance)}m</span>}
      </span>
    );
  }
  if (loc.state === "remote") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
        <WifiOff size={11} /> Remote
        {loc.distance !== null && <span className="opacity-60 ml-0.5">· {Math.round(loc.distance / 1000)}km away</span>}
      </span>
    );
  }
  return null;
}

// ─── Employee dashboard tab: My Schedule ─────────────────────────────────────

function MyScheduleTab({ employeeId }: { employeeId: string }) {
  const shifts = readScheduleForEmployee(employeeId);

  function fmt(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  function fmtDay(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function hoursFromTimes(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return ((eh * 60 + em - sh * 60 - sm) / 60).toFixed(1);
  }

  if (shifts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <CalendarDays size={32} className="text-stone-300 mx-auto mb-3" />
        <p className="text-stone-500 font-medium text-sm">No upcoming shifts</p>
        <p className="text-stone-400 text-xs mt-1">Check back when the schedule is published.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1">Upcoming Shifts</p>
      {shifts.map((s) => (
        <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex flex-col items-center justify-center shrink-0">
            <span className="text-xs font-bold text-amber-700 uppercase">
              {new Date(s.date + "T12:00:00").toLocaleDateString([], { weekday: "short" })}
            </span>
            <span className="text-sm font-black text-amber-800">
              {new Date(s.date + "T12:00:00").getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-stone-800 text-sm">{fmtDay(s.date)}</p>
            <p className="text-xs text-stone-500">{fmt(s.startsAt)} – {fmt(s.endsAt)} · {hoursFromTimes(s.startsAt, s.endsAt)}h</p>
            {s.role && <p className="text-xs text-amber-600 font-medium mt-0.5">{s.role}</p>}
            {s.notes && <p className="text-xs text-stone-400 mt-0.5 truncate">{s.notes}</p>}
          </div>
          {s.status === "published" && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Published</span>
          )}
          {s.status === "acknowledged" && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Confirmed</span>
          )}
          {s.status === "draft" && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">Draft</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Employee dashboard tab: Time Off ─────────────────────────────────────────

function MyTimeOffTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<TimeOffType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reload() { setRequests(listRequestsByEmployee(employeeId)); }
  useEffect(reload, [employeeId]);

  function today() { return new Date().toISOString().slice(0, 10); }

  async function handleSubmit() {
    if (!startDate || !endDate) { setError("Please fill in dates."); return; }
    if (endDate < startDate) { setError("End date must be on or after start date."); return; }
    setSaving(true);
    try {
      createRequest({ employeeId, employeeName, type, startDate, endDate, reason });
      setShowForm(false);
      setType("vacation"); setStartDate(""); setEndDate(""); setReason(""); setError("");
      reload();
    } finally { setSaving(false); }
  }

  function handleCancel(id: string) {
    cancelRequest(id, employeeId);
    reload();
  }

  const STATUS_STYLES: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-700",
    approved:  "bg-emerald-100 text-emerald-700",
    denied:    "bg-red-100 text-red-700",
    cancelled: "bg-stone-100 text-stone-500",
  };

  const TYPE_OPTIONS: { value: TimeOffType; label: string }[] = [
    { value: "vacation", label: "Vacation" },
    { value: "sick",     label: "Sick Leave" },
    { value: "personal", label: "Personal" },
    { value: "unpaid",   label: "Unpaid" },
    { value: "other",    label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Time Off Requests</p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-3 py-1.5 transition-colors"
          >
            + New Request
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 border border-amber-200">
          <p className="font-bold text-stone-800 text-sm">Request Time Off</p>

          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1">Type</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setType(o.value)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border-2 transition-colors ${
                    type === o.value ? "bg-amber-500 text-white border-amber-500" : "border-stone-200 text-stone-600 hover:border-amber-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">Start Date</label>
              <input type="date" min={today()} value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">End Date</label>
              <input type="date" min={startDate || today()} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1">Reason (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="Any details your manager should know…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50 transition-colors">
              {saving ? "Submitting…" : "Submit Request"}
            </button>
            <button onClick={() => { setShowForm(false); setError(""); }}
              className="px-4 text-sm text-stone-500 hover:text-stone-700 font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}

      {requests.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <Plane size={32} className="text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 font-medium text-sm">No time-off requests</p>
          <p className="text-stone-400 text-xs mt-1">Tap "New Request" to submit one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-800 text-sm capitalize">{r.type}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {r.startDate} → {r.endDate} · {r.totalDays} business day{r.totalDays !== 1 ? "s" : ""}
                  </p>
                  {r.reason && <p className="text-xs text-stone-400 mt-1 italic">{r.reason}</p>}
                  {r.reviewNote && (
                    <p className="text-xs mt-1 font-medium text-stone-600">
                      Manager note: {r.reviewNote}
                    </p>
                  )}
                </div>
                {r.status === "pending" && (
                  <button onClick={() => handleCancel(r.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold shrink-0">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Employee dashboard tab: Announcements ────────────────────────────────────

function MyAnnouncementsTab({ employeeId }: { employeeId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  function reload() { setAnnouncements(listForEmployee(employeeId)); }
  useEffect(reload, [employeeId]);

  function handleRead(id: string) {
    markRead(id, employeeId);
    setExpanded(id);
    reload();
  }

  const PRIORITY_STYLES = {
    info:    { bg: "bg-blue-50 border-blue-200",   icon: <Info size={14} className="text-blue-500" />,    badge: "bg-blue-100 text-blue-700" },
    warning: { bg: "bg-amber-50 border-amber-200", icon: <AlertTriangle size={14} className="text-amber-500" />, badge: "bg-amber-100 text-amber-700" },
    urgent:  { bg: "bg-red-50 border-red-200",     icon: <AlertTriangle size={14} className="text-red-600" />,   badge: "bg-red-100 text-red-700" },
  };

  if (announcements.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
        <Megaphone size={32} className="text-stone-300 mx-auto mb-3" />
        <p className="text-stone-500 font-medium text-sm">No announcements</p>
        <p className="text-stone-400 text-xs mt-1">Your manager hasn't posted anything yet.</p>
      </div>
    );
  }

  const unread = announcements.filter((a) => !a.readByEmployeeIds.includes(employeeId));
  const read   = announcements.filter((a) =>  a.readByEmployeeIds.includes(employeeId));

  function AnnCard({ ann }: { ann: Announcement }) {
    const isRead = ann.readByEmployeeIds.includes(employeeId);
    const p = PRIORITY_STYLES[ann.priority];
    const open = expanded === ann.id;
    return (
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${p.bg}`}>
        <button
          onClick={() => { if (!isRead) handleRead(ann.id); setExpanded(open ? null : ann.id); }}
          className="w-full flex items-start gap-3 p-4 text-left"
        >
          <div className="mt-0.5 shrink-0">{p.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-800 text-sm leading-tight">{ann.title}</span>
              {!isRead && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              )}
              {ann.pinned && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600">Pinned</span>
              )}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${p.badge} capitalize`}>{ann.priority}</span>
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              {new Date(ann.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
            </p>
            {!open && <p className="text-xs text-stone-600 mt-1 line-clamp-2">{ann.body}</p>}
          </div>
          {open ? <ChevronUp size={16} className="text-stone-400 shrink-0 mt-1" /> : <ChevronDown size={16} className="text-stone-400 shrink-0 mt-1" />}
        </button>
        {open && (
          <div className="px-4 pb-4 pt-0">
            <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{ann.body}</p>
            {isRead && (
              <div className="flex items-center gap-1 mt-3 text-xs text-stone-400">
                <CheckCircle2 size={12} className="text-emerald-500" /> Read
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unread.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1">New ({unread.length})</p>
          {unread.map((a) => <AnnCard key={a.id} ann={a} />)}
        </div>
      )}
      {read.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1">Earlier</p>
          {read.map((a) => <AnnCard key={a.id} ann={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeePortalPage() {
  // ── Store identification ──────────────────────────────────────────────────

  const [storeId, setStoreId] = useState<string | null>(() => {
    // URL param always wins — shared links must point to the right store
    const params = new URLSearchParams(window.location.search);
    const urlStore = params.get("store");
    if (urlStore) return urlStore;
    // Fall back to localStorage for dedicated store-device mode
    return localStorage.getItem(STORE_DEVICE_KEY);
  });

  const isDeviceMode = Boolean(storeId && localStorage.getItem(STORE_DEVICE_KEY) === storeId);

  // ── Store data ────────────────────────────────────────────────────────────

  const [storeInfo,    setStoreInfo]    = useState<StoreInfo | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError,   setStoreError]   = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    setStoreLoading(true);
    apiGetInfo(storeId)
      .then(setStoreInfo)
      .catch(e => setStoreError((e as Error).message))
      .finally(() => setStoreLoading(false));
  }, [storeId]);

  // ── Location ──────────────────────────────────────────────────────────────

  const [loc, setLoc] = useState<LocationStatus>({ state: "idle", distance: null });

  const checkLocation = useCallback(() => {
    if (isDeviceMode || !storeInfo?.storeLatitude || !storeInfo?.storeLongitude) return;
    if (!navigator.geolocation) { setLoc({ state: "unavailable", distance: null }); return; }
    setLoc({ state: "checking", distance: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineM(
          pos.coords.latitude, pos.coords.longitude,
          storeInfo.storeLatitude!, storeInfo.storeLongitude!,
        );
        setLoc({ state: d <= ON_SITE_METERS ? "on_site" : "remote", distance: d });
      },
      () => setLoc({ state: "unavailable", distance: null }),
      { timeout: 8000, maximumAge: 60_000 },
    );
  }, [isDeviceMode, storeInfo]);

  // ── Session ───────────────────────────────────────────────────────────────

  const [identity,      setIdentity]      = useState<Identity | null>(null);
  const [portalToken,   setPortalToken]   = useState<string | null>(null);
  const [activeShift,   setActiveShift]   = useState<ShiftRow | null>(null);
  const [shifts,        setShifts]        = useState<ShiftRow[]>([]);
  const [clockLoading,  setClockLoading]  = useState(false);

  // ── PIN entry ─────────────────────────────────────────────────────────────

  const [selectedEmp,  setSelectedEmp]  = useState<{ id: string; name: string; role: string } | null>(null);
  const [pin,          setPin]          = useState("");
  const [pinError,     setPinError]     = useState("");
  const [pinLoading,   setPinLoading]   = useState(false);
  const [showAllEmps,  setShowAllEmps]  = useState(false);
  const [dashTab,      setDashTab]      = useState<"home" | "schedule" | "timeoff" | "announcements">("home");

  function resetSession() {
    setIdentity(null);
    setPortalToken(null);
    setActiveShift(null);
    setShifts([]);
    setSelectedEmp(null);
    setPin("");
    setPinError("");
    setLoc({ state: "idle", distance: null });
    setDashTab("home");
  }

  async function loadDashboard(token: string) {
    const [active, hist] = await Promise.all([
      apiActiveShift(storeId!, token),
      apiMyShifts(storeId!, token),
    ]);
    setActiveShift(active);
    setShifts(hist);
  }

  async function handlePinSubmit() {
    if (pin.length !== 4 || !storeId) return;
    setPinLoading(true);
    setPinError("");
    try {
      const { token, identity: ident } = await apiVerifyPin(storeId, pin);
      setPortalToken(token);
      setIdentity(ident);
      if (!ident.isManager) await loadDashboard(token);
      checkLocation();
    } catch (e) {
      setPinError((e as Error).message);
      setPin("");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleClockIn() {
    if (!storeId || !portalToken) return;
    setClockLoading(true);
    try {
      const shift = await apiClockIn(storeId, portalToken);
      setActiveShift(shift);
      setShifts(prev => [shift, ...prev]);
    } catch (e) { alert((e as Error).message); }
    finally { setClockLoading(false); }
  }

  async function handleClockOut() {
    if (!storeId || !portalToken || !activeShift) return;
    setClockLoading(true);
    try {
      const updated = await apiClockOut(storeId, portalToken, activeShift.id);
      setActiveShift(null);
      setShifts(prev => prev.map(s => s.id === updated.id ? updated : s));
    } catch (e) { alert((e as Error).message); }
    finally { setClockLoading(false); }
  }

  const elapsed = useTimer(activeShift?.shiftStart ?? null);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (!storeId) return <NoStoreScreen />;

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-stone-100 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
            <User size={24} className="text-white" />
          </div>
          <p className="text-sm text-stone-500">Loading store…</p>
        </div>
      </div>
    );
  }

  if (storeError || !storeInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-stone-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-red-600 font-medium">Could not load store</p>
          <p className="text-stone-500 text-sm">{storeError ?? "Unknown error"}</p>
          <button onClick={() => window.location.reload()} className="text-amber-600 text-sm underline">Retry</button>
        </div>
      </div>
    );
  }

  // ── Dashboard (logged in) ─────────────────────────────────────────────────

  if (identity) {
    const perms = identity.permissions;
    const visibleModules = perms === null
      ? MODULE_CONFIG                                             // manager → all
      : MODULE_CONFIG.filter(m => perms[m.key]);                 // employee → permitted only

    const weeklyHours = shifts
      .filter(s => s.shiftEnd && new Date(s.shiftStart) >= new Date(Date.now() - 7 * 86_400_000))
      .reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);

    const totalHours = shifts
      .filter(s => s.shiftEnd)
      .reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);

    const annUnread = identity.id ? getUnreadCount(identity.id) : 0;

    type DashTab = "home" | "schedule" | "timeoff" | "announcements";
    const TABS: { key: DashTab; label: string; icon: React.ReactNode; badge?: number }[] = [
      { key: "home",          label: "Home",          icon: <Clock size={16} /> },
      { key: "schedule",      label: "Schedule",      icon: <CalendarDays size={16} /> },
      { key: "timeoff",       label: "Time Off",      icon: <Plane size={16} /> },
      { key: "announcements", label: "Messages",      icon: <Megaphone size={16} />, badge: annUnread },
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
        {/* Header */}
        <div className="bg-amber-500 text-white px-4 py-4 shadow">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                {identity.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold leading-tight">{identity.name}</div>
                <div className="text-xs text-amber-100 flex items-center gap-1.5 flex-wrap">
                  <span>{identity.role || (identity.isManager ? "Manager" : "Staff")}</span>
                  <span>·</span>
                  <span>{storeInfo.storeName}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LocationBadge loc={loc} isDevice={isDeviceMode} />
              <button onClick={resetSession} className="text-amber-100 hover:text-white text-xs font-medium ml-2">
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar — employees only */}
        {!identity.isManager && (
          <div className="bg-white border-b border-stone-100 shadow-sm sticky top-0 z-10">
            <div className="max-w-xl mx-auto flex">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDashTab(tab.key)}
                  className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-semibold transition-colors ${
                    dashTab === tab.key
                      ? "text-amber-600 border-b-2 border-amber-500"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge ? (
                    <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-xl mx-auto p-4 space-y-4 pb-10">
          {/* Manager banner */}
          {identity.isManager && (
            <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-4 flex items-center gap-3">
              <Shield size={20} className="text-amber-500 shrink-0" />
              <div>
                <p className="font-semibold text-stone-800 text-sm">Manager Access</p>
                <p className="text-xs text-stone-500">Full store access via portal. For advanced settings, use the manager dashboard.</p>
              </div>
            </div>
          )}

          {/* ── Home tab ─────────────────────────────────────────────── */}
          {(identity.isManager || dashTab === "home") && (
            <>
              {/* Clock in/out — employees only */}
              {!identity.isManager && (
                <div className={`rounded-2xl p-6 text-center shadow-lg ${activeShift ? "bg-green-500 text-white" : "bg-white text-stone-800"}`}>
                  {activeShift ? (
                    <>
                      <div className="text-sm font-semibold text-green-100 mb-1">Currently Working</div>
                      <div className="text-5xl font-mono font-bold tabular-nums mb-1">{formatElapsed(elapsed)}</div>
                      <div className="text-sm text-green-100 mb-5">
                        Started {fmtTime(activeShift.shiftStart)} · {fmtDate(activeShift.shiftStart)}
                      </div>
                      <button
                        onClick={handleClockOut}
                        disabled={clockLoading}
                        className="flex items-center gap-2 mx-auto bg-white text-green-600 font-bold rounded-xl px-8 py-3.5 text-lg hover:bg-green-50 disabled:opacity-50 transition-colors shadow"
                      >
                        <LogOut size={20} /> Clock Out
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Clock size={28} className="text-amber-500" />
                      </div>
                      <div className="text-lg font-bold mb-1">Not clocked in</div>
                      <div className="text-sm text-stone-400 mb-5">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </div>
                      {!isDeviceMode && loc.state === "remote" ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                          <p className="font-semibold">You appear to be away from the store</p>
                          <p className="text-xs mt-0.5 text-orange-500">Clock-in is available when you're on-site or on a store device.</p>
                        </div>
                      ) : (
                        <button
                          onClick={handleClockIn}
                          disabled={clockLoading || (!isDeviceMode && loc.state === "checking")}
                          className="flex items-center gap-2 mx-auto bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl px-8 py-3.5 text-lg disabled:opacity-50 transition-colors shadow"
                        >
                          <LogIn size={20} /> Clock In
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Stats */}
              {!identity.isManager && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold mb-1">
                      <Timer size={11} /> THIS WEEK
                    </div>
                    <div className="text-2xl font-bold text-stone-800">{weeklyHours.toFixed(1)}h</div>
                  </div>
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold mb-1">
                      <Calendar size={11} /> ALL TIME (30d)
                    </div>
                    <div className="text-2xl font-bold text-stone-800">{totalHours.toFixed(1)}h</div>
                  </div>
                </div>
              )}

              {/* Module access */}
              {visibleModules.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <h3 className="font-bold text-stone-800">Your Tools</h3>
                    {!isDeviceMode && (
                      <p className="text-xs text-stone-400 mt-0.5">Opens in the store management app — requires an active manager session on this device.</p>
                    )}
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-2">
                    {visibleModules.map(mod => {
                      const Icon = mod.icon;
                      return (
                        <button
                          key={mod.key}
                          onClick={() => {
                            if (storeId) sessionStorage.setItem("sh_active_store_id", storeId);
                            if (perms !== null) {
                              const allowed = Object.entries(perms).filter(([, v]) => v).map(([k]) => k);
                              sessionStorage.setItem("sh_employee_permissions", JSON.stringify(allowed));
                            } else {
                              sessionStorage.removeItem("sh_employee_permissions");
                            }
                            // Force a full page load so Layout re-mounts and reads the updated sessionStorage.
                            window.location.href = mod.href;
                          }}
                          className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 border-transparent hover:border-amber-200 hover:bg-amber-50 transition-all"
                        >
                          <div className={`w-11 h-11 ${mod.bg} rounded-xl flex items-center justify-center`}>
                            <Icon size={20} className={mod.color} />
                          </div>
                          <span className="text-xs font-semibold text-stone-700 text-center leading-tight">{mod.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Shift history */}
              {!identity.isManager && shifts.filter(s => s.shiftEnd).length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <h3 className="font-bold text-stone-800">Recent Shifts</h3>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {shifts.filter(s => s.shiftEnd).slice(0, 10).map(s => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div>
                          <span className="font-medium text-stone-700">{fmtDate(s.shiftStart)}</span>
                          <span className="text-stone-400 ml-2">{fmtTime(s.shiftStart)} – {fmtTime(s.shiftEnd!)}</span>
                        </div>
                        {s.hoursWorked !== null && (
                          <span className="font-semibold text-amber-600">{s.hoursWorked.toFixed(1)}h</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Account linking placeholder */}
              {!identity.isManager && (
                <div className="bg-white rounded-2xl shadow-sm p-4 flex items-start gap-3">
                  <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                    <Link2 size={16} className="text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-stone-800">Link a full account</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Connect your email & password to access the store from your own device. Coming soon.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Schedule tab ─────────────────────────────────────────── */}
          {!identity.isManager && dashTab === "schedule" && identity.id && (
            <MyScheduleTab employeeId={identity.id} />
          )}

          {/* ── Time Off tab ─────────────────────────────────────────── */}
          {!identity.isManager && dashTab === "timeoff" && identity.id && (
            <MyTimeOffTab employeeId={identity.id} employeeName={identity.name} />
          )}

          {/* ── Announcements tab ────────────────────────────────────── */}
          {!identity.isManager && dashTab === "announcements" && identity.id && (
            <MyAnnouncementsTab employeeId={identity.id} />
          )}
        </div>
      </div>
    );
  }

  // ── PIN Entry screen ──────────────────────────────────────────────────────

  const displayedEmps = showAllEmps ? storeInfo.employees : storeInfo.employees.slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Store header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <User size={30} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-stone-800">{storeInfo.storeName}</h1>
          {storeInfo.storeCity && <p className="text-sm text-stone-400">{storeInfo.storeCity}</p>}
          {isDeviceMode && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              <MonitorSmartphone size={11} /> Store Device
            </span>
          )}
        </div>

        {/* Employee selector or direct PIN */}
        {!selectedEmp ? (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {storeInfo.employees.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-sm">
                No employees set up yet.
                <br />Ask your manager to add staff in the Employees page.
              </div>
            ) : (
              <>
                <div className="px-4 pt-4 pb-2 border-b border-stone-100">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Select your name</p>
                </div>
                <div className="divide-y divide-stone-50 max-h-72 overflow-y-auto">
                  {displayedEmps.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => { setSelectedEmp(emp); setPin(""); setPinError(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-amber-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-stone-800 text-sm">{emp.name}</div>
                        {emp.role && <div className="text-xs text-stone-400">{emp.role}</div>}
                      </div>
                    </button>
                  ))}
                </div>
                {storeInfo.employees.length > 8 && !showAllEmps && (
                  <button
                    onClick={() => setShowAllEmps(true)}
                    className="w-full py-3 text-xs text-amber-600 font-semibold border-t border-stone-100 hover:bg-amber-50 transition-colors"
                  >
                    Show all {storeInfo.employees.length} employees
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          // PIN pad for selected employee
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setSelectedEmp(null); setPin(""); setPinError(""); }}
                className="p-1 text-stone-400 hover:text-stone-600 rounded-lg"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center font-bold text-amber-700 text-sm">
                  {selectedEmp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-stone-800 text-sm">{selectedEmp.name}</div>
                  <div className="text-xs text-stone-400">{selectedEmp.role || "Staff"}</div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-2 text-center">Enter your 4-digit PIN</label>
              <div className="w-full border-2 border-stone-200 rounded-xl px-4 py-4 text-center text-3xl tracking-[0.6em] font-mono text-stone-800 focus:border-amber-400 outline-none bg-stone-50 select-none">
                {pin.length === 0 ? "·  ·  ·  ·" : "•".repeat(pin.length).padEnd(4, "·").replace(/·/g, " ·").trim()}
              </div>
              {pinError && <p className="text-red-500 text-xs text-center mt-2">{pinError}</p>}
            </div>

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, i) => (
                <button
                  key={i}
                  disabled={key === "" || pinLoading}
                  onClick={() => {
                    if (key === "⌫") { setPin(p => p.slice(0, -1)); setPinError(""); }
                    else if (key && pin.length < 4) {
                      const next = pin + key;
                      setPin(next);
                      setPinError("");
                      if (next.length === 4) {
                        // auto-submit
                        setTimeout(async () => {
                          setPinLoading(true);
                          setPinError("");
                          try {
                            const { token, identity: ident } = await apiVerifyPin(storeId!, next);
                            setPortalToken(token);
                            setIdentity(ident);
                            if (!ident.isManager) await loadDashboard(token);
                            checkLocation();
                          } catch (e) {
                            setPinError((e as Error).message);
                            setPin("");
                          } finally {
                            setPinLoading(false);
                          }
                        }, 80);
                      }
                    }
                  }}
                  className={`h-14 rounded-xl text-lg font-semibold transition-all active:scale-95 ${
                    key === "" ? "opacity-0 pointer-events-none" :
                    pinLoading ? "bg-stone-100 text-stone-300 cursor-not-allowed" :
                    "bg-stone-100 hover:bg-amber-100 text-stone-700"
                  }`}
                >
                  {pinLoading && key === "⌫" ? "…" : key}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-stone-400">
          Powered by <span className="font-semibold text-amber-600">StoreHub</span>
        </p>
      </div>
    </div>
  );
}
