import {
  pgTable, uuid, varchar, text, integer, boolean, timestamp,
  doublePrecision, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

const userRef = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ─── Profile ────────────────────────────────────────────────────────────────
export const storeProfiles = pgTable("store_profiles", {
  userId:              uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  storeName:           varchar("store_name",      { length: 255 }).notNull().default(""),
  ownerName:           varchar("owner_name",      { length: 255 }).notNull().default(""),
  businessType:        varchar("business_type",   { length: 50 }).notNull().default("other"),
  numEmployees:        integer("num_employees").notNull().default(0),
  painPoint:           varchar("pain_point",      { length: 50 }).notNull().default("inventory"),
  currency:            varchar("currency",        { length: 10 }).notNull().default("USD"),
  currencySymbol:      varchar("currency_symbol", { length: 8 }).notNull().default("$"),
  language:            varchar("language",        { length: 10 }).notNull().default("en"),
  theme:               varchar("theme",           { length: 20 }).notNull().default("light"),
  accentColor:         varchar("accent_color",    { length: 16 }),
  taxRate:             doublePrecision("tax_rate").notNull().default(0),
  openingHours:        jsonb("opening_hours").notNull().default({}),
  preSeedData:         boolean("pre_seed_data").notNull().default(false),
  featureUsageCount:   jsonb("feature_usage_count").notNull().default({}),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  storeCity:           varchar("store_city",      { length: 255 }),
  storeAddress:        varchar("store_address",   { length: 500 }),
  printerName:         varchar("printer_name",    { length: 255 }),
  printerConnection:   varchar("printer_connection", { length: 20 }),
  // Onboarding v2
  onboardingVersion:   integer("onboarding_version"),
  storeSize:           varchar("store_size",       { length: 20 }),
  currentSystem:       varchar("current_system",   { length: 50 }),
  currentPosSystem:    varchar("current_pos_system", { length: 50 }),
  painPoints:          jsonb("pain_points"),
  stockOuts:           jsonb("stock_outs"),
  supplierStyle:       varchar("supplier_style",   { length: 50 }),
  scheduleStyle:       varchar("schedule_style",   { length: 50 }),
  goal:                varchar("goal",             { length: 50 }),
  storageMode:         varchar("storage_mode",     { length: 20 }).notNull().default("cloud"), // 'cloud' | 'local'
  createdAt:           timestamp("created_at",     { withTimezone: true }).notNull().defaultNow(),
  lastUpdated:         timestamp("last_updated",   { withTimezone: true }).notNull().defaultNow(),
});

// ─── Suppliers ──────────────────────────────────────────────────────────────
export const suppliers = pgTable("suppliers", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       userRef(),
  name:         varchar("name",        { length: 255 }).notNull(),
  contactName:  varchar("contact_name",{ length: 255 }).notNull().default(""),
  phone:        varchar("phone",       { length: 50 }).notNull().default(""),
  email:        varchar("email",       { length: 255 }).notNull().default(""),
  productIds:   jsonb("product_ids").notNull().default([]),
  reorderNotes: text("reorder_notes").notNull().default(""),
  createdAt:    timestamp("created_at",{ withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("suppliers_user_idx").on(t.userId) }));

// ─── Products ───────────────────────────────────────────────────────────────
export const products = pgTable("products", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             userRef(),
  name:               varchar("name", { length: 500 }).notNull(),
  sku:                varchar("sku",  { length: 100 }).notNull().default(""),
  category:           varchar("category", { length: 100 }).notNull().default(""),
  price:              doublePrecision("price").notNull().default(0),
  quantity:           doublePrecision("quantity").notNull().default(0),
  lowStockThreshold:  doublePrecision("low_stock_threshold").notNull().default(0),
  supplierId:         uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  unit:               varchar("unit",  { length: 30 }).notNull().default("unit"),
  tags:               jsonb("tags").notNull().default([]),
  barcode:            varchar("barcode", { length: 100 }),
  brand:              varchar("brand",   { length: 255 }),
  imageUrl:           text("image_url"),
  size:               varchar("size",    { length: 100 }),
  costPrice:          doublePrecision("cost_price"),
  srp:                doublePrecision("srp"),
  marginAlertPct:     doublePrecision("margin_alert_pct"),
  priceHistory:       jsonb("price_history"),
  posSyncStatus:      varchar("pos_sync_status", { length: 30 }),
  posSyncError:       text("pos_sync_error"),
  lastCostChangeAt:   timestamp("last_cost_change_at",  { withTimezone: true }),
  lastPriceChangeAt:  timestamp("last_price_change_at", { withTimezone: true }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser:    index("products_user_idx").on(t.userId),
  bySku:     index("products_sku_idx").on(t.userId, t.sku),
  byBarcode: index("products_barcode_idx").on(t.userId, t.barcode),
}));

