import {
  pgTable, uuid, text, timestamp, jsonb, index, varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./storehub";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    // Who performed the action (null = system/scheduled job)
    actorId:      uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole:    varchar("actor_role", { length: 30 }),
    // Which business context
    businessId:   uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    // Which store was affected (userId of the store_owner)
    storeUserId:  uuid("store_user_id").references(() => users.id, { onDelete: "cascade" }),
    // Namespaced action: "employee.create", "sale.void", "settings.update", "auth.login", etc.
    action:       varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),   // "employee", "sale", "product"
    resourceId:   text("resource_id"),
    // Snapshots — keep null when not applicable (e.g. create has no oldValue)
    oldValue:     jsonb("old_value"),
    newValue:     jsonb("new_value"),
    // Request metadata
    ipAddress:    varchar("ip_address", { length: 45 }),
    userAgent:    text("user_agent"),
    sessionId:    varchar("session_id", { length: 255 }),
    metadata:     jsonb("metadata"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx:      index("audit_logs_actor_idx").on(t.actorId),
    storeIdx:      index("audit_logs_store_idx").on(t.storeUserId),
    businessIdx:   index("audit_logs_business_idx").on(t.businessId),
    actionIdx:     index("audit_logs_action_idx").on(t.action),
    createdAtIdx:  index("audit_logs_created_at_idx").on(t.createdAt),
  })
);

export type AuditLog       = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
