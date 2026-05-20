import {
  pgTable, uuid, varchar, text, timestamp, jsonb, numeric,
  doublePrecision, date, index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./storehub";

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    storeUserId:  uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessId:   uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    periodStart:  date("period_start").notNull(),
    periodEnd:    date("period_end").notNull(),
    // draft → approved → paid
    status:       varchar("status", { length: 20 }).notNull().default("draft"),
    totalGross:   numeric("total_gross", { precision: 12, scale: 2 }).notNull().default("0"),
    totalHours:   doublePrecision("total_hours").notNull().default(0),
    approvedBy:   uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt:   timestamp("approved_at", { withTimezone: true }),
    paidAt:       timestamp("paid_at", { withTimezone: true }),
    notes:        text("notes"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index("payroll_runs_store_idx").on(t.storeUserId),
  })
);

// ─── Payroll Line Items ───────────────────────────────────────────────────────
export const payrollLineItems = pgTable(
  "payroll_line_items",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    runId:         uuid("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId:    varchar("employee_id", { length: 255 }).notNull(),
    employeeName:  varchar("employee_name", { length: 255 }),
    payrollType:   varchar("payroll_type", { length: 20 }).notNull(), // hourly | salary | daily
    regularHours:  doublePrecision("regular_hours").notNull().default(0),
    overtimeHours: doublePrecision("overtime_hours").notNull().default(0),
    regularPay:    numeric("regular_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    overtimePay:   numeric("overtime_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    grossPay:      numeric("gross_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    deductions:    jsonb("deductions").notNull().default({}),
    netPay:        numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
    // Detailed shift-by-shift breakdown for the payslip
    breakdown:     jsonb("breakdown").notNull().default([]),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx:      index("payroll_items_run_idx").on(t.runId),
    employeeIdx: index("payroll_items_employee_idx").on(t.employeeId),
  })
);

export type PayrollRun      = typeof payrollRuns.$inferSelect;
export type PayrollLineItem = typeof payrollLineItems.$inferSelect;
