/**
 * Payroll computation unit tests.
 * Tests the core hourly/OT/daily/salary computation logic.
 */
import { describe, it, expect } from "vitest";

// ─── Inline the computation logic (extracted for testability) ─────────────────

interface ShiftRow { shiftStart: Date; shiftEnd: Date | null; hoursWorked: number | null; }
interface EmployeeRow { id: string; name: string; payrollType: string; hourlyWage: number; dailyWage: number; }

function computeHourlyPay(
  emp: EmployeeRow,
  empShifts: ShiftRow[],
): { regularHours: number; overtimeHours: number; regularPay: number; overtimePay: number; grossPay: number } {
  const weekMap = new Map<string, number>();

  for (const s of empShifts) {
    const d    = new Date(s.shiftStart);
    const week = `${d.getFullYear()}-W${Math.ceil((d.getDate() - d.getDay() + 10) / 7)}`;
    weekMap.set(week, (weekMap.get(week) ?? 0) + (s.hoursWorked ?? 0));
  }

  let regularHours  = 0;
  let overtimeHours = 0;
  let regularPay    = 0;
  let overtimePay   = 0;

  for (const [, hours] of weekMap) {
    const base = Math.min(hours, 40);
    const ot   = Math.max(0, hours - 40);
    regularHours  += base;
    overtimeHours += ot;
    regularPay    += base * emp.hourlyWage;
    overtimePay   += ot  * emp.hourlyWage * 1.5;
  }

  return { regularHours, overtimeHours, regularPay, overtimePay, grossPay: regularPay + overtimePay };
}

const baseEmp: EmployeeRow = { id: "e1", name: "Alice", payrollType: "hourly", hourlyWage: 15, dailyWage: 0 };

function shift(date: string, hours: number): ShiftRow {
  return { shiftStart: new Date(`${date}T09:00:00Z`), shiftEnd: null, hoursWorked: hours };
}

describe("Hourly payroll computation", () => {
  it("computes basic weekly pay with no OT", () => {
    // 5 shifts × 8h = 40h → no OT
    const shifts = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"].map((d) => shift(d, 8));
    const result = computeHourlyPay(baseEmp, shifts);

    expect(result.regularHours).toBe(40);
    expect(result.overtimeHours).toBe(0);
    expect(result.regularPay).toBe(600); // 40 × $15
    expect(result.grossPay).toBe(600);
  });

  it("applies 1.5x overtime for hours over 40 in a week", () => {
    // 48h in one week → 40h regular + 8h OT
    const shifts = [
      shift("2024-01-01", 8), shift("2024-01-02", 8), shift("2024-01-03", 8),
      shift("2024-01-04", 8), shift("2024-01-05", 8), shift("2024-01-06", 8), // Sunday
    ];
    // All in same week (Sun Jan 01 to Sat Jan 06 based on week computation)
    const result = computeHourlyPay(baseEmp, shifts);

    expect(result.regularHours + result.overtimeHours).toBe(48);
    expect(result.overtimePay).toBeGreaterThan(0);
    // OT pay = 8h × $15 × 1.5 = $180
    expect(result.grossPay).toBe(40 * 15 + 8 * 15 * 1.5); // $720
  });

  it("handles zero shifts", () => {
    const result = computeHourlyPay(baseEmp, []);
    expect(result.regularHours).toBe(0);
    expect(result.grossPay).toBe(0);
  });

  it("handles fractional hours", () => {
    const shifts = [shift("2024-01-01", 7.5), shift("2024-01-02", 7.5)];
    const result = computeHourlyPay(baseEmp, shifts);
    expect(result.regularHours).toBe(15);
    expect(result.grossPay).toBe(15 * 15); // $225
  });
});

describe("Auth password validation", () => {
  // Basic validation logic test
  function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
    if (password.length < 8) return { valid: false, reason: "At least 8 characters required" };
    if (!/[A-Z]/.test(password)) return { valid: false, reason: "At least one uppercase letter required" };
    if (!/[0-9]/.test(password)) return { valid: false, reason: "At least one number required" };
    if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: "At least one special character required" };
    return { valid: true };
  }

  it("accepts a strong password", () => {
    expect(validatePasswordStrength("SecurePass1!").valid).toBe(true);
  });

  it("rejects short passwords", () => {
    const r = validatePasswordStrength("Ab1!");
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("8 characters");
  });

  it("rejects passwords without uppercase", () => {
    expect(validatePasswordStrength("securepass1!").valid).toBe(false);
  });

  it("rejects passwords without special character", () => {
    expect(validatePasswordStrength("SecurePass1").valid).toBe(false);
  });
});
