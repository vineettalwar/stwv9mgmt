# STWV Management Platform

Multi-company business management platform for a cross-border group:
**1 German UG (VAT)**, **1 Indian GST company**, and **2 Indian non-GST
companies**. Built as a TypeScript pnpm-workspace monorepo.

> **Quick links** —
> [Architecture](./design.md) ·
> [Roadmap](./roadmap.md) ·
> [Replit operating guide](./replit.md) ·
> [Project memory & conventions](./memory.md) ·
> [Admin guide](./docs/admin-guide.md) ·
> [Testing accounts](./TESTING.md)

---

## What's inside

| Path | Purpose |
|------|---------|
| `artifacts/api-server/` | Express 5 REST API (Clerk-authed, Drizzle ORM) |
| `artifacts/mgmt/` | React + Vite management frontend |
| `artifacts/mockup-sandbox/` | Component preview canvas (design only) |
| `lib/db/` | Drizzle schema + SQL migrations + seed |
| `lib/api-spec/` | OpenAPI spec + Orval codegen config |
| `lib/api-client-react/` | Generated React Query hooks |
| `lib/api-zod/` | Generated Zod validation schemas |
| `scripts/` | Repo-wide helper scripts |

---

## Prerequisites

- **Node.js 24** (the `.replit` file pins this; use `nvm install 24` locally)
- **pnpm** (Corepack: `corepack enable && corepack prepare pnpm@latest --activate`)
- **PostgreSQL 16** (local install, Docker, or any hosted Postgres)
- **Clerk** account — grab a publishable + secret key from the
  [Clerk Dashboard](https://dashboard.clerk.com).

> **Replit users:** Node, pnpm and PostgreSQL are pre-provisioned by the
> `nodejs-24` and `postgresql-16` modules in `.replit`. You don't need to
> install anything yourself.

---

## Local setup (5 steps)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env
# …then edit .env and fill in DATABASE_URL, VITE_CLERK_PUBLISHABLE_KEY,
# CLERK_SECRET_KEY (see .env.example for the full list and descriptions)

# 3. Apply database migrations
pnpm migrate

# 4. (Optional) Seed the 4 STWV companies and 6 dev test accounts
pnpm db:seed

# 5. Start the API server and frontend in two terminals
pnpm --filter @workspace/api-server run dev    # http://localhost:8080
pnpm --filter @workspace/mgmt        run dev    # http://localhost:5173
```

The frontend proxies `/api/*` to the API server. Open
[http://localhost:5173](http://localhost:5173), sign in with one of the
seeded test accounts (see [TESTING.md](./TESTING.md)), and you should land
on `/dashboard`.

---

## Database workflow (migrations only)

The canonical flow is **`drizzle-kit generate` + `drizzle-kit migrate`** —
never `drizzle-kit push` against any real environment.

```bash
# 1. Edit a schema file under lib/db/src/schema/
# 2. Generate a new SQL migration file under lib/db/drizzle/
pnpm db:generate -- --name add_my_column

# 3. Review the generated SQL, commit it, then apply it
pnpm migrate
```

`pnpm migrate` runs against whatever `DATABASE_URL` points at, is
idempotent, and will refuse to silently change schema. The post-merge hook
(`scripts/post-merge.sh`) runs `pnpm migrate` automatically after merges.

> See [memory.md → Database & migrations](./memory.md#database--migrations)
> for the full rationale and gotchas.

---

## Asset rules

- **Images** must live in the repo. Put them under the appropriate
  artifact's `public/` (served as-is) or `src/assets/` (bundled). Do not
  reference remote image URLs from JSX/CSS — that includes hot-linking a
  logo from a vendor site. The only exception is user-entered data such as
  a `logo_url` field on a company form (that's content, not a bundled
  asset).
- **Audio** files should also live in the repo, **unless** they are larger
  than ~10 MB, in which case a remote URL is acceptable. There are no audio
  files in the project today; this rule is forward-looking.

---

## Useful scripts

| Script | What it does |
|--------|--------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run typecheck` | Typecheck every package |
| `pnpm run build` | Typecheck + build every package |
| `pnpm migrate` | Apply pending DB migrations |
| `pnpm db:generate -- --name <name>` | Generate a new migration from schema diffs |
| `pnpm db:seed` | Seed companies, roles, and dev test accounts |
| `pnpm --filter @workspace/api-server run dev` | Start API server |
| `pnpm --filter @workspace/mgmt run dev` | Start frontend |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks + Zod schemas from `openapi.yaml` |

---

## Deployment

The project deploys as an Autoscale deployment on Replit (see
`.replit` → `[deployment]`). The post-build step prunes the pnpm store and
the post-merge hook runs migrations. The Clerk publishable key is auto-
swapped to the live key by Replit on deploy.

For full Replit-specific operating notes — artifacts, ports, preview
routing, and troubleshooting — see [replit.md](./replit.md).

---

## Troubleshooting

- **`DATABASE_URL must be set`** when running anything — copy
  `.env.example` to `.env` and fill in `DATABASE_URL`. On Replit, this is
  set automatically; if it's missing, re-provision the Postgres database
  from the database tool.
- **`Clerk: Missing publishable key`** in the browser — set
  `VITE_CLERK_PUBLISHABLE_KEY` in `.env` and restart the frontend (Vite
  bakes env vars at build time).
- **Port already in use** when starting an artifact — set the `PORT` env
  var, or kill the process holding the port (`lsof -i :8080`).
- **Migrations think the DB is out of sync** — check
  `drizzle.__drizzle_migrations` in your DB; that table tracks applied
  migration hashes. If you've been running `drizzle-kit push` historically,
  the hashes won't be there. Insert the hashes of the existing baseline
  migrations to mark them as applied (see `memory.md` for the snippet).
- **Sign-in succeeds but `/dashboard` is blank** — your Clerk user has no
  matching row in the `users` table. Either sign up with one of the seeded
  `@stwv-dev.com` emails, or set `PLATFORM_ADMIN_EMAILS` to your real
  email and re-sign-in (the `/api/users/me` endpoint auto-promotes
  matching emails to admin).
- **`http-proxy-middleware` errors in the API server** — these come from
  the Clerk frontend-API proxy; they're benign in development if Clerk dev
  keys aren't reachable from your network.

---

## Pushing to GitHub

This repo is wired to push to
[`https://github.com/vineettalwar/stwv9mgmt.git`](https://github.com/vineettalwar/stwv9mgmt.git)
as the `origin` remote. The remote was added by the agent; the actual
push must be run by a maintainer using their own credentials, since
GitHub no longer accepts password-based pushes.

```bash
# One-time, on a developer machine with GitHub access:
git remote -v                          # confirm origin → vineettalwar/stwv9mgmt
git push -u origin main                # uses your GitHub PAT or SSH key
```

If you prefer SSH:

```bash
git remote set-url origin git@github.com:vineettalwar/stwv9mgmt.git
git push -u origin main
```

After the first push, every subsequent `git push` updates GitHub
directly. The README, `design.md`, `roadmap.md`, `replit.md`,
`memory.md`, and `docs/admin-guide.md` will all render on the GitHub
project page.

---

## License

MIT. See `package.json`.
