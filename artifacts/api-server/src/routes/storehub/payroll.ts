import { Router } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, payrollLineItems, shifts, employees } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { logAudit } from "../../lib/audit.js";

const router = Router();
router.use(requireAuth as any);

// ─── Payroll Computation ──────────────────────────────────────────────────────

interface ShiftRow {
  shiftStart: Date;
  shiftEnd:   Date | null;
  hoursWorked: number | null;
}

interface EmployeeRow {
  id:          string;
  name:        string;
  payrollType: string;
  hourlyWage:  number;
  dailyWage:   number;
}

interface LineItemDraft {
  employeeId:    string;
  employeeName:  string;
  payrollType:   string;
  regularHours:  number;
  overtimeHours: number;
  regularPay:    number;
  overtimePay:   number;
  grossPay:      number;
  deductions:    Record<string, number>;
  netPay:        number;
  breakdown:     Array<{ date: string; hours: number; pay: number }>;
}

function computePayroll(
  emp: EmployeeRow,
  empShifts: ShiftRow[],
  periodStart: Date,
  periodEnd:   Date,
): LineItemDraft {
  let regularHours  = 0;
  let overtimeHours = 0;
  let regularPay    = 0;
  let overtimePay   = 0;
  let grossPay      = 0;

  const breakdown: Array<{ date: string; hours: number; pay: number }> = [];

  if (emp.payrollType === "hourly") {
    // Group shifts by ISO week to compute weekly overtime (>40 hrs = 1.5x)
    const weekMap = new Map<string, { hours: number; shifts: ShiftRow[] }>();

    for (const s of empShifts) {
      const d    = new Date(s.shiftStart);
      const week = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() - d.getDay() + 10) / 7)).padStart(2, "0")}`;
      if (!weekMap.has(week)) weekMap.set(week, { hours: 0, shifts: [] });
      weekMap.get(week)!.hours  += s.hoursWorked ?? 0;
      weekMap.get(week)!.shifts.push(s);
    }

    for (const [, week] of weekMap) {
      const base = Math.min(week.hours, 40);
      const ot   = Math.max(0, week.hours - 40);
      regularHours  += base;
      overtimeHours += ot;
      regularPay    += base * emp.hourlyWage;
      overtimePay   += ot  * emp.hourlyWage * 1.5;
    }

    for (const s of empShifts) {
      const hrs = s.hoursWorked ?? 0;
      breakdown.push({
        date:  s.shiftStart.toISOString().slice(0, 10),
        hours: hrs,
        pay:   hrs * emp.hourlyWage,
      });
    }

    grossPay = regularPay + overtimePay;

  } else if (emp.payrollType === "daily") {
    // Count distinct worked days
    const days = new Set(empShifts.map((s) => s.shiftStart.toISOString().slice(0, 10)));
    regularHours = empShifts.reduce((acc, s) => acc + (s.hoursWorked ?? 0), 0);
    grossPay     = days.size * emp.dailyWage;
    regularPay   = grossPay;
    for (const day of days) {
      breakdown.push({ date: day, hours: 0, pay: emp.dailyWage });
    }

  } else {
    // Salary: period fraction = days in period / 365 * annual salary
    // Stored hourlyWage = annual salary for salary employees
    const msInPeriod = periodEnd.getTime() - periodStart.getTime();
    const daysInPeriod = msInPeriod / (1000 * 60 * 60 * 24);
    grossPay   = (emp.hourlyWage / 365) * daysInPeriod;
    regularPay = grossPay;
    regularHours = empShifts.reduce((acc, s) => acc + (s.hoursWorked ?? 0), 0);
  }

  // Simple deduction placeholder (tax withholding not yet computed — extend as needed)
  const deductions: Record<string, number> = {};
  const netPay = grossPay - Object.values(deductions).reduce((a, b) => a + b, 0);

  return {
    employeeId:   emp.id,
    employeeName: emp.name,
    payrollType:  emp.payrollType,
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    grossPay,
    deductions,
    netPay,
    breakdown,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/store/payroll/run — compute draft payroll
router.post("/run", async (req, res) => {
  const { periodStart, periodEnd, notes } = req.body as {
    periodStart: string; periodEnd: string; notes?: string;
  };

  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: "periodStart and periodEnd are required (YYYY-MM-DD)" });
  }

  const start = new Date(`${periodStart}T00:00:00Z`);
  const end   = new Date(`${periodEnd}T23:59:59Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return res.status(400).json({ error: "Invalid date range" });
  }

  const storeUserId = req.userId!;

  // Load employees and their approved shifts in period
  const [emps, periodShifts] = await Promise.all([
    db
      .select({
        id:          employees.id,
        name:        employees.name,
        payrollType: employees.payrollType,
        hourlyWage:  employees.hourlyWage,
        dailyWage:   employees.dailyWage,
      })
      .from(employees)
      .where(eq(employees.userId, storeUserId)),

    db
      .select({
        employeeId:  shifts.employeeId,
        shiftStart:  shifts.shiftStart,
        shiftEnd:    shifts.shiftEnd,
        hoursWorked: shifts.hoursWorked,
      })
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, storeUserId),
          gte(shifts.shiftStart, start),
          lte(shifts.shiftStart, end),
        )
      ),
  ]);

  // Group shifts by employee
  const shiftsByEmp = new Map<string, ShiftRow[]>();
  for (const s of periodShifts) {
    if (!s.employeeId) continue;
    if (!shiftsByEmp.has(s.employeeId)) shiftsByEmp.set(s.employeeId, []);
    shiftsByEmp.get(s.employeeId)!.push({
      shiftStart:  s.shiftStart,
      shiftEnd:    s.shiftEnd,
      hoursWorked: s.hoursWorked,
    });
  }

  // Compute line items
  const lineItems: LineItemDraft[] = [];
  let totalGross = 0;
  let totalHours = 0;

  for (const emp of emps) {
    const empShifts = shiftsByEmp.get(emp.id) ?? [];
    if (empShifts.length === 0) continue; // skip employees with no shifts

    const item = computePayroll(
      {
        id:          emp.id,
        name:        emp.name,
        payrollType: emp.payrollType ?? "hourly",
        hourlyWage:  emp.hourlyWage ?? 0,
        dailyWage:   Number(emp.dailyWage ?? 0),
      },
      empShifts,
      start,
      end,
    );

    lineItems.push(item);
    totalGross += item.grossPay;
    totalHours += item.regularHours + item.overtimeHours;
  }

  // Insert run + line items in a transaction
  const [run] = await db.insert(payrollRuns).values({
    storeUserId,
    businessId:  req.businessId ?? undefined,
    periodStart,
    periodEnd,
    status:      "draft",
    totalGross:  totalGross.toFixed(2),
    totalHours,
    notes:       notes ?? null,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(payrollLineItems).values(
      lineItems.map((li) => ({
        runId:         run.id,
        employeeId:    li.employeeId,
        employeeName:  li.employeeName,
        payrollType:   li.payrollType,
        regularHours:  li.regularHours,
        overtimeHours: li.overtimeHours,
        regularPay:    li.regularPay.toFixed(2),
        overtimePay:   li.overtimePay.toFixed(2),
        grossPay:      li.grossPay.toFixed(2),
        deductions:    li.deductions,
        netPay:        li.netPay.toFixed(2),
        breakdown:     li.breakdown,
      }))
    );
  }

  logAudit({ req }, { action: "payroll.run_created", resourceType: "payroll_run", resourceId: run.id, metadata: { periodStart, periodEnd, totalGross } });

  return res.status(201).json({ run, lineItems });
});

