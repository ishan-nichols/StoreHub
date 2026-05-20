import {
  pgTable, uuid, varchar, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./storehub";

export const employeeInvitations = pgTable(
  "employee_invitations",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    storeUserId: uuid("store_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessId:  uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    email:       varchar("email", { length: 255 }).notNull(),
    // Pre-assigned role name (e.g. "cashier", "manager")
    roleName:    varchar("role_name", { length: 100 }),
    roleId:      uuid("role_id"),
    // SHA-256 hash of the raw token sent in the invite URL
    tokenHash:   varchar("token_hash", { length: 255 }).notNull().unique(),
    expiresAt:   timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt:  timestamp("accepted_at", { withTimezone: true }),
    revokedAt:   timestamp("revoked_at", { withTimezone: true }),
    invitedBy:   uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    // Pre-fill data shown on the accept page
    metadata:    jsonb("metadata"),  // { name, jobTitle, hourlyWage, payrollType }
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx:     index("invitations_store_idx").on(t.storeUserId),
    emailIdx:     index("invitations_email_idx").on(t.email),
    tokenHashIdx: index("invitations_token_hash_idx").on(t.tokenHash),
  })
);

export type EmployeeInvitation       = typeof employeeInvitations.$inferSelect;
export type InsertEmployeeInvitation = typeof employeeInvitations.$inferInsert;
