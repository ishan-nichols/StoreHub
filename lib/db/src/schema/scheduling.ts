import {
  pgTable, uuid, varchar, text, timestamp, jsonb, boolean,
  integer, time, date, index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// ─── Shift Schedules ──────────────────────────────────────────────────────────
export const schedules = pgTable(
  "schedules",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    storeUserId:  uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    employeeId:   varchar("employee_id", { length: 255 }).notNull(),
    employeeName: varchar("employee_name", { length: 255 }),
    locationId:   uuid("location_id"),
    startsAt:     timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt:       timestamp("ends_at", { withTimezone: true }).notNull(),
    role:         varchar("role", { length: 100 }),       // what they're doing this shift
    notes:        text("notes"),
    // draft → published (visible to employee) → acknowledged → cancelled
    status:       varchar("status", { length: 20 }).notNull().default("draft"),
    publishedAt:  timestamp("published_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdBy:    uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx:    index("schedules_store_idx").on(t.storeUserId),
    employeeIdx: index("schedules_employee_idx").on(t.employeeId),
    rangeIdx:    index("schedules_range_idx").on(t.storeUserId, t.startsAt, t.endsAt),
  })
);

// ─── Employee Availability ────────────────────────────────────────────────────
export const scheduleAvailability = pgTable(
  "schedule_availability",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    storeUserId:   uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    employeeId:    varchar("employee_id", { length: 255 }).notNull(),
    // 0 = Sunday, 6 = Saturday
    dayOfWeek:     integer("day_of_week").notNull(),
    startTime:     time("start_time").notNull(),
    endTime:       time("end_time").notNull(),
    isAvailable:   boolean("is_available").notNull().default(true),
    effectiveFrom: date("effective_from"),
    effectiveTo:   date("effective_to"),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeIdx: index("availability_employee_idx").on(t.employeeId, t.storeUserId),
  })
);

// ─── Schedule Templates ───────────────────────────────────────────────────────
export const scheduleTemplates = pgTable("schedule_templates", {
  id:          uuid("id").primaryKey().defaultRandom(),
  storeUserId: uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:        varchar("name", { length: 100 }).notNull(),
  // Array of { dayOfWeek, startTime, endTime, role, employeeId? }
  pattern:     jsonb("pattern").notNull().default([]),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Schedule             = typeof schedules.$inferSelect;
export type InsertSchedule       = typeof schedules.$inferInsert;
export type ScheduleAvailability = typeof scheduleAvailability.$inferSelect;