// GET /api/store/payroll/runs
router.get("/runs", async (req, res) => {
  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.storeUserId, req.userId!))
    .orderBy(desc(payrollRuns.createdAt));
  return res.json(runs);
});

// GET /api/store/payroll/runs/:id
router.get("/runs/:id", async (req, res) => {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.storeUserId, req.userId!)))
    .limit(1);

  if (!run) return res.status(404).json({ error: "Payroll run not found" });

  const items = await db
    .select()
    .from(payrollLineItems)
    .where(eq(payrollLineItems.runId, run.id));

  return res.json({ run, lineItems: items });
});

// POST /api/store/payroll/runs/:id/approve
router.post("/runs/:id/approve", async (req, res) => {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.storeUserId, req.userId!)))
    .limit(1);

  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status !== "draft") return res.status(400).json({ error: "Only draft runs can be approved" });

  const [updated] = await db
    .update(payrollRuns)
    .set({ status: "approved", approvedBy: req.userId!, approvedAt: new Date() })
    .where(eq(payrollRuns.id, run.id))
    .returning();

  logAudit({ req }, { action: "payroll.approve", resourceType: "payroll_run", resourceId: run.id });
  return res.json(updated);
});

// POST /api/store/payroll/runs/:id/mark-paid
router.post("/runs/:id/mark-paid", async (req, res) => {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.storeUserId, req.userId!)))
    .limit(1);

  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status !== "approved") return res.status(400).json({ error: "Only approved runs can be marked paid" });

  const [updated] = await db
    .update(payrollRuns)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(payrollRuns.id, run.id))
    .returning();

  logAudit({ req }, { action: "payroll.paid", resourceType: "payroll_run", resourceId: run.id });
  return res.json(updated);
});

// GET /api/store/payroll/runs/:id/export — CSV
router.get("/runs/:id/export", async (req, res) => {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.storeUserId, req.userId!)))
    .limit(1);

  if (!run) return res.status(404).json({ error: "Payroll run not found" });

  const items = await db
    .select()
    .from(payrollLineItems)
    .where(eq(payrollLineItems.runId, run.id));

  const header = "Employee,Payroll Type,Regular Hours,OT Hours,Regular Pay,OT Pay,Gross Pay,Net Pay\n";
  const rows = items
    .map((li) =>
      [
        `"${li.employeeName}"`,
        li.payrollType,
        li.regularHours.toFixed(2),
        li.overtimeHours.toFixed(2),
        li.regularPay,
        li.overtimePay,
        li.grossPay,
        li.netPay,
      ].join(",")
    )
    .join("\n");

  const csv = header + rows;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="payroll-${run.periodStart}-${run.periodEnd}.csv"`);
  return res.send(csv);
});

export default router;
