# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit & Push Policy

**Every change must be committed and pushed to GitHub immediately after being made.** Do not leave changes uncommitted. After any edit, run:

```bash
git add -A && git commit -m "<message>" && git push origin main
```

## Repository Structure

This is a **pnpm monorepo** with two main areas:

- `artifacts/` — Deployable applications (frontend, backend, mockup sandbox)
- `lib/` — Shared packages (db, API spec, generated clients, AI integrations)

Key packages:
- `artifacts/storehub` — React 19 frontend (Vite)
- `artifacts/api-server` — Express 5 backend (Node.js, esbuild-bundled)
- `lib/db` — Drizzle ORM schema + PostgreSQL pool
- `lib/api-spec` — OpenAPI spec (`openapi.yaml`) + Orval codegen config
- `lib/api-client-react` — Generated React Query hooks (do not edit manually)
- `lib/api-zod` — Generated Zod schemas (do not edit manually)

## Commands

### Development

```bash
# Frontend
cd artifacts/storehub && pnpm dev        # Vite dev server on :5173

# Backend
cd artifacts/api-server && pnpm dev      # Build + start with NODE_ENV=development

# Both via PM2
pm2 start ecosystem.config.cjs
```

### Build & Type-check

```bash
pnpm build                               # Build all workspaces
pnpm typecheck                           # Type-check libs + artifacts
cd artifacts/api-server && pnpm typecheck
cd artifacts/storehub && pnpm typecheck
```

### Tests (api-server only)

```bash
cd artifacts/api-server && pnpm test           # Run all tests once
cd artifacts/api-server && pnpm test:watch     # Watch mode
# Single test file:
cd artifacts/api-server && pnpm exec vitest run src/__tests__/path/to/file.test.ts
```

### Database

```bash
cd lib/db && pnpm push          # Apply schema to PostgreSQL
cd lib/db && pnpm push-force    # Destructive reset
```

### API Code Generation

When `lib/api-spec/openapi.yaml` changes, regenerate clients:

```bash
cd lib/api-spec && pnpm codegen
```

This rewrites `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` — never edit those files manually.

## Architecture

### Auth System

JWT auth via **httpOnly cookies** (`sh_access` + `sh_refresh`). Access tokens expire in 15 min; the frontend auto-refreshes them 2 min before expiry via a timer in `AuthContext`. Refresh tokens last 7 days with rotation on use.

Auth methods supported: email/password, phone OTP, Google OAuth, WebAuthn/biometric, Apple/Microsoft OAuth stubs. Account lockout after 5 failed attempts (15-min lock).

**Store-view mode**: Business owners switch between managed stores without a new JWT. The active store is stored in `sessionStorage` (`sh_active_store_id`) and sent as `X-Store-User-Id` header. The backend resolves permissions based on this header.

### Role Hierarchy

Three roles with distinct UIs in `App.tsx`:
- `superadmin` → `AdminApp`
- `business_owner` → `BusinessOwnerApp` (portfolio) or `StoreApp` (when store-view active)
- `store_owner` → `StoreApp`

Employees access a separate kiosk UI at `/employee` (no full app login).

### Data Flow

1. **OpenAPI spec** (`lib/api-spec/openapi.yaml`) is the source of truth for the API contract.
2. **Orval** generates React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) from it.
3. The frontend imports generated hooks; the backend implements the routes manually in `artifacts/api-server/src/routes/`.
4. **Drizzle ORM** in `lib/db` owns the schema — changes there require `pnpm push` to migrate.

### Backend Route Structure

All routes mount under `/api` in `app.ts`. Core store operations are in `routes/storehub/`, auth in `routes/auth/`. Middleware chain: rate limiter → CORS → `requireAuth` → `requirePermission` (RBAC).

Background jobs use **BullMQ** with Redis (falls back to in-memory if Redis is unavailable). Email sending via Nodemailer — logs to console if SMTP is unconfigured.

### Frontend State

- **React Query** for all server state (caching, refetch, deduplication)
- **Context API** for: auth (`AuthContext`), store features/onboarding (`AppContext`), permissions (`PermissionsContext`), location (`LocationContext`)
- **Wouter** for routing (lightweight, not React Router)
- **Radix UI + Tailwind CSS 4** for components

## Environment

Copy `.env.example` to `artifacts/api-server/.env`. Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY` (32 chars)
- `REDIS_URL` — optional, falls back to in-memory
- `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY` — for AI features
- `VITE_GOOGLE_CLIENT_ID` — for Google OAuth on the frontend

## Deployment

Production uses PM2 (`ecosystem.config.cjs`) with SSH-based auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`). The deploy script: git pull → pnpm install → build → db push → PM2 restart.

Backend is bundled with esbuild to `dist/index.mjs`; frontend builds to `dist/public/` (served statically).
