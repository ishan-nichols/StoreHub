import {
  pgTable, uuid, varchar, boolean, timestamp, integer, text, unique, index
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    email:          varchar("email", { length: 255 }).unique(),
    fullName:       varchar("full_name", { length: 255 }).notNull(),
    passwordHash:   varchar("password_hash", { length: 255 }),
    emailVerified:  boolean("email_verified").notNull().default(false),
    phoneNumber:    varchar("phone_number", { length: 50 }).unique(),
    role:           varchar("role", { length: 20 }).notNull().default("store_owner"), // 'superadmin' | 'business_owner' | 'store_owner'
    businessId:     uuid("business_id"),
    createdAt:      timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt:    timestamp("last_login_at",{ withTimezone: true }),
    lockedUntil:    timestamp("locked_until", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
  },
  (table) => ({
    businessIdIdx: index("users_business_id_idx").on(table.businessId),
  })
);

export const refreshTokens = pgTable("refresh_tokens", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash:  varchar("token_hash", { length: 255 }).notNull().unique(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  deviceInfo: varchar("device_info", { length: 500 }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Used for both email verification and password reset tokens
export const authTokens = pgTable("auth_tokens", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:     varchar("token", { length: 255 }).notNull().unique(),
  type:      varchar("type", { length: 50 }).notNull(), // 'email_verification' | 'password_reset'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used:      boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phoneOtps = pgTable("phone_otps", {
  id:        uuid("id").primaryKey().defaultRandom(),
  phone:     varchar("phone", { length: 50 }).notNull(),
  otpHash:   varchar("otp_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used:      boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialAccounts = pgTable("social_accounts", {
  id:              uuid("id").primaryKey().defaultRandom(),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider:        varchar("provider", { length: 50 }).notNull(), // google | apple | microsoft
  providerUserId:  varchar("provider_user_id", { length: 255 }).notNull(),
  providerEmail:   varchar("provider_email", { length: 255 }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.provider, t.providerUserId)]);

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(), // base64url
  publicKey:    text("public_key").notNull(),             // base64url COSE key
  deviceName:   varchar("device_name", { length: 255 }),
  counter:      integer("counter").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Short-lived challenges for WebAuthn registration/authentication
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id:        uuid("id").primaryKey().defaultRandom(),
  challenge: text("challenge").notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email:     varchar("email", { length: 255 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User                = typeof users.$inferSelect;
export type InsertUser          = typeof users.$inferInsert;
export type RefreshToken        = typeof refreshTokens.$inferSelect;
export type PhoneOtp            = typeof phoneOtps.$inferSelect;
export type SocialAccount       = typeof socialAccounts.$inferSelect;
export type WebAuthnCredential  = typeof webauthnCredentials.$inferSelect;
