import { useState, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Users, Clock, X, Trash2,
  CheckCircle, CalendarDays, AlertCircle,
} from "lucide-react";
import { getEmployees, type Employee } from "../services/dataService";
import { PermissionGate } from "../components/PermissionGate";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduledShift {
  id:           string;
  employeeId:   string;
  employeeName: string;
  date:         string; // YYYY-MM-DD
  startsAt:     string; // ISO datetime
  endsAt:       string; // ISO datetime
  role:         string;
  notes:        string;
  status:       "draft" | "published" | "acknowledged" | "cancelled";
  weekKey:      string; // YYYY-Www for quick publish-week filtering
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const SCHEDULE_KEY = "storehub_schedule_v2";

function uid(): string {
  return `sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function readSchedules(): ScheduledShift[] {
  try { return JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "[]"); } catch { return []; }
}

function writeSchedules(data: ScheduledShift[]): void {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
}

function getSchedules(): ScheduledShift[] {
  return readSchedules().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function createShift(data: Omit<ScheduledShift, "id" | "weekKey" | "status">): ScheduledShift {
  const shift: ScheduledShift = {
    ...data,
    id: uid(),
    status: "draft",
    weekKey: isoWeekKey(new Date(data.date)),
  };
  writeSchedules([...readSchedules(), shift]);
  return shift;
}

function updateShift(id: string, patch: Partial<ScheduledShift>): void {
  const all = readSchedules();
  const idx = all.findIndex((s) => s.id === id);
  if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; writeSchedules(all); }
}

function deleteShift(id: string): void {
  writeSchedules(readSchedules().filter((s) => s.id !== id));
}

function publishWeek(weekKey: string): void {
  const all = readSchedules().map((s) =>
    s.weekKey === weekKey && s.status === "draft" ? { ...s, status: "published" as const } : s
  );
  writeSchedules(all);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

function localDateTimeInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function hoursWorked(startsAt: string, endsAt: string): number {
  return Math.max(0, (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000);
}

// ─── Status styles ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ScheduledShift["status"], string> = {
  draft:        "bg-stone-50 text-stone-600 border-stone-200",
  published:    "bg-blue-50 text-blue-700 border-blue-200",
  acknowledged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled:    "bg-red-50 text-red-500 border-red-200",
};

// ─── Add/Edit Shift Modal ─────────────────────────────────────────────────────

interface DraftShift {
  employeeId: string;
  date:       string;
  startsAt:   string;
  endsAt:     string;
  role:       string;
  notes:      string;
}

function AddShiftModal({
  employees,
  onClose,
  onSave,
  initial,
}: {
  employees: Employee[];
  onClose: () => void;
  onSave:  (draft: DraftShift) => void;
  initial?: Partial<DraftShift>;
}) {
  const defaultDate = initial?.date ?? isoDate(new Date());
  const [draft, setDraft] = useState<DraftShift>({
    employeeId: initial?.employeeId ?? "",
    date:       defaultDate,
    startsAt:   initial?.startsAt   ?? localDateTimeInput(new Date(defaultDate + "T09:00")),
    endsAt:     initial?.endsAt     ?? localDateTimeInput(new Date(defaultDate + "T17:00")),
    role:       initial?.role       ?? "",
    notes:      initial?.notes      ?? "",
  });
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.employeeId) { setError("Select an employee."); return; }
    if (new Date(draft.endsAt) <= new Date(draft.startsAt)) {
      setError("End time must be after start time.");
      return;
    }
    onSave(draft);
    onClose();
  }

  const hrs = hoursWorked(draft.startsAt, draft.endsAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 className="font-semibold text-stone-900">Add Shift</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100">
            <X size={16} className="text-stone-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Employee</label>
            <select
              value={draft.employeeId}
              onChange={(e) => setDraft((d) => ({ ...d, employeeId: e.target.value }))}
              required
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Select employee…</option>
              {employees.map((em) => (
                <option key={em.id} value={em.id}>{em.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Date</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => {
                const d = e.target.value;
                setDraft((prev) => ({
                  ...prev,
                  date:     d,
                  startsAt: `${d}T${prev.startsAt.slice(11)}`,
                  endsAt:   `${d}T${prev.endsAt.slice(11)}`,
                }));
              }}
              required
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Start</label>
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                required
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">End</label>
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                required
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {draft.startsAt && draft.endsAt && hrs > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              Duration: {hrs.toFixed(1)} hours
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Role / Position</label>
            <input
              type="text"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              placeholder="e.g. Cashier, Stocker"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Notes</label>
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Optional notes for this shift"
              className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Save shift
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Schedule Page ────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [weekStart,  setWeekStart]  = useState(() => startOfWeek(new Date()));
  const [schedules,  setSchedules]  = useState<ScheduledShift[]>([]);
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [initialDay, setInitialDay] = useState<string | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [publishedMsg, setPublishedMsg] = useState(false);

  const weekDays   = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekKey    = isoWeekKey(weekStart);
  const weekShifts = schedules.filter((s) => s.weekKey === weekKey);

  function refresh() {
    setSchedules(getSchedules());
  }

  useEffect(() => {
    setLoading(true);
    getEmployees()
      .then(setEmployees)
      .finally(() => { refresh(); setLoading(false); });
  }, []);

  function handleSave(draft: DraftShift) {
    const emp = employees.find((e) => e.id === draft.employeeId);
    createShift({
      employeeId:   draft.employeeId,
      employeeName: emp?.name ?? "Unknown",
      date:         draft.date,
      startsAt:     new Date(draft.startsAt).toISOString(),
      endsAt:       new Date(draft.endsAt).toISOString(),
      role:         draft.role,
      notes:        draft.notes,
    });
    refresh();
  }

  function handleDelete(id: string) {
    deleteShift(id);
    setDeleteConfirm(null);
    refresh();
  }

  function handlePublish() {
    publishWeek(weekKey);
    refresh();
    setPublishedMsg(true);
    setTimeout(() => setPublishedMsg(false), 3000);
  }

  function shiftsForDay(day: Date): ScheduledShift[] {
    const d = isoDate(day);
    return weekShifts.filter((s) => s.date === d);
  }

  // Summary
  const totalHours   = weekShifts.reduce((s, sh) => s + hoursWorked(sh.startsAt, sh.endsAt), 0);
  const uniqueEmps   = new Set(weekShifts.map((s) => s.employeeId)).size;
  const draftCount   = weekShifts.filter((s) => s.status === "draft").length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Schedule</h1>
          <p className="mt-0.5 text-sm text-stone-400">
            Week of {weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Week nav */}
          <div className="flex items-center overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="p-2.5 hover:bg-stone-50 transition-colors"
            >
              <ChevronLeft size={16} className="text-stone-500" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="border-x border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="p-2.5 hover:bg-stone-50 transition-colors"
            >
              <ChevronRight size={16} className="text-stone-500" />
            </button>
          </div>

          <PermissionGate require="schedule.create">
            {draftCount > 0 && (
              <button
                onClick={handlePublish}
                className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors ${publishedMsg ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"}`}
              >
                <CheckCircle size={14} />
                {publishedMsg ? "Published!" : `Publish week (${draftCount} draft${draftCount > 1 ? "s" : ""})`}
              </button>
            )}
            <button
              onClick={() => { setInitialDay(undefined); setShowModal(true); }}
              className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
            >
              <Plus size={16} /> Add shift
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Shifts this week", value: weekShifts.length, icon: <CalendarDays size={16} className="text-amber-500" />, color: "bg-amber-50" },
          { label: "Employees scheduled", value: uniqueEmps, icon: <Users size={16} className="text-indigo-500" />, color: "bg-indigo-50" },
          { label: "Total hours", value: `${totalHours.toFixed(1)}h`, icon: <Clock size={16} className="text-emerald-500" />, color: "bg-emerald-50" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className={`rounded-[20px] ${color} p-4`}>
            <div className="mb-2">{icon}</div>
            <p className="text-xl font-bold text-stone-900">{value}</p>
            <p className="text-xs text-stone-500">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        </div>
      ) : (
        /* Weekly grid */
        <div className="overflow-hidden rounded-[20px] border border-stone-200 bg-white">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-stone-100">
            {weekDays.map((day, i) => {
              const today = isoDate(day) === isoDate(new Date());
              return (
                <div
                  key={i}
                  className={`cursor-pointer p-3 text-center border-r border-stone-100 last:border-r-0 transition-colors hover:bg-amber-50 ${today ? "bg-amber-50" : ""}`}
                  onClick={() => {
                    setInitialDay(isoDate(day));
                    setShowModal(true);
                  }}
                >
                  <div className="text-xs font-medium uppercase text-stone-400">{DAYS[day.getDay()]}</div>
                  <div className={`mt-0.5 text-lg font-bold ${today ? "text-amber-600" : "text-stone-800"}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shift cells */}
          <div className="grid grid-cols-7 min-h-48">
            {weekDays.map((day, i) => {
              const dayShifts = shiftsForDay(day);
              return (
                <div key={i} className="min-h-32 space-y-1 border-r border-stone-100 last:border-r-0 p-2">
                  {dayShifts.map((s) => {
                    const hrs = hoursWorked(s.startsAt, s.endsAt);
                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border px-2 py-1.5 text-xs ${STATUS_STYLES[s.status]}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold truncate leading-tight">{s.employeeName}</span>
                          <PermissionGate require="schedule.delete">
                            {deleteConfirm === s.id ? (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => handleDelete(s.id)}
                                  className="rounded text-red-500 hover:text-red-700 font-bold text-[10px]"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="text-stone-400 text-[10px]"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(s.id)}
                                className="shrink-0 text-stone-300 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </PermissionGate>
                        </div>
                        <div className="opacity-75 mt-0.5 leading-tight">
                          {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                          <span className="ml-1 text-[10px] opacity-60">({hrs.toFixed(1)}h)</span>
                        </div>
                        {s.role && <div className="opacity-60 truncate mt-0.5">{s.role}</div>}
                        <div className={`mt-1 inline-block rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
                          s.status === "published"    ? "bg-blue-100 text-blue-600" :
                          s.status === "acknowledged" ? "bg-emerald-100 text-emerald-600" :
                          s.status === "cancelled"    ? "bg-red-100 text-red-500" :
                          "bg-stone-100 text-stone-500"
                        }`}>
                          {s.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weekShifts.length === 0 && !loading && (
        <div className="py-12 text-center text-stone-400">
          <CalendarDays size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-stone-500">No shifts this week</p>
          <p className="mt-1 text-sm">Click any day column or Add Shift to get started.</p>
        </div>
      )}

      {showModal && (
        <AddShiftModal
          employees={employees}
          onClose={() => { setShowModal(false); setInitialDay(undefined); }}
          onSave={handleSave}
          initial={initialDay ? { date: initialDay } : undefined}
        />
      )}
    </div>
  );
}
