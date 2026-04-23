import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Append-only product / compliance analytics.
 * Avoid storing secrets; use for funnels, onboarding, and deletion audit.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Subject user (nullable for anonymous or post-delete retention by id only) */
    userId: uuid("user_id"),
    /** Actor (e.g. admin who deleted an account) */
    actorUserId: uuid("actor_user_id"),
    eventName: varchar("event_name", { length: 120 }).notNull(),
    properties: jsonb("properties").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index("analytics_events_user_idx").on(t.userId),
    byNameCreated: index("analytics_events_name_created_idx").on(t.eventName, t.createdAt),
  }),
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
