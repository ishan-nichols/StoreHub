import { useState, useEffect } from "react";
import { getEmployees, getShifts, clockIn, clockOut, getActiveShift, getUserProfile } from "../services/dataService";
import type { Employee, Shift, UserProfile } from "../schemas";
import { formatDate, formatTime, calcHoursWorked } from "../utils";
import { LogIn, LogOut, Clock, Timer, ChevronLeft, User, Calendar, DollarSign } from "lucide-react";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function useTimer(shiftStart: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!shiftStart) { setElapsed(0); return; }
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(shiftStart).getTime()) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [shiftStart]);
  return elapsed;
}

interface DayGroup {
  date: string;
  shifts: Shift[];
}

function groupByDay(shifts: Shift[]): DayGroup[] {
  const map = new Map<string, Shift[]>();
  for (const s of shifts) {
    const d = new Date(s.shiftStart).toLocaleDateString();
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(s);
  }
  return Array.from(map.entries())
    .map(([date, shifts]) => ({ date, shifts }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function getWeekShifts(shifts: Shift[]): Shift[] {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return shifts.filter((s) => new Date(s.shiftStart) >= weekAgo);
}

export default function EmployeePortalPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [step, setStep] = useState<"select" | "pin" | "dashboard">("select");
  const [search, setSearch] = useState("");
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const elapsed = useTimer(activeShift?.shiftStart ?? null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [emps, shfts, prof] = await Promise.all([getEmployees(), getShifts(), getUserProfile()]);
    setEmployees(emps);
    setAllShifts(shfts);
    setProfile(prof);
  }

  useEffect(() => { load(); }, []);

  async function loadActiveShift(empId: string) {
    const active = await getActiveShift(empId);
    setActiveShift(active);
  }

  function selectEmployee(emp: Employee) {
    setSelectedEmployee(emp);
    setPin("");
    setPinError("");
    setStep("pin");
  }

  function verifyPin() {
    if (!selectedEmployee) return;
    if (pin === selectedEmployee.pin) {
      setStep("dashboard");
      loadActiveShift(selectedEmployee.id);
    } else {
      setPinError("Incorrect PIN. Please try again.");
      setPin("");
    }
  }

  function handleBack() {
    setStep("select");
    setSelectedEmployee(null);
    setPin("");
    setPinError("");
    setActiveShift(null);
  }

  async function handleClockIn() {
    if (!selectedEmployee) return;
    setLoading(true);
    const shift = await clockIn(selectedEmployee.id, selectedEmployee.name);
    setActiveShift(shift);
    await load();
    setLoading(false);
  }

  async function handleClockOut() {
    if (!activeShift) return;
    setLoading(true);
    await clockOut(activeShift.id);
    setActiveShift(null);
    await load();
    setLoading(false);
  }

  const filteredEmployees = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  if (step === "select") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <User size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Employee Portal</h1>
            <p className="text-gray-400 text-sm mt-1">Select your name to sign in</p>
          </div>

          {employees.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
              <p className="text-sm">No employees set up yet.</p>
              <p className="text-xs mt-1">Ask your manager to add you to StoreHub.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employees..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {filteredEmployees.map((emp) => {
                  const active = allShifts.find((s) => s.employeeId === emp.id && s.shiftEnd === null);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => selectEmployee(emp)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-amber-50 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${active ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800">{emp.name}</div>
                        <div className="text-xs text-gray-400">{emp.role || "Staff"}</div>
                      </div>
                      {active && (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "pin" && selectedEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <button onClick={handleBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-6">
            <ChevronLeft size={16} /> Back
          </button>
          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold text-amber-700">
                {selectedEmployee.name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold text-gray-800">{selectedEmployee.name}</h2>
              <p className="text-sm text-gray-400">{selectedEmployee.role || "Staff"}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3 text-center">Enter your 4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && verifyPin()}
                placeholder="••••"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-center text-2xl tracking-[0.5em] focus:outline-none focus:border-amber-400 font-mono"
                autoFocus
              />
              {pinError && <p className="text-red-500 text-xs text-center mt-2">{pinError}</p>}
            </div>

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (key === "⌫") { setPin((p) => p.slice(0, -1)); setPinError(""); }
                    else if (key !== "" && pin.length < 4) { const next = pin + key; setPin(next); setPinError(""); if (next.length === 4) { setTimeout(() => { setPin(next); }, 0); } }
                  }}
                  disabled={key === ""}
                  className={`h-14 rounded-xl text-lg font-semibold transition-all ${
                    key === "" ? "opacity-0 cursor-default" : "bg-gray-100 hover:bg-amber-100 active:scale-95 text-gray-700"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              onClick={verifyPin}
              disabled={pin.length !== 4}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-4 transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "dashboard" && selectedEmployee) {
    const myShifts = allShifts.filter((s) => s.employeeId === selectedEmployee.id && s.shiftEnd !== null);
    const weekShifts = getWeekShifts(myShifts);
    const weekHours = weekShifts.reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
    const totalHours = myShifts.reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
    const weekPay = (weekHours * selectedEmployee.hourlyWage).toFixed(2);
    const totalPay = (totalHours * selectedEmployee.hourlyWage).toFixed(2);
    const cs = profile?.currencySymbol ?? "$";
    const dayGroups = groupByDay(myShifts).slice(0, 10);

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
        {/* Header */}
        <div className="bg-amber-500 text-white px-4 py-5 shadow-md">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center font-bold text-sm">
                {selectedEmployee.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold">{selectedEmployee.name}</div>
                <div className="text-xs text-amber-100">{selectedEmployee.role || "Staff"}</div>
              </div>
            </div>
            <button onClick={handleBack} className="text-amber-100 hover:text-white text-sm font-medium">Sign Out</button>
          </div>
        </div>

        <div className="max-w-xl mx-auto p-4 space-y-4">
          {/* Clock in/out card */}
          <div className={`rounded-2xl p-6 text-center shadow-lg ${activeShift ? "bg-green-500 text-white" : "bg-white text-gray-800"}`}>
            {activeShift ? (
              <>
                <div className="text-sm font-semibold text-green-100 mb-1">Currently Working</div>
                <div className="text-5xl font-mono font-bold tabular-nums mb-1">{formatElapsed(elapsed)}</div>
                <div className="text-sm text-green-100 mb-5">
                  Started at {formatTime(activeShift.shiftStart)} · {formatDate(activeShift.shiftStart)}
                </div>
                <button
                  onClick={handleClockOut}
                  disabled={loading}
                  className="flex items-center gap-2 mx-auto bg-white text-green-600 font-bold rounded-xl px-8 py-3.5 text-lg hover:bg-green-50 transition-colors shadow"
                >
                  <LogOut size={20} /> Clock Out
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock size={28} className="text-amber-500" />
                </div>
                <div className="text-lg font-bold text-gray-800 mb-1">Not clocked in</div>
                <div className="text-sm text-gray-400 mb-5">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <button
                  onClick={handleClockIn}
                  disabled={loading}
                  className="flex items-center gap-2 mx-auto bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl px-8 py-3.5 text-lg transition-colors shadow"
                >
                  <LogIn size={20} /> Clock In
                </button>
              </>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-semibold mb-1">
                <Timer size={12} /> THIS WEEK
              </div>
              <div className="text-2xl font-bold text-gray-800">{weekHours.toFixed(1)}h</div>
              {selectedEmployee.hourlyWage > 0 && (
                <div className="text-sm text-amber-600 font-semibold mt-0.5">{cs}{weekPay} est.</div>
              )}
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-semibold mb-1">
                <Calendar size={12} /> ALL TIME
              </div>
              <div className="text-2xl font-bold text-gray-800">{totalHours.toFixed(1)}h</div>
              {selectedEmployee.hourlyWage > 0 && (
                <div className="text-sm text-amber-600 font-semibold mt-0.5">{cs}{totalPay} est.</div>
              )}
            </div>
          </div>

          {/* Rate card */}
          {selectedEmployee.hourlyWage > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <DollarSign size={18} className="text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-gray-400 font-semibold">YOUR HOURLY RATE</div>
                <div className="text-lg font-bold text-gray-800">{cs}{selectedEmployee.hourlyWage.toFixed(2)}/hour</div>
              </div>
            </div>
          )}

          {/* Shift history */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Shift History</h3>
            </div>
            {dayGroups.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No shifts logged yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {dayGroups.map((group) => (
                  <div key={group.date} className="p-4">
                    <div className="text-xs font-semibold text-gray-400 mb-2">
                      {new Date(group.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </div>
                    {group.shifts.map((shift) => {
                      const shiftPay = shift.hoursWorked && selectedEmployee.hourlyWage > 0
                        ? (shift.hoursWorked * selectedEmployee.hourlyWage).toFixed(2)
                        : null;
                      return (
                        <div key={shift.id} className="flex items-center justify-between py-1.5">
                          <div className="text-sm text-gray-700">
                            {formatTime(shift.shiftStart)} — {shift.shiftEnd ? formatTime(shift.shiftEnd) : "ongoing"}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            {shift.hoursWorked !== null && (
                              <span className="font-semibold text-amber-600">{shift.hoursWorked.toFixed(1)}h</span>
                            )}
                            {shiftPay && (
                              <span className="text-gray-400">{cs}{shiftPay}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
