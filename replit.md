# STWV Management Platform

## Overview

Multi-company business management platform for a cross-border group: 1 German UG (VAT), 1 Indian GST company, and 2 Indian non-GST companies. Built as a pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec → React hooks + Zod schemas)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (Replit-managed, `@clerk/react` + `@clerk/express`)
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui + wouter + TanStack Query

## Workspace Structure

```
artifacts/
  api-server/       — Express 5 REST API (port via $PORT)
  mgmt/             — React+Vite management frontend (preview path: /)
lib/
  api-client-react/ — Orval-generated React Query hooks
  api-spec/         — OpenAPI spec + orval config
  api-zod/          — Orval-generated Zod validation schemas
  db/               — Drizzle ORM schema + migrations
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema

### companies
- id, name, legalForm, country, taxRegime (vat|gst|none), taxNumber, address, bankDetails, currency (EUR|INR), isActive, createdAt, updatedAt

### users
- id, clerkUserId, email, firstName, lastName, role (admin|germany_accountant|india_accountant|project_manager|client|freelancer), isActive, createdAt, updatedAt

### userCompanyAssignments (junction)
- id, userId, companyId, createdAt

## Seeded Companies

1. STWV UG — Germany, VAT, EUR
2. STWV Technologies Pvt Ltd (GST) — India, GST, INR
3. STWV Consulting (Non-GST A) — India, none, INR
4. STWV Services (Non-GST B) — India, none, INR

## API Routes

All routes require Clerk auth (Bearer token). Prefix: `/api`

- `GET /healthz` — health check
- `GET|POST /companies` — list / create
- `GET|PATCH|DELETE /companies/:id` — detail / update / delete
- `GET|POST /users` — list / create
- `GET /users/me` — current user from Clerk JWT
- `GET|PATCH|DELETE /users/:id` — detail / update / delete
- `GET|POST /users/:id/companies` — list / assign companies
- `DELETE /users/:id/companies/:companyId` — remove assignment
- `GET /dashboard/stats` — aggregated counts by role and country

## Frontend Pages

- `/` → redirects to `/dashboard`
- `/sign-in` — Clerk sign-in
- `/sign-up` — Clerk sign-up
- `/dashboard` — stats overview (companies, users by role, by country)
- `/companies` — list of all 4 entities with tax regime badges
- `/companies/:id` — detail + inline edit form + delete
- `/users` — searchable user table with role badges
- `/users/:id` — user detail + edit + company assignment management
- `/settings` — current user profile + sign out

## Auth Notes

- Clerk dev keys used in development; live keys auto-swapped on deploy
- `ApiTokenBridge` component passes Clerk JWT to all API calls via `setAuthTokenGetter`
- `ClerkProviderWithRouter` wraps inside `WouterRouter` so `useLocation` works correctly
- `PrivateRoute` uses `useAuth().isSignedIn` (not `SignedIn`/`SignedOut` components — not exported in @clerk/react v6)

## RBAC (Role-Based Access Control)

### Server-side (`artifacts/api-server/src/middlewares/requireRole.ts`)
- `requireAuth` — any authenticated Clerk user
- `requireReader` — admin, germany_accountant, india_accountant, project_manager
- `requireAdmin` — admin only
- `loadDbUser` — loads `req.dbUser` from DB by Clerk userId (returns 403 if user not in platform)

Applied to routes:
- GET /companies, /companies/:id, /dashboard/stats → `requireReader`
- POST/PATCH/DELETE /companies → `requireAdmin`
- GET /users → `requireAdmin`
- POST /users (self-register), GET /users/me → `requireAuth`
- GET/PATCH/DELETE /users/:id → admin or self only
- GET/POST/DELETE /users/:id/companies → admin or self only

### Frontend (`artifacts/mgmt/src/App.tsx`)
- `PrivateRoute` accepts `allowedRoles?: UserRole[]`; fetches `useGetMe()` and redirects non-permitted roles to /dashboard
- /users, /users/:id → admin only
- /dashboard, /companies, /companies/:id → staff roles (admin + accountants + project_manager)
- /settings → all roles

### Sidebar (`artifacts/mgmt/src/components/layout/Sidebar.tsx`)
- Calls `useGetMe()` and filters navigation items by the user's role
- Shows user name, email, role label, and sign-out button at the bottom

## Seed Script

```bash
pnpm --filter @workspace/db run seed
```
Creates the 4 company entities if they don't already exist (idempotent via `onConflictDoNothing`).

## Codegen Notes

After changing `lib/api-spec/openapi.yaml`:
1. Run `pnpm --filter @workspace/api-spec run codegen`
2. Verify `lib/api-zod/src/index.ts` exports `export * from "./generated/api";` only (no stale refs)
3. Run `pnpm run typecheck` to confirm clean build
