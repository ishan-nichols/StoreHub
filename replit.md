# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (conversations + messages tables for AI)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Replit AI Integrations for OpenAI (gpt-5.2, SSE streaming)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### StoreHub (`artifacts/storehub`)
A smart small business management web app with a 10-step conversational onboarding, AI assistant, clock in/out, and employee portal.

**Tech:** React + Vite, Tailwind CSS, wouter routing, localStorage data service

**Architecture:**
- `src/services/dataService.ts` — single async data layer over localStorage (ready to swap to real API). Includes `clockIn`, `clockOut`, `getActiveShift`, `bulkCreateProducts`, `bulkCreateEmployees`, `getSeedProducts` functions.
- `src/schemas/index.ts` — all data schemas (Product, Sale, Expense, Supplier, Employee with `pin`/`hourlyWage`, Shift, UserProfile with `taxRate`/`openingHours`/`preSeedData`)
- `src/contexts/AppContext.tsx` — global app state, i18n, theme
- `src/locales/` — i18n strings for English and Spanish
- `src/utils/index.ts` — formatting, date helpers, currency symbols
- `src/components/AIChatWidget.tsx` — floating AI chat assistant powered by the API server (SSE streaming)

**Pages:**
- `/login` — auth-ready placeholder login screen
- `/onboarding` — 5-step setup: (1) store name/owner, (2) business type/challenge, (3) currency/tax/language/hours, (4) team setup with hourly wage + PIN, (5) review + launch; pre-seeds sample inventory based on business type
- `/dashboard` — KPIs, low stock alerts, recent sales, smart tips
- `/inventory` — add/edit/delete products with low stock badges
- `/pos` — point of sale, cart, checkout, receipt
- `/sales` — full sales history with receipt viewer
- `/expenses` — expense tracker by category
- `/suppliers` — supplier contacts + products linked
- `/employees` — employee management with real-time Clock In/Out (live timer), hourly wage tracking, pay estimates
- `/settings` — update store profile, currency, language, dark mode
- `/employee` — employee self-service portal: PIN-based login, clock in/out with live timer, shift history, weekly/total hours, pay estimates

**AI Assistant (`src/components/AIChatWidget.tsx`):**
- Floating amber button (bottom right) with green pulse indicator
- Conversation history panel (Clock icon in header) — browse & reload past saved chats
- New Chat button (Plus icon) starts a fresh conversation
- Quick action chips when chat is empty: Tax Tips, Low Stock?, Boost Sales, How to add product
- Knows all app features and can guide users step by step
- Knows the store's name, type, currency, owner AND real-time data (product count, low stock, today's revenue, profit)
- Includes tax guidance per business type (COGS, quarterly taxes, deductions)
- Accuracy rules in system prompt: never invents numbers, cites data or says "I don't know"
- Streams responses via SSE from the API server
- Context-aware system prompt per store profile
- Persists conversations in PostgreSQL via the API server

**Employee Portal (`/employee`):**
- No app auth required — standalone page
- Select name from employee list → enter 4-digit PIN
- Dashboard: live clock-in/out timer, weekly hours, total hours, pay estimates
- Shift history grouped by day
- Accessible from the "Employee Sign-In Portal" link in the sidebar

**Clock In/Out:**
- Real-time running timer showing HH:MM:SS format
- Green card and "Currently Working" badge when clocked in
- Manager view (Employees page) shows all active shifts with elapsed time
- Employee view (/employee) shows personal clock-in panel

**Pre-seeding:**
- Business-type-specific sample products (grocery, butcher, bakery, clothing, restaurant, pharmacy, general, other)
- Optional at onboarding step 4 via checkbox

