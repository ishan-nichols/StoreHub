import { useEffect, useState, useRef } from "react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getShifts,
  createShift,
  getActiveShift,
  clockIn,
  clockOut,
  createDailyPayRecord,
  getPayrollReport,
} from "../services/dataService";
import type { Employee, Shift, InsertEmployee, InsertShift, DailyPayRecord, PayrollReportEntry } from "../schemas";
import { formatDate, formatTime, calcHoursWorked, now, getCurrencySymbol } from "../utils";
import CurrencyInput from "../components/CurrencyInput";
import { Plus, Trash2, X, Clock, UserPlus, LogIn, LogOut, Timer, Calendar, BarChart2, Sparkles, Loader2, ShieldCheck, Copy, Check, ExternalLink, Pencil } from "lucide-react";

interface EmployeePermissions {
  pos: boolean;
  inventory: boolean;
  sales: boolean;
  expenses: boolean;
  reports: boolean;
  suppliers: boolean;
  customers: boolean;
  cashflow: boolean;
  compliance: boolean;
  tax: boolean;
  employees: boolean;
  settings: boolean;
}

const PERMISSION_LABELS: Record<string, string> = {
  pos: "POS / Checkout",
  inventory: "Inventory",
  sales: "Sales & Orders",
  expenses: "Expenses",
  reports: "Reports",
  suppliers: "Suppliers",
  customers: "Customers",
  cashflow: "Cash Flow",
  compliance: "Compliance",
  tax: "Tax Center",
  employees: "Employee Mgmt",
  settings: "Settings",
};

const PERMISSION_KEYS = ["pos","inventory","sales","expenses","reports","suppliers","customers","cashflow","compliance","tax","employees","settings"] as const;

const DEFAULT_PERMISSIONS: EmployeePermissions = {
  pos: true, inventory: false, sales: false, expenses: false,
  reports: false, suppliers: false, customers: true, cashflow: false,
  compliance: false, tax: false, employees: false, settings: false,
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

function useClockTimer(shiftStart: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!shiftStart) { setElapsed(0); return; }
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(shiftStart).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [shiftStart]);
  return elapsed;
}

const PAYROLL_TYPE_LABELS: Record<string, string> = {
  hourly: "Hourly",
  daily:  "Daily",
  salary: "Salary",
};

const PAYROLL_TYPE_COLORS: Record<string, string> = {
  hourly: "bg-amber-100 text-amber-700",
  daily:  "bg-blue-100 text-blue-700",
  salary: "bg-purple-100 text-purple-700",
};

interface EmployeeCardProps {
  emp: Employee;
  shifts: Shift[];
  currencySymbol: string;
  onLogShift: (emp: Employee) => void;
  onRecordDay: (emp: Employee) => void;
  onDelete: (id: string) => void;
  onEdit: (emp: Employee) => void;
  onClockIn: (emp: Employee) => Promise<void>;
  onClockOut: (shiftId: string) => Promise<void>;
}

