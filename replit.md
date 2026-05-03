# STWV Management Platform — Replit operating guide

Day-to-day notes for running this project **on Replit**. For the
high-level overview see [README.md](./README.md); for architecture
[design.md](./design.md); for conventions [memory.md](./memory.md);
for end-user docs [docs/admin-guide.md](./docs/admin-guide.md).

---

## What this app is

Multi-company business management platform for a cross-border group:
**1 German UG (VAT)**, **1 Indian GST company**, **2 Indian non-GST
companies**. Built as a TypeScript pnpm-workspace monorepo.

## Stack

- **Monorepo**: pnpm workspaces (Node.js 24, TypeScript 5.9)
- **API**: Express 5, esbuild bundle, Pino logging
- **Database**: PostgreSQL 16 + Drizzle ORM (migrations only — no `push`)
- **Validation**: Zod + drizzle-zod, generated from OpenAPI by Orval
- **Auth**: Clerk (`@clerk/express` server, `@clerk/react` client)
- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + wouter +
  TanStack Query

## Workspace layout

```
artifacts/
  api-server/        Express REST API     (preview path: /api)
  mgmt/              React + Vite frontend (preview path: /)
  mockup-sandbox/    Component canvas      (preview path: /__mockup)
lib/
  db/                Drizzle schema, migrations, seed
  api-spec/          OpenAPI 3.1 spec + Orval config
  api-client-react/  Generated React Query hooks
  api-zod/           Generated Zod schemas
scripts/             Repo-wide helper scripts
```

---

## Artifacts & ports

This project uses **path-based artifact routing**. The Replit preview
proxies each path to the right artifact's port; ports are assigned per
artifact via `$PORT` and you should never hard-code one.

| Artifact | Preview path | Notes |
|----------|--------------|-------|
| `mgmt` | `/` | Vite dev server, allows all hosts (proxied iframe) |
| `api-server` | `/api` | Express, mounts everything under `/api/*` |
| `mockup-sandbox` | `/__mockup` | Design-only; not user-facing |

The **mgmt** frontend reaches the API via `/api/*` (path-based, no
CORS gymnastics). When debugging from a shell, use
`$REPLIT_DEV_DOMAIN/api/...`.

## Workflows

Workflows are auto-created from `artifact.toml` files. The relevant
ones are:

- **API Server** — `pnpm --filter @workspace/api-server run dev`
- **web** (mgmt) — `pnpm --filter @workspace/mgmt run dev`
- **Component Preview Server** — `pnpm --filter @workspace/mockup-sandbox run dev`

Restart a workflow from the Workflows panel after `package.json` or
schema changes. Hot reload covers the rest.

## Environment variables & secrets

Required (per [`.env.example`](./.env.example)):

- `DATABASE_URL` — Postgres connection (provisioned by the `postgresql-16` module).
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (frontend).
  Bake-time only; restart the `web` workflow after changing.
- `CLERK_SECRET_KEY` — Clerk secret key (server). Set as a Replit Secret
  so it never lands in the repo.

Optional:

- `PLATFORM_ADMIN_EMAILS` — comma-separated allow-list of admin emails
  auto-promoted on first sign-in.
- `PLATFORM_ADMIN_CLERK_ID` + `PLATFORM_ADMIN_EMAIL` — alternative
  bootstrap path used by the seed script.
- `RESEND_API_KEY` — outbound email; if unset, emails are logged.

> The Clerk publishable key in `.replit` (`[userenv.shared]`) is a
> **dev** key. Replit auto-swaps it to the live key on deploy via
> Secrets. Do not paste prod keys into `.replit`.

## Database setup

```bash
pnpm migrate            # apply pending migrations
pnpm db:seed            # seed companies + dev test accounts (idempotent)
```

To add a new schema change:

```bash
# 1. Edit a file under lib/db/src/schema/
# 2. Generate the SQL
pnpm db:generate -- --name add_my_column
# 3. Review the generated SQL under lib/db/drizzle/, commit, then apply
pnpm migrate
```

The post-merge hook (`scripts/post-merge.sh`) runs `pnpm migrate`
automatically after every merge, so the deployed DB stays in sync.

> **Don't run `drizzle-kit push`.** It's not in any script and shouldn't
> be added back — see [memory.md → Database & migrations](./memory.md#database--migrations)
> for the rationale.

## Codegen

After changing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

`lib/api-zod/src/index.ts` should only re-export `./generated/api`. Any
hand-written exports there will drift.

## Deployment

- **Target**: Autoscale (`.replit` → `[deployment]`).
- **Post-build**: `pnpm store prune` (frees disk for the deploy image).
- **Post-merge**: `scripts/post-merge.sh` → `pnpm install --frozen-lockfile`
  + `pnpm migrate`.
- **Clerk keys**: dev key in `.replit`, live key auto-swapped via Replit
  Secrets at deploy time.

## Troubleshooting on Replit

- **Preview pane is blank** — check the workflow is running and not
  crash-looping (Workflows panel → console). The most common cause is a
  hard-coded port; the dev server must read `$PORT`.
- **CORS / iframe errors in mgmt** — Vite must allow all hosts. The
  `mgmt` `vite.config.ts` already sets `server.allowedHosts: true`.
- **Clerk dev keys "not authorised for this domain"** — open the Clerk
  Dashboard → Domains → add your `replit.dev` URL.
- **`DATABASE_URL must be set`** — re-provision the Postgres module from
  the database tool, or check `.env`.
- **`pnpm migrate` errors with "table already exists"** — the DB was
  bootstrapped via the legacy `push` flow, so the
  `drizzle.__drizzle_migrations` table is missing the baseline hash. See
  [memory.md → Database & migrations](./memory.md#database--migrations)
  for the bootstrap snippet.
- **"Sign-in succeeded but I see nothing"** — your Clerk user has no
  `users` row. Sign up with one of the `@stwv-dev.com` test emails (see
  [TESTING.md](./TESTING.md)) or set `PLATFORM_ADMIN_EMAILS` to your
  email and re-sign-in.
- **Recurring invoice clones missing** — the scheduler runs every 6h
  inside the api-server process. After a long idle period, restart the
  API Server workflow to kick the loop.

## Reference: data model & API surface

The full schema, route list, and page→role matrix have moved to
[design.md](./design.md). Quick pointers:

- **23 tables** under `lib/db/src/schema/` (one file per table).
- **API routes** mounted under `/api/*` from
  `artifacts/api-server/src/routes/index.ts`.
- **Frontend pages** registered in `artifacts/mgmt/src/App.tsx`.

If you only need a list of seeded entities or test accounts, see
[TESTING.md](./TESTING.md).