**Dashboard AI Report:**
- Auto-generated business report every 4 hours (stored in localStorage as `storehub_ai_report`)
- Uses `/api/insights` SSE streaming endpoint
- Fetches real weather via `wttr.in` if `storeCity` is set in profile
- Shows: performance summary, smart suggestions, tax tip, weather opportunity
- Expand/collapse toggle, manual refresh button
- Shows weather banner (city temperature, conditions, tomorrow's forecast)

**Receipt Scanning (Inventory):**
- "Scan Receipt" button opens device camera or file picker
- Photo sent as base64 to `/api/vision/receipt` → GPT-4 Vision parses items
- Review modal: toggle/uncheck items, edit name/qty/unit/price/category inline
- Confirm → bulk creates products in inventory

**Settings — New Sections:**
- Store Location (city + address) — used for weather in AI reports
- Printer Setup: name, connection type (browser/network/bluetooth), test print button
- Software Integrations: Shopify, Square, QuickBooks, Clover, Lightspeed, Toast, Payroll, Mailchimp (all "Coming Soon")

**Authentication System:**
- DB tables: `users`, `refresh_tokens`, `auth_tokens`, `phone_otps`, `social_accounts`, `webauthn_credentials`, `webauthn_challenges`
- JWT sessions: access token (15 min) + refresh token (7 days) in httpOnly cookies (`sh_access`, `sh_refresh`)
- Supports: email/password, phone OTP, social login (Google/Apple/Microsoft stub), WebAuthn/biometric (FIDO2)
- Frontend services: `authService.ts`, `biometricService.ts`, `phoneAuthService.ts`
- Auth context: `contexts/AuthContext.tsx` — `useAuth()` hook, silent refresh timer
- Auth screens: `/login`, `/signup`, `/forgot-password`, `/login/phone`
- Password policy: 8+ chars, 1 uppercase, 1 number, 1 special char; lockout after 5 failed attempts for 15 min
- Dev mode: returns `_devVerifyToken` and `_devOtp` in API responses (never in production)
- INTEGRATION hooks in `routes/auth/index.ts`: EMAIL_PROVIDER, SMS_PROVIDER, OAUTH_GOOGLE, OAUTH_APPLE, OAUTH_MICROSOFT, WEBAUTHN_SERVER

**Future-proof:**
- All data ops are async/await, ready for real API swap
- Comments mark Shopify, Square, QuickBooks integration points
- i18n structure supports adding more languages

### API Server (`artifacts/api-server`)
Express 5 API server providing AI chat endpoints and full auth backend.

**Routes:**
- `GET /api/healthz` — health check
- `POST /api/auth/signup` — create account (returns `_devVerifyToken` in dev)
- `POST /api/auth/login` — email/password login → sets httpOnly cookies
- `POST /api/auth/logout` — clears auth cookies
- `GET /api/auth/me` — returns current user from access token cookie
- `POST /api/auth/refresh` — silent token refresh using refresh cookie
- `POST /api/auth/forgot-password` — send reset link (stub)
- `POST /api/auth/reset-password` — reset password via token
- `POST /api/auth/verify-email` — verify email via token
- `POST /api/auth/resend-verification` — resend email verification
- `POST /api/auth/phone/send-otp` — send OTP (stub; shows `_devOtp` in dev)
- `POST /api/auth/phone/verify-otp` — verify phone OTP → sets auth cookies
- `POST /api/auth/social/:provider` — Google/Apple/Microsoft login (stub)
- `POST /api/auth/webauthn/register-begin` — WebAuthn registration challenge
- `POST /api/auth/webauthn/register-finish` — save WebAuthn credential
- `POST /api/auth/webauthn/login-begin` — WebAuthn auth challenge
- `POST /api/auth/webauthn/login-finish` — verify WebAuthn assertion → sets auth cookies
- `GET /api/auth/methods` — list enabled login methods for current user
- `PATCH /api/auth/profile` — update name or change password
- `GET /api/auth/webauthn/credentials` — list registered biometric devices
- `DELETE /api/auth/webauthn/:credentialId` — remove biometric device
- `GET/POST /api/openai/conversations` — list/create conversations
- `GET/DELETE /api/openai/conversations/:id` — get/delete conversation
- `GET/POST /api/openai/conversations/:id/messages` — list messages / send message (SSE streaming)
- `POST /api/vision/receipt` — receipt OCR via OpenAI Vision (gpt-5.2); body: `{image: base64, mimeType}`, returns `{supplierName, date, items: [{name,quantity,cost,srp,category,packSize}]}`
- `POST /api/insights` — AI business report with weather (SSE); body: `{storeContext, city?, language?}`; fetches weather from wttr.in if city provided

**Dependencies:**
- `@workspace/integrations-openai-ai-server` — OpenAI client via Replit AI Integrations
- `@workspace/db` — Drizzle ORM + conversations/messages tables
- Requires `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` env vars (auto-set)
- Requires `DATABASE_URL` env var (auto-set)

## StoreHub — Pricing & POS Sync expansion (2026-04)

Added barcode scanning, enhanced delivery-receipt scanning, full price management, scheduled price changes, low-margin alerts, and bidirectional POS price sync.

**Schema additions** (`artifacts/storehub/src/schemas/index.ts`):
- `Product`: `barcode`, `brand`, `costPrice`, `srp`, `marginAlertPct`, `priceHistory[]`, `posSyncStatus`, `lastCostChangeAt`, `lastPriceChangeAt`
- `ScheduledPriceChange` type + `InsertScheduledPriceChange`
- `PriceHistoryEntry`, `PosSyncStatus`

**New services:**
- `pricingService.ts` — margin/price math, `updatePrice` / `updateCost` (with history + POS push), bulk preview/apply, `processScheduledChanges` (with in-memory mutex), `findMarginAlerts`, `retryPosSync`, SRP/margin-preserving suggestions
- `barcodeService.ts` — native `BarcodeDetector` with `@zxing/browser` fallback; lookup chain Open Food Facts → UPCitemdb → optional Barcode Lookup (`VITE_BARCODE_LOOKUP_KEY`) → local library
- `receiptScanService.ts` — wraps `/api/vision/receipt`, fuzzy/UPC matches to inventory, flags cost changes, suggests SRP / margin-preserving prices
- `dataService.ts` — CRUD for `ScheduledPriceChange`
- `integrationService.ts` + each integration impl (Square, Shopify, Verifone, Gilbarco) — added `pushPriceUpdate(productId, newPrice)` + `supportsPriceSync`; `pushPriceUpdate()` broadcasts to all connected systems

**New components:**
- `BarcodeScanner.tsx` — camera modal with manual-entry fallback, edit-before-confirm
- `ReceiveDeliveryModal.tsx` — scan/enter delivery receipt, per-item action chips (Match SRP / Auto-margin / Keep / Custom), live margin display, aggregates duplicate matched lines
- `PricePanel.tsx` — inline editable cost/retail, color-coded margin, price history, POS-sync badge with retry
- `BulkPriceUpdateModal.tsx` — 4 modes (Raise %, Raise $, Match SRP, Target margin) with live preview
- `ScheduledPriceChangesPanel.tsx` — list + add form for scheduled sales

**Page changes:**
- `InventoryPage` — added Scan Barcode + Receive Delivery + Bulk Price buttons; bulk-select mode with checkboxes; embedded `PricePanel` in edit modal; new fields (barcode, cost, SRP, margin alert %); `ScheduledPriceChangesPanel` below the list
- `DashboardPage` — `LowMarginAlerts` widget above existing alerts row
- `AppContext` — runs `processScheduledChanges` on mount + every 5 min

**API change:**
- `/api/vision/receipt` now extracts `{supplierName, date, items[]}` per line: `name, upc, quantity, unit, cost, srp, category` (uses `gpt-5.2`, `max_completion_tokens: 2500`)

**New deps in storehub:** `@zxing/browser`, `@zxing/library`
**Optional env:** `VITE_BARCODE_LOOKUP_KEY` (paid Barcode Lookup API fallback)

**Pre-existing typecheck errors (not from this expansion):** `OnboardingPage` StepKey, `POSPage` `InsertSale.receiptNumber`, `ReportsPage` period comparison, `SuppliersPage` `InsertSupplier` cast, `dataService` cstore/liquor seed records.
