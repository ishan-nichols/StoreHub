import type { CashShift, InsertCashShift } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashShiftReport {
  shift: CashShift;
  expectedCash: number;
  actualCash: number;
  variance: number;
  isBalanced: boolean;
  discrepancyNote?: string;
}

// ─── Cache (localStorage) ────────────────────────────────────────────────────────

const CASH_SHIFTS_KEY = "storehub_cash_shifts";
const CURRENT_SHIFT_KEY = "storehub_current_shift";

function scopedKey(key: string): string {
  const active = typeof window !== "undefined" ? sessionStorage.getItem("sh_active_store_id") : null;
  return active ? `${key}_${active}` : key;
}

// ─── Current Shift Tracking ───────────────────────────────────────────────────

export function getCurrentShift(): CashShift | null {
  const stored = localStorage.getItem(scopedKey(CURRENT_SHIFT_KEY));
  return stored ? JSON.parse(stored) : null;
}

export function setCurrentShift(shift: CashShift | null): void {
  if (shift) {
    localStorage.setItem(scopedKey(CURRENT_SHIFT_KEY), JSON.stringify(shift));
  } else {
    localStorage.removeItem(scopedKey(CURRENT_SHIFT_KEY));
  }
}

// ─── Shift Management ──────────────────────────────────────────────────────────

export function openShift(
  float: number,
  employeeId?: string,
): CashShift {
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  const shiftId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `shift_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

  const shift: CashShift = {
    id: shiftId,
    date,
    openedAt: now.toISOString(),
    openingFloat: float,
    cashIn: 0,
    cashOut: 0,
    employeeId,
  };

  setCurrentShift(shift);
  saveShift(shift);

  return shift;
}

export function closeShift(shiftId: string, countedAmount: number): CashShift {
  const shift = getShift(shiftId);
  if (!shift) {
    throw new Error("Shift not found");
  }

  const now = new Date();
  const expectedCash = shift.openingFloat + shift.cashIn - shift.cashOut;
  const variance = countedAmount - expectedCash;

  const closedShift: CashShift = {
    ...shift,
    closedAt: now.toISOString(),
    countedClose: countedAmount,
    variance,
  };

  saveShift(closedShift);
  setCurrentShift(null);

  return closedShift;
}

export function getShift(shiftId: string): CashShift | null {
  // Prefer the live currentShift for the active (unclosed) shift — it has the
  // most up-to-date cashIn/cashOut values from addCashIn/addCashOut.
  const current = getCurrentShift();
  if (current && current.id === shiftId) return current;

  const shifts = getAllShifts();
  return shifts.find(s => s.id === shiftId) ?? null;
}

// ─── Cash In/Out Tracking ─────────────────────────────────────────────────────

export function addCashIn(amount: number, notes?: string): CashShift {
  const shift = getCurrentShift();
  if (!shift || shift.closedAt) {
    throw new Error("No active cash shift");
  }

  shift.cashIn += amount;
  setCurrentShift(shift);
  saveShift(shift);
  return shift;
}

export function addCashOut(amount: number, notes?: string): CashShift {
  const shift = getCurrentShift();
  if (!shift || shift.closedAt) {
    throw new Error("No active cash shift");
  }

  shift.cashOut += amount;
  setCurrentShift(shift);
  saveShift(shift);
  return shift;
}

export function getShiftBalance(): { openingFloat: number; cashIn: number; cashOut: number; expectedCash: number } | null {
  const shift = getCurrentShift();
  if (!shift) return null;

  const expectedCash = shift.openingFloat + shift.cashIn - shift.cashOut;

  return {
    openingFloat: shift.openingFloat,
    cashIn: shift.cashIn,
    cashOut: shift.cashOut,
    expectedCash,
  };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export function getShiftReport(shiftId: string): CashShiftReport | null {
  const shift = getShift(shiftId);
  if (!shift) return null;

  const expectedCash = shift.openingFloat + shift.cashIn - shift.cashOut;
  const actualCash = shift.countedClose != null ? shift.countedClose : expectedCash;

  // For closed shifts use the variance stored by closeShift — it was calculated
  // from the live currentShift (correct cashIn) and is always authoritative.
  // Fall back to recalculating only for open/live shifts.
  const variance =
    shift.closedAt && shift.variance != null
      ? shift.variance
      : actualCash - expectedCash;

  const isBalanced = Math.abs(variance) < 0.01;

  let discrepancyNote: string | undefined;
  if (!isBalanced) {
    if (variance > 0) {
      discrepancyNote = `+$${variance.toFixed(2)} overage`;
    } else {
      discrepancyNote = `-$${Math.abs(variance).toFixed(2)} shortage`;
    }
  }

  return {
    shift,
    expectedCash,
    actualCash,
    variance,
    isBalanced,
    discrepancyNote,
  };
}

export function getDailyReport(date: string): {
  shifts: CashShift[];
  totalRevenue: number;
  totalExpenses: number;
  netCash: number;
  isComplete: boolean;
} {
  const shifts = getAllShifts().filter(s => s.date === date);
  const completedShifts = shifts.filter(s => s.closedAt);

  const totalRevenue = shifts.reduce((sum, s) => sum + s.cashIn, 0);
  const totalExpenses = shifts.reduce((sum, s) => sum + s.cashOut, 0);
  const netCash = totalRevenue - totalExpenses;

  return {
    shifts: completedShifts,
    totalRevenue,
    totalExpenses,
    netCash,
    isComplete: shifts.length > 0 && shifts.every(s => s.closedAt),
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function getAllShifts(): CashShift[] {
  const stored = localStorage.getItem(scopedKey(CASH_SHIFTS_KEY));
  return stored ? JSON.parse(stored) : [];
}

function saveShift(shift: CashShift): void {
  const shifts = getAllShifts();
  const index = shifts.findIndex(s => s.id === shift.id);
  if (index >= 0) {
    shifts[index] = shift;
  } else {
    shifts.push(shift);
  }
  localStorage.setItem(scopedKey(CASH_SHIFTS_KEY), JSON.stringify(shifts));
}

export function deleteShift(shiftId: string): void {
  const shifts = getAllShifts().filter(s => s.id !== shiftId);
  localStorage.setItem(scopedKey(CASH_SHIFTS_KEY), JSON.stringify(shifts));
}

export function getAllCashShifts(): CashShift[] {
  return getAllShifts();
}

// ─── History ──────────────────────────────────────────────────────────────────

export function getShiftsByDateRange(startDate: string, endDate: string): CashShift[] {
  const shifts = getAllShifts();
  return shifts.filter(s => s.date >= startDate && s.date <= endDate).sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
}

export function getRecentShifts(limit: number = 10): CashShift[] {
  const closedShifts = getAllShifts();
  const currentShift = getCurrentShift();
  const allShifts = currentShift ? [currentShift, ...closedShifts] : closedShifts;
  return allShifts
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit);
}