// ─── Sales ──────────────────────────────────────────────────────────────────
export const sales = pgTable("sales", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        userRef(),
  items:         jsonb("items").notNull().default([]),
  subtotal:      doublePrecision("subtotal").notNull().default(0),
  tax:           doublePrecision("tax").notNull().default(0),
  total:         doublePrecision("total").notNull().default(0),
  amountPaid:    doublePrecision("amount_paid").notNull().default(0),
  change:        doublePrecision("change").notNull().default(0),
  receiptNumber: varchar("receipt_number", { length: 100 }).notNull().default(""),
  note:          text("note").notNull().default(""),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser:      index("sales_user_idx").on(t.userId),
  byUserDate:  index("sales_user_date_idx").on(t.userId, t.createdAt),
}));

// ─── Expenses ───────────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      userRef(),
  description: varchar("description", { length: 500 }).notNull().default(""),
  amount:      doublePrecision("amount").notNull().default(0),
  category:    varchar("category",    { length: 100 }).notNull().default(""),
  date:        timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("expenses_user_idx").on(t.userId) }));

// ─── Recurring Expenses ─────────────────────────────────────────────────────
export const recurringExpenses = pgTable("recurring_expenses", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        userRef(),
  description:   varchar("description", { length: 500 }).notNull().default(""),
  amount:        doublePrecision("amount").notNull().default(0),
  category:      varchar("category", { length: 100 }).notNull().default(""),
  frequency:     varchar("frequency", { length: 20 }).notNull().default("monthly"),
  dayOfWeek:     integer("day_of_week"),
  dayOfMonth:    integer("day_of_month"),
  monthOfYear:   integer("month_of_year"),
  enabled:       boolean("enabled").notNull().default(true),
  lastProcessed: timestamp("last_processed", { withTimezone: true }),
  createdAt:     timestamp("created_at",     { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("recurring_expenses_user_idx").on(t.userId) }));

// ─── Employees ──────────────────────────────────────────────────────────────
export const employees = pgTable("employees", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      userRef(),
  name:        varchar("name", { length: 255 }).notNull(),
  role:        varchar("role", { length: 100 }).notNull().default(""),
  pin:         varchar("pin",  { length: 20 }).notNull().default(""),
  hourlyWage:  doublePrecision("hourly_wage").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("employees_user_idx").on(t.userId) }));

// ─── Shifts ─────────────────────────────────────────────────────────────────
export const shifts = pgTable("shifts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       userRef(),
  employeeId:   uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  employeeName: varchar("employee_name", { length: 255 }).notNull().default(""),
  shiftStart:   timestamp("shift_start", { withTimezone: true }).notNull().defaultNow(),
  shiftEnd:     timestamp("shift_end",   { withTimezone: true }),
  hoursWorked:  doublePrecision("hours_worked"),
  createdAt:    timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("shifts_user_idx").on(t.userId) }));

// ─── Scheduled Price Changes ────────────────────────────────────────────────
export const scheduledPriceChanges = pgTable("scheduled_price_changes", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        userRef(),
  productId:     uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  productName:   varchar("product_name", { length: 500 }).notNull().default(""),
  newPrice:      doublePrecision("new_price").notNull().default(0),
  originalPrice: doublePrecision("original_price").notNull().default(0),
  startsAt:      timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:        timestamp("ends_at",   { withTimezone: true }),
  status:        varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byUser: index("sched_price_user_idx").on(t.userId) }));

// ─── Integration credentials (per-user, server-side) ────────────────────────
export const userIntegrations = pgTable("user_integrations", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      userRef(),
  systemId:    varchar("system_id", { length: 50 }).notNull(), // 'square' | 'shopify' | 'clover' …
  status:      varchar("status",    { length: 30 }).notNull().default("disconnected"),
  credentials: jsonb("credentials").notNull().default({}),
  metadata:    jsonb("metadata").notNull().default({}),
  lastSyncAt:  timestamp("last_sync_at", { withTimezone: true }),
  createdAt:   timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser:       index("user_integrations_user_idx").on(t.userId),
  byUserSystem: index("user_integrations_user_system_idx").on(t.userId, t.systemId),
}));
