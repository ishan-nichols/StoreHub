import { useEffect, useState, useRef } from "react";
import { useApp } from "../contexts/useApp";
import {
  getEmployees,
  createEmployee,
  deleteEmployee,
  getShifts,
  createShift,
  updateShift,
  getActiveShift,
  clockIn,
  clockOut,
} from "../services/dataService";
import type { Employee, Shift, InsertEmployee, InsertShift } from "../schemas";
import { formatDate, formatTime, calcHoursWorked, now, getCurrencySymbol } from "../utils";
import CurrencyInput from "../components/CurrencyInput";
import { Plus, Trash2, X, Clock, UserPlus, LogIn, LogOut, Timer } from "lucide-react";

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

interface EmployeeCardProps {
  emp: Employee;
  shifts: Shift[];
  currencySymbol: string;
  onLogShift: (emp: Employee) => void;
  onDelete: (id: string) => void;
  onClockIn: (emp: Employee) => void;
  onClockOut: (shiftId: string) => void;
}

function EmployeeCard({ emp, shifts, currencySymbol, onLogShift, onDelete, onClockIn, onClockOut }: EmployeeCardProps) {
  const activeShift = shifts.find((s) => s.employeeId === emp.id && s.shiftEnd === null);
  const elapsed = useClockTimer(activeShift?.shiftStart ?? null);
  const empShifts = shifts.filter((s) => s.employeeId === emp.id && s.shiftEnd !== null).slice(0, 5);
  const totalHours = shifts
    .filter((s) => s.employeeId === emp.id && s.hoursWorked !== null)
    .reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
  const weeklyPay = emp.hourlyWage > 0 ? (totalHours * emp.hourlyWage).toFixed(2) : null;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 transition-all ${activeShift ? "border-green-300 dark:border-green-700 shadow-green-50 dark:shadow-none shadow-lg" : "border-gray-100 dark:border-gray-700"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${activeShift ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {emp.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              {emp.name}
              {activeShift && (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  <Timer size={10} /> Clocked In
                </span>
              )}
            </div>
            {emp.role && <div className="text-xs text-gray-500">{emp.role}</div>}
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
              <span className="font-semibold text-amber-600">{totalHours.toFixed(1)}h total</span>
              {emp.hourlyWage > 0 && (
                <>
                  <span>·</span>
                  <span>{currencySymbol}{emp.hourlyWage.toFixed(2)}/hr</span>
                  {weeklyPay && <span>· Est. {currencySymbol}{weeklyPay} pay</span>}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => onLogShift(emp)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-semibold transition-colors"
          >
            <Clock size={12} /> Log
          </button>
          <button
            onClick={() => onDelete(emp.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Clock in/out section */}
      {activeShift ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-green-600 font-semibold">Currently Working</div>
            <div className="text-xl font-mono font-bold text-green-700 tabular-nums">{formatElapsed(elapsed)}</div>
            <div className="text-xs text-green-500">Started {formatTime(activeShift.shiftStart)}</div>
          </div>
          <button
            onClick={() => onClockOut(activeShift.id)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <LogOut size={14} /> Clock Out
          </button>
        </div>
      ) : (
        <button
          onClick={() => onClockIn(emp)}
          className="w-full flex items-center justify-center gap-2 mb-3 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold transition-colors"
        >
          <LogIn size={14} /> Clock In
        </button>
      )}

      {empShifts.length > 0 && (
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
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "", hourlyWage: 15, pin: "" });
  const [shiftForm, setShiftForm] = useState<InsertShift>({
    employeeId: "",
    employeeName: "",
    shiftStart: now().slice(0, 16),
    shiftEnd: now().slice(0, 16),
    hoursWorked: null,
  });
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
    await createEmployee({
      name: newEmployee.name.trim(),
      role: newEmployee.role.trim(),
      hourlyWage: newEmployee.hourlyWage,
      pin: newEmployee.pin || "0000",
    });
    setNewEmployee({ name: "", role: "", hourlyWage: 15, pin: "" });
    setShowAddEmployee(false);
    load();
  }

  async function handleDeleteEmployee(id: string) {
    await deleteEmployee(id);
    setDeleteConfirm(null);
    load();
  }

  async function handleClockIn(emp: Employee) {
    const existing = await getActiveShift(emp.id);
    if (existing) return;
    await clockIn(emp.id, emp.name);
    load();
  }

  async function handleClockOut(shiftId: string) {
    await clockOut(shiftId);
    load();
  }

  async function handleLogShift() {
    if (!shiftForm.employeeId) return;
    const hours = shiftForm.shiftEnd ? calcHoursWorked(shiftForm.shiftStart, shiftForm.shiftEnd) : null;
    await createShift({ ...shiftForm, hoursWorked: hours });
    setShowLogShift(false);
    load();
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

  const clockedInCount = shifts.filter((s) => s.shiftEnd === null).length;

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
              onDelete={(id) => setDeleteConfirm(id)}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
            />
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{t.employees.addEmployee}</h2>
              <button onClick={() => setShowAddEmployee(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
                <input
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee((p) => ({ ...p, role: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g. Cashier"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hourly Wage ({currencySymbol})</label>
                  <CurrencyInput
                    value={newEmployee.hourlyWage}
                    onChange={(v) => setNewEmployee((p) => ({ ...p, hourlyWage: v }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="15.00"
                  />
                </div>
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
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowAddEmployee(false)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleAddEmployee} disabled={!newEmployee.name.trim()} className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors">{t.common.save}</button>
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
