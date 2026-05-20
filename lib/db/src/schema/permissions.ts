import {
  pgTable, uuid, varchar, boolean, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./storehub";

// ─── Role Templates ───────────────────────────────────────────────────────────
// Reusable named roles per store. isTemplate=true means it's a system default.
export const employeeRoles = pgTable(
  "employee_roles",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    storeUserId:  uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessId:   uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    name:         varchar("name", { length: 100 }).notNull(),
    description:  text("description"),
    isTemplate:   boolean("is_template").notNull().default(false),
    // Full permission set — keys are Permission type values, values are boolean
    permissions:  jsonb("permissions").notNull().default({}),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index("employee_roles_store_idx").on(t.storeUserId),
  })
);

// ─── Role → Employee Assignment ───────────────────────────────────────────────
export const employeeRoleAssignments = pgTable(
  "employee_role_assignments",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    employeeId:  varchar("employee_id", { length: 255 }).notNull(), // references employees.id (app-level, not FK)
    storeUserId: uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId:      uuid("role_id").notNull().references(() => employeeRoles.id, { onDelete: "cascade" }),
    // Optional location scope
    locationId:  uuid("location_id"),
    grantedBy:   uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    // null = permanent
    expiresAt:   timestamp("expires_at", { withTimezone: true }),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeeIdx: index("era_employee_idx").on(t.employeeId, t.storeUserId),
  })
);

// ─── Per-Employee Permission Overrides ────────────────────────────────────────
// Fine-grained grant/deny on top of any assigned role.
export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    employeeId:  varchar("employee_id", { length: 255 }).notNull(),
    storeUserId: uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission:  varchar("permission", { length: 100 }).notNull(),
    granted:     boolean("granted").notNull(),
    reason:      text("reason"),
    grantedBy:   uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt:   timestamp("expires_at", { withTimezone: true }),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeePermIdx: index("permission_overrides_emp_idx").on(t.employeeId, t.storeUserId, t.permission),
  })
);

export type EmployeeRole           = typeof employeeRoles.$inferSelect;
export type EmployeeRoleAssignment = typeof employeeRoleAssignments.$inferSelect;
export type PermissionOverride     = typeof permissionOverrides.$inferSelect;
