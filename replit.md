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

### projects
- id, name, type (one_time|monthly_fixed|amc|internal), companyId, clientId (nullable), description, status (active|completed|on_hold), billingModel (hourly|fixed|retainer), fixedAllocationHours (text, nullable), startDate, endDate, createdAt, updatedAt

### projectAssignments (junction)
- id, projectId, userId, memberType (employee|freelancer), hourlyRate (text, nullable), monthlyRate (text, nullable), createdAt
- Unique on (projectId, userId)

### timeEntries
- id, projectId, userId, date (YYYY-MM-DD), hours (text), description (nullable), createdAt, updatedAt

### deliverables
- id, projectId, title, description (nullable), status (todo|in_progress|done), assigneeId (nullable), dueDate (nullable), createdAt, updatedAt

### milestones
- id, projectId, title, description (nullable), status (pending|completed), dueDate (nullable), completedAt (nullable), createdAt, updatedAt

### todos
- id, projectId (nullable), clientId (nullable), title, description (nullable), priority (low|medium|high), status (open|done), assigneeId (nullable), dueDate (nullable), completedAt (nullable), createdAt, updatedAt

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

### Projects & Time Tracking (Task 2)
- `GET|POST /projects` — list (role-filtered) / create
- `GET|PATCH|DELETE /projects/:id` — detail / update / delete
- `GET|POST /projects/:id/assignments` — list team members / add
- `DELETE /projects/:id/assignments/:userId` — remove team member
- `GET /projects/:id/billing-summary?month=YYYY-MM` — hours/allocation summary
- `GET|POST /projects/:id/deliverables` — Kanban items
- `PATCH|DELETE /projects/:id/deliverables/:deliverableId` — update / delete deliverable
- `GET|POST /projects/:id/milestones` — milestones
- `PATCH|DELETE /projects/:id/milestones/:milestoneId` — update / delete milestone
- `GET|POST /projects/:id/time-entries` — time entries per project
- `PATCH|DELETE /projects/:id/time-entries/:entryId` — update / delete entry
- `GET /time-entries` — all time entries for current user (or all if admin/accountant)
- `GET|POST /todos` — list (role-filtered) / create
- `PATCH|DELETE /todos/:id` — update / delete todo

### Offers, Contracts & Invoices (Task 3)
- `GET|POST /offers` — list / create offers
- `GET|PATCH|DELETE /offers/:id` — detail / update / delete
- `POST /offers/:id/convert-to-contract` — convert accepted offer to contract
- `GET|POST /contracts` — list / create contracts
- `GET|PATCH|DELETE /contracts/:id` — detail / update / delete
- `GET|POST /contract-templates` — list / create contract templates
- `GET|PATCH|DELETE /contract-templates/:id` — detail / update / delete
- `GET|POST /invoices` — list / create invoices (auto-calculates tax by company taxRegime)
- `GET|PATCH|DELETE /invoices/:id` — detail / update / delete
- `GET /invoices/export/datev` — DATEV CSV export (admin/germany_accountant only)
- `GET /invoices/export/tally?format=xml|csv` — Tally export (admin/india_accountant only)

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
- `/projects` — project list (role-filtered), create/edit, 4 types
- `/projects/:id` — tabbed detail: Overview, Deliverables (Kanban), Milestones, Time Entries, Billing Cycle
- `/time-tracking` — personal time log; admins/accountants see all entries
- `/todos` — task list with priority, due date, toggle done; role-filtered
- `/client-portal` — client view: their projects + deliverable status
- `/freelancer-portal` — freelancer view: assigned projects + time log
- `/documents` — Document Centre: unified cross-entity view of all offers, contracts, and invoices with filtering by type/company/project/client
- `/offers` — offer builder; create/send/accept offers with line items and PDF export; offer→contract conversion
- `/contracts` — contract management; create from offer or scratch, sign/execute, PDF export; contract templates
- `/invoices` — multi-entity invoice management with German VAT (19%) and Indian GST (CGST+SGST/IGST/none based on intra/inter-state auto-detection); DATEV CSV export (admin/germany_accountant), Tally XML/CSV export (admin/india_accountant); recurring invoice scheduler (auto-clones every 6h)

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