function EmployeeCard({ emp, shifts, currencySymbol, onLogShift, onRecordDay, onDelete, onEdit, onClockIn, onClockOut }: EmployeeCardProps) {
  const [clockLoading, setClockLoading] = useState(false);
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const payrollType = emp.payrollType ?? "hourly";
  const activeShift = payrollType === "hourly" ? shifts.find((s) => s.employeeId === emp.id && s.shiftEnd === null) : undefined;
  const elapsed = useClockTimer(activeShift?.shiftStart ?? null);
  const empShifts = shifts.filter((s) => s.employeeId === emp.id && s.shiftEnd !== null).slice(0, 5);
  const totalHours = shifts
    .filter((s) => s.employeeId === emp.id && s.hoursWorked !== null)
    .reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
  const weeklyPay = payrollType === "hourly" && emp.hourlyWage > 0 ? (totalHours * emp.hourlyWage).toFixed(2) : null;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 transition-all ${activeShift ? "border-green-300 dark:border-green-700 shadow-green-50 dark:shadow-none shadow-lg" : "border-gray-100 dark:border-gray-700"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${activeShift ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {emp.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 flex-wrap">
              {emp.name}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PAYROLL_TYPE_COLORS[payrollType]}`}>
                {PAYROLL_TYPE_LABELS[payrollType]}
              </span>
              {activeShift && (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  <Timer size={10} /> Clocked In
                </span>
              )}
            </div>
            {emp.role && <div className="text-xs text-gray-500">{emp.role}</div>}
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
              {payrollType === "hourly" && (
                <>
                  <span className="font-semibold text-amber-600">{totalHours.toFixed(1)}h total</span>
                  {emp.hourlyWage > 0 && (
                    <>
                      <span>·</span>
                      <span>{currencySymbol}{emp.hourlyWage.toFixed(2)}/hr</span>
                      {weeklyPay && <span>· Est. {currencySymbol}{weeklyPay} pay</span>}
                    </>
                  )}
                </>
              )}
              {(payrollType === "daily" || payrollType === "salary") && emp.dailyWage > 0 && (
                <span className="font-semibold text-blue-600">{currencySymbol}{Number(emp.dailyWage).toFixed(2)}/day</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {payrollType === "hourly" && (
            <button
              onClick={() => onLogShift(emp)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-semibold transition-colors"
            >
              <Clock size={12} /> Log
            </button>
          )}
          {(payrollType === "daily" || payrollType === "salary") && (
            <button
              onClick={() => onRecordDay(emp)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-semibold transition-colors"
            >
              <Calendar size={12} /> Record Day
            </button>
          )}
          <button
            onClick={() => onEdit(emp)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Edit employee"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(emp.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Clock in/out section — hourly only */}
      {payrollType === "hourly" && (
        activeShift ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-green-600 font-semibold">Currently Working</div>
              <div className="text-xl font-mono font-bold text-green-700 tabular-nums">{formatElapsed(elapsed)}</div>
              <div className="text-xs text-green-500">Started {formatTime(activeShift.shiftStart)}</div>
            </div>
            <button
              onClick={() => { setClockOutLoading(true); void onClockOut(activeShift.id).finally(() => setClockOutLoading(false)); }}
              disabled={clockOutLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {clockOutLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Clock Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setClockLoading(true); void onClockIn(emp).finally(() => setClockLoading(false)); }}
            disabled={clockLoading}
            className="w-full flex items-center justify-center gap-2 mb-3 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {clockLoading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Clock In
          </button>
        )
      )}

      {payrollType === "hourly" && empShifts.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <div className="text-xs font-semibold text-gray-400 mb-2">Recent Completed Shifts</div>
          <div className="space-y-1">
            {empShifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{formatDate(shift.shiftStart)}</span>
                <span>{formatTime(shift.shiftStart)} — {shift.shiftEnd ? formatTime(shift.shiftEnd) : "ongoing"}</span>
                {shift.hoursWorked !== null && (
                  <span className="font-semibold text-amber-600">{shift.hoursWorked.toFixed(1)}h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permission summary */}
      {(() => {
        const perms = (emp as Employee & { permissions?: EmployeePermissions }).permissions;
        if (!perms) return null;
        const enabledCount = PERMISSION_KEYS.filter(k => perms[k]).length;
        const highlights: string[] = [];
        if (perms.pos) highlights.push("POS");
        if (perms.inventory) highlights.push("Inventory");
        if (perms.employees) highlights.push("Employees");
        return (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3 flex items-center gap-2">
            <ShieldCheck size={12} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-400">
              <span className="font-semibold text-gray-600 dark:text-gray-300">{enabledCount}</span> permissions
              {highlights.length > 0 && <> · {highlights.join(", ")}</>}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

function EmployeePortalBanner() {
  const { user, activeStoreId } = useAuth();
  const storeUserId = activeStoreId ?? user?.id;
  const portalUrl = `${window.location.origin}/employee${storeUserId ? `?store=${storeUserId}` : ""}`;
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white text-lg">
            👷
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">Employee Portal</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Share this link with your staff so they can clock in/out and access their tools.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white dark:bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-colors"
          >
            <ExternalLink size={12} /> Open
          </a>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Link</>}
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 dark:bg-black/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
        <span className="text-xs font-mono text-amber-800 dark:text-amber-300 truncate flex-1">{portalUrl}</span>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const { t, profile } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showLogShift, setShowLogShift] = useState(false);
  const [showRecordDay, setShowRecordDay] = useState(false);
  const [showPayrollReport, setShowPayrollReport] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "", jobTitle: "", hourlyWage: 15, dailyWage: 0, payrollType: "hourly" as "hourly" | "daily" | "salary", pin: "", permissions: { ...DEFAULT_PERMISSIONS } });
  const [suggestingPermissions, setSuggestingPermissions] = useState(false);
  const [suggestExplanation, setSuggestExplanation] = useState("");
  const [shiftForm, setShiftForm] = useState<InsertShift>({
    employeeId: "",
    employeeName: "",
    shiftStart: now().slice(0, 16),
    shiftEnd: now().slice(0, 16),
    hoursWorked: null,
  });
  const [recordDayForm, setRecordDayForm] = useState({
    employeeId: "",
    employeeName: "",
    workDate: new Date().toISOString().split("T")[0],
    daysWorked: 1,
    dailyRate: 0,
    note: "",
  });
  const [payrollReport, setPayrollReport] = useState<PayrollReportEntry[]>([]);
  const [payrollRange, setPayrollRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [addEmployeeError, setAddEmployeeError] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", jobTitle: "", hourlyWage: 15, dailyWage: 0, payrollType: "hourly" as "hourly" | "daily" | "salary", pin: "", permissions: { ...DEFAULT_PERMISSIONS } });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const currencySymbol = profile ? getCurrencySymbol(profile.currency) : "$";

  async function load() {
    const [emps, shfts] = await Promise.all([getEmployees(), getShifts()]);
    setEmployees(emps);
    setShifts(shfts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAddEmployee() {
    if (!newEmployee.name.trim()) return;
    setAddEmployeeError(null);
    try {
      await createEmployee({
        name:        newEmployee.name.trim(),
        role:        newEmployee.role.trim(),
        jobTitle:    newEmployee.jobTitle.trim(),
        hourlyWage:  newEmployee.payrollType === "hourly" ? newEmployee.hourlyWage : 0,
        dailyWage:   newEmployee.payrollType !== "hourly" ? newEmployee.dailyWage  : 0,
        payrollType: newEmployee.payrollType,
        pin:         newEmployee.pin || "0000",
        permissions: newEmployee.permissions,
      } as Parameters<typeof createEmployee>[0]);
    } catch (e) {
      setAddEmployeeError((e as Error).message);
    }
    setNewEmployee({ name: "", role: "", jobTitle: "", hourlyWage: 15, dailyWage: 0, payrollType: "hourly", pin: "", permissions: { ...DEFAULT_PERMISSIONS } });
    setSuggestExplanation("");
    setShowAddEmployee(false);
    load();
  }

  function handleOpenEdit(emp: Employee) {
    const perms = (emp.permissions as EmployeePermissions | null) ?? { ...DEFAULT_PERMISSIONS };
    setEditForm({
      name:        emp.name,
      role:        emp.role ?? "",
      jobTitle:    emp.jobTitle ?? "",
      hourlyWage:  emp.hourlyWage ?? 15,
      dailyWage:   Number(emp.dailyWage ?? 0),
      payrollType: (emp.payrollType as "hourly" | "daily" | "salary") ?? "hourly",
      pin:         emp.pin ?? "",
      permissions: { ...DEFAULT_PERMISSIONS, ...perms },
    });
    setEditingEmployee(emp);
  }

  async function handleSaveEdit() {
    if (!editingEmployee || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await updateEmployee(editingEmployee.id, {
        name:        editForm.name.trim(),
        role:        editForm.role.trim(),
        jobTitle:    editForm.jobTitle.trim(),
        hourlyWage:  editForm.payrollType === "hourly" ? editForm.hourlyWage : 0,
        dailyWage:   editForm.payrollType !== "hourly" ? editForm.dailyWage  : 0,
        payrollType: editForm.payrollType,
        pin:         editForm.pin || "0000",
        permissions: editForm.permissions,
      });
      setEditingEmployee(null);
      load();
    } finally {
      setEditSaving(false);
    }
  }

  async function suggestPermissions(jobTitle: string) {
    if (!jobTitle.trim()) return;
    setSuggestingPermissions(true);
    try {
      const res = await fetch("/api/storehub/employees/suggest-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.permissions) {
        setNewEmployee(prev => ({ ...prev, permissions: data.permissions }));
        setSuggestExplanation(data.explanation ?? "");
      }
    } catch (e) {
      console.error("Permission suggest failed", e);
    } finally {
      setSuggestingPermissions(false);
    }
  }

  async function handleDeleteEmployee(id: string) {
    await deleteEmployee(id);
    setDeleteConfirm(null);
    load();
  }

  async function handleClockIn(emp: Employee) {
    // Check local state first (avoids the 200-limit API query missing an old active shift)
    const alreadyActive = shifts.some((s) => s.employeeId === emp.id && s.shiftEnd === null);
    if (alreadyActive) return;
    await clockIn(emp.id, emp.name);
    load();
  }

  async function handleClockOut(shiftId: string) {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    const endTime = new Date().toISOString();

    // Find every active shift for this employee — duplicates included
    const allActive = shifts.filter((s) => s.employeeId === shift.employeeId && s.shiftEnd === null);

    // Immediately clear all of them from UI so the timer stops right away
    setShifts((prev) => prev.map((s) =>
      s.employeeId === shift.employeeId && s.shiftEnd === null ? { ...s, shiftEnd: endTime } : s
    ));

    // Clock out every active shift on the server
    await Promise.all(allActive.map((s) => clockOut(s)));
    await load();
  }

  async function handleLogShift() {
    if (!shiftForm.employeeId) return;
    const hours = shiftForm.shiftEnd ? calcHoursWorked(shiftForm.shiftStart, shiftForm.shiftEnd) : null;
    await createShift({ ...shiftForm, hoursWorked: hours });
    setShowLogShift(false);
    load();
  }

  async function handleRecordDay() {
    if (!recordDayForm.employeeId) return;
    const totalPay = recordDayForm.daysWorked * recordDayForm.dailyRate;
    await createDailyPayRecord({
      employeeId: recordDayForm.employeeId,
      workDate:   recordDayForm.workDate,
      daysWorked: recordDayForm.daysWorked,
      dailyRate:  recordDayForm.dailyRate,
      totalPay,
      note:       recordDayForm.note || undefined,
    });
    setShowRecordDay(false);
  }

  async function handleGeneratePayroll() {
    setPayrollLoading(true);
    const report = await getPayrollReport(payrollRange.start, payrollRange.end);
    setPayrollReport(report);
    setPayrollLoading(false);
  }

  function openLogShift(emp: Employee) {
    const nowStr = new Date().toISOString().slice(0, 16);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setShiftForm({
      employeeId: emp.id,
      employeeName: emp.name,
      shiftStart: twoHoursAgo,
      shiftEnd: nowStr,
      hoursWorked: null,
    });
    setShowLogShift(true);
  }

  function openRecordDay(emp: Employee) {
    setRecordDayForm({
      employeeId: emp.id,
      employeeName: emp.name,
      workDate: new Date().toISOString().split("T")[0],
      daysWorked: 1,
      dailyRate: Number(emp.dailyWage) || 0,
      note: "",
    });
    setShowRecordDay(true);
  }

  const clockedInCount = shifts.filter((s) => s.shiftEnd === null).length;
  const totalGrossPay = payrollReport.reduce((sum, r) => sum + r.estimatedPay, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t.employees.title}</h1>
          {clockedInCount > 0 && (
            <p className="text-sm text-green-600 font-medium mt-0.5">{clockedInCount} employee{clockedInCount !== 1 ? "s" : ""} currently clocked in</p>
          )}
        </div>
        <button
          onClick={() => setShowAddEmployee(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow transition-colors"
        >
          <UserPlus size={16} /> {t.employees.addEmployee}
        </button>
      </div>

      <EmployeePortalBanner />

      {addEmployeeError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Failed to save employee: {addEmployeeError}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserPlus size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t.employees.noEmployees}</p>
          <button
            onClick={() => setShowAddEmployee(true)}
            className="mt-3 text-amber-600 text-sm font-semibold hover:underline"
          >
            Add your first employee →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {employees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              emp={emp}
              shifts={shifts}
              currencySymbol={currencySymbol}
              onLogShift={openLogShift}
              onRecordDay={openRecordDay}
              onDelete={(id) => setDeleteConfirm(id)}
              onEdit={handleOpenEdit}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
            />
          ))}
        </div>
      )}

      {/* Payroll Summary Section */}
      {employees.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-amber-600" />
            <h2 className="font-bold text-gray-800 dark:text-gray-100">Payroll Summary</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Start Date</label>
              <input
                type="date"
                value={payrollRange.start}
                onChange={e => setPayrollRange(p => ({ ...p, start: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">End Date</label>
              <input
                type="date"
                value={payrollRange.end}
                onChange={e => setPayrollRange(p => ({ ...p, end: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <button
            onClick={handleGeneratePayroll}
            disabled={payrollLoading}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
          >
            <BarChart2 size={14} /> {payrollLoading ? "Generating…" : "Generate Report"}
          </button>

          {payrollReport.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Employee</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Hours/Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Rate</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">Gross Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {payrollReport.map((row) => {
                    const emp = employees.find(e => e.id === row.employee.id);
                    return (
                      <tr key={row.employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-100">{row.employee.name}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PAYROLL_TYPE_COLORS[row.employee.payrollType] ?? "bg-gray-100 text-gray-600"}`}>
                            {PAYROLL_TYPE_LABELS[row.employee.payrollType] ?? row.employee.payrollType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">
                          {row.hoursWorked !== undefined ? `${row.hoursWorked.toFixed(1)}h` : `${row.dailyRecords?.reduce((s, d) => s + d.daysWorked, 0).toFixed(2) ?? "—"}d`}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">
                          {row.employee.payrollType === "hourly"
                            ? `${currencySymbol}${emp?.hourlyWage?.toFixed(2) ?? "—"}/hr`
                            : `${currencySymbol}${Number(emp?.dailyWage ?? 0).toFixed(2)}/day`}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-600">{currencySymbol}{row.estimatedPay.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                    <td colSpan={4} className="py-2 px-3 font-bold text-gray-700 dark:text-gray-200">Total</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-700">{currencySymbol}{totalGrossPay.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{t.employees.addEmployee}</h2>
              <button onClick={() => { setShowAddEmployee(false); setSuggestExplanation(""); }} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Full Name *</label>
                <input
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g. Carlos Ruiz"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
                  <input
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee((p) => ({ ...p, role: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g. Cashier"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Job Title</label>
                  <input
                    value={newEmployee.jobTitle}
                    onChange={(e) => setNewEmployee((p) => ({ ...p, jobTitle: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g. Sales Associate"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Payroll Type</label>
                <div className="flex gap-2">
                  {(["hourly", "daily", "salary"] as const).map(pt => (
                    <button
                      key={pt}
                      onClick={() => setNewEmployee(p => ({ ...p, payrollType: pt }))}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all capitalize ${newEmployee.payrollType === pt ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"}`}
                    >
                      {PAYROLL_TYPE_LABELS[pt]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {newEmployee.payrollType === "hourly" ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hourly Wage ({currencySymbol})</label>
                    <CurrencyInput
                      value={newEmployee.hourlyWage}
                      onChange={(v) => setNewEmployee((p) => ({ ...p, hourlyWage: v }))}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="15.00"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Daily Wage ({currencySymbol})</label>
                    <CurrencyInput
                      value={newEmployee.dailyWage}
                      onChange={(v) => setNewEmployee((p) => ({ ...p, dailyWage: v }))}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="100.00"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">4-digit PIN</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={newEmployee.pin}
                    onChange={(e) => setNewEmployee((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100 tracking-widest text-center"
                    placeholder="0000"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">The PIN is used for the Employee Portal where staff can clock in/out and see their hours.</p>

              {/* Permissions Section */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={15} className="text-amber-600" />
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Permissions</span>
                  </div>
                  <button
                    onClick={() => suggestPermissions(newEmployee.jobTitle || newEmployee.role)}
                    disabled={suggestingPermissions || (!newEmployee.jobTitle.trim() && !newEmployee.role.trim())}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {suggestingPermissions ? (
                      <><Loader2 size={12} className="animate-spin" /> Thinking…</>
                    ) : (
                      <><Sparkles size={12} /> AI Suggest</>
                    )}
                  </button>
                </div>

                {suggestExplanation && (
                  <div className="mb-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2.5 text-xs text-purple-700 dark:text-purple-300">
                    {suggestExplanation}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {PERMISSION_KEYS.map((key) => {
                    const enabled = newEmployee.permissions[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setNewEmployee(p => ({
                          ...p,
                          permissions: { ...p.permissions, [key]: !p.permissions[key] }
                        }))}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                          enabled
                            ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600"
                            : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        <span className="truncate">{PERMISSION_LABELS[key]}</span>
                        <span className="ml-1 flex-shrink-0">{enabled ? "✓" : "✗"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 flex-shrink-0 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button onClick={() => { setShowAddEmployee(false); setSuggestExplanation(""); }} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleAddEmployee} disabled={!newEmployee.name.trim()} className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors">{t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Edit Employee</h2>
              <button onClick={() => setEditingEmployee(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
                  <input
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Cashier, Manager…"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Pay Type</label>
                  <select
                    value={editForm.payrollType}
                    onChange={(e) => setEditForm(p => ({ ...p, payrollType: e.target.value as "hourly" | "daily" | "salary" }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="salary">Salary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    {editForm.payrollType === "hourly" ? "Hourly Wage" : "Daily Wage"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.payrollType === "hourly" ? editForm.hourlyWage : editForm.dailyWage}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setEditForm(p => editForm.payrollType === "hourly" ? { ...p, hourlyWage: v } : { ...p, dailyWage: v });
                    }}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Portal PIN (4 digits)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={editForm.pin}
                  onChange={(e) => setEditForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100 tracking-widest text-center"
                  placeholder="0000"
                />
              </div>

              {/* Permissions */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={15} className="text-amber-600" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Permissions</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PERMISSION_KEYS.map((key) => {
                    const enabled = editForm.permissions[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEditForm(p => ({ ...p, permissions: { ...p.permissions, [key]: !p.permissions[key] } }))}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                          enabled
                            ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600"
                            : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        <span className="truncate">{PERMISSION_LABELS[key]}</span>
                        <span className="ml-1 flex-shrink-0">{enabled ? "✓" : "✗"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 flex-shrink-0 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button onClick={() => setEditingEmployee(null)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">Cancel</button>
              <button onClick={handleSaveEdit} disabled={!editForm.name.trim() || editSaving} className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors">
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Shift Modal */}
      {showLogShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Log Shift — {shiftForm.employeeName}</h2>
              <button onClick={() => setShowLogShift(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.employees.shiftStart}</label>
                <input
                  type="datetime-local"
                  value={shiftForm.shiftStart}
                  onChange={(e) => setShiftForm((f) => ({ ...f, shiftStart: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.employees.shiftEnd}</label>
                <input
                  type="datetime-local"
                  value={shiftForm.shiftEnd ?? ""}
                  onChange={(e) => setShiftForm((f) => ({ ...f, shiftEnd: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              {shiftForm.shiftStart && shiftForm.shiftEnd && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
                  <div className="text-xs text-amber-600 font-semibold">{t.employees.hoursWorked}</div>
                  <div className="text-2xl font-bold text-amber-700">
                    {calcHoursWorked(shiftForm.shiftStart, shiftForm.shiftEnd).toFixed(1)}h
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowLogShift(false)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleLogShift} className="flex-[2] bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-3 text-sm transition-colors">{t.employees.logShift}</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Day Modal */}
      {showRecordDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Record Day — {recordDayForm.employeeName}</h2>
              <button onClick={() => setShowRecordDay(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Work Date</label>
                <input
                  type="date"
                  value={recordDayForm.workDate}
                  onChange={(e) => setRecordDayForm(f => ({ ...f, workDate: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Days Worked</label>
                  <input
                    type="number"
                    min={0.25}
                    max={2}
                    step={0.25}
                    value={recordDayForm.daysWorked}
                    onChange={(e) => setRecordDayForm(f => ({ ...f, daysWorked: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Daily Rate ({currencySymbol})</label>
                  <CurrencyInput
                    value={recordDayForm.dailyRate}
                    onChange={(v) => setRecordDayForm(f => ({ ...f, dailyRate: v }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-600 font-semibold">Total Pay</div>
                <div className="text-2xl font-bold text-blue-700">
                  {currencySymbol}{(recordDayForm.daysWorked * recordDayForm.dailyRate).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note (optional)</label>
                <input
                  type="text"
                  value={recordDayForm.note}
                  onChange={(e) => setRecordDayForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g. Holiday bonus day"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowRecordDay(false)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleRecordDay} className="flex-[2] bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl py-3 text-sm transition-colors">{t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100">Remove this employee?</h3>
            <p className="text-sm text-gray-500">Their shift history will also be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={() => handleDeleteEmployee(deleteConfirm)} className="flex-1 bg-red-500 text-white font-bold rounded-xl py-2.5 text-sm">{t.common.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
