# Project memory — STWV Management Platform

Durable conventions, gotchas, and decisions made along the way. Read this
before changing anything that crosses package boundaries.

---

## Naming & code style

- **Tables**: `snake_case` plural (`time_entries`, `audit_logs`).
- **Columns**: `snake_case`. The Drizzle schema files map them to
  `camelCase` TypeScript field names.
- **Drizzle schema variables**: `<name>Table` (e.g. `usersTable`).
- **Roles** (string enum, do not rename without a migration):
  `admin`, `germany_accountant`, `india_accountant`, `project_manager`,
  `client`, `freelancer`.
- **Currencies**: ISO codes (`EUR`, `INR`). Money is stored as
  `numeric(12,2)` and serialized as decimal strings — never JS `number`.
- **Dates**: `YYYY-MM-DD` strings for date-only columns; `timestamptz`
  for timestamps.
- **Files**: one schema per table, one route module per resource.

## Database & migrations

- Canonical workflow: **`drizzle-kit generate` + `drizzle-kit migrate`**.
- `drizzle-kit push` is **not used** anywhere in this repo. Don't add it
  back. The `lib/db` package no longer exposes a `push` script.
- Run `pnpm db:generate -- --name <description>` after editing any file
  in `lib/db/src/schema/`. Review the generated SQL before committing.
- Run `pnpm migrate` to apply pending migrations. Idempotent. Wired into
  `scripts/post-merge.sh` so deploys/merges always migrate.
- Custom (non-drizzle-generated) migrations — like trigger creation —
  go in their own SQL file and must be added to
  `lib/db/drizzle/meta/_journal.json`. See
  `0001_audit_logs_triggers.sql` for the pattern.
- **Existing-DB-without-migration-history bootstrap**: if a database was
  set up via `push` before this repo enforced migrations, the
  `drizzle.__drizzle_migrations` table won't exist. Bootstrap it like so
  (hashes are SHA-256 of the migration SQL files; recompute with
  `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('lib/db/drizzle/0000_baseline.sql')).digest('hex'))"`):

  ```sql
  CREATE SCHEMA IF NOT EXISTS drizzle;
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
  );
  INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
    ('<sha256-of-0000_baseline.sql>',         1777796406603),
    ('<sha256-of-0001_audit_logs_triggers.sql>', 1777796406604);
  ```

- **Audit log is append-only at the DB layer** via two triggers
  (`audit_logs_no_update`, `audit_logs_no_delete`). Don't try to
  `UPDATE`/`DELETE` rows — the DB will raise. If you need to redact
  something, add a new "redaction" event row instead.

## Assets

- **Images live in the repo.** Bundle under
  `artifacts/<artifact>/src/assets/` or place under
  `artifacts/<artifact>/public/`. Never `<img src="https://...">` in
  source. Exception: user-entered data (e.g. `companies.logo_url`) is
  content, not a bundled asset.
- **Audio**: keep in the repo unless > 10 MB, in which case a remote URL
  is acceptable. No audio today; rule is forward-looking.
- The `https://example.com/logo.png` placeholder you'll see inside
  Company form inputs is a UX hint, not a real reference. Leave it.

## Auth & users

- Clerk is the only identity provider. We never store passwords.
- The `users.clerk_user_id` column links a Clerk account to a platform
  user row. Pre-seeded test accounts use `pending:<email>` as a
  placeholder; the API rewrites it to the real Clerk id on first
  sign-in.
- Default role for any new sign-up not in the seed list is `freelancer`.
  Promote via the admin UI or via `PLATFORM_ADMIN_EMAILS`.
- `GET /api/users/me` is the auto-bootstrap path: it creates a `users`
  row on first hit if one doesn't exist, and auto-promotes admins listed
  in `PLATFORM_ADMIN_EMAILS`.

## API spec & codegen

- `lib/api-spec/openapi.yaml` is the single source of truth for the API.
- After editing the spec: `pnpm --filter @workspace/api-spec run codegen`
  then `pnpm run typecheck`. Typecheck failures are the canary for
  consumers that need updating.
- `lib/api-zod/src/index.ts` should only re-export
  `./generated/api`. Don't add hand-written exports there — they get
  out of sync.

## Tax engine

- Germany VAT: flat 19% on invoice subtotal for STWV UG.
- India GST: auto-detection by buyer/seller state code in the GSTIN.
  Same state → CGST 9% + SGST 9%. Different state → IGST 18%.
- Non-GST entities → no tax.
- Add new tax cases in `artifacts/api-server/src/lib/tax/` with a unit
  test alongside; the engine is intentionally pure so it's easy to test.

## Background jobs

- **Recurring invoice scheduler** runs inside the api-server process via
  `setInterval` every 6h. Don't move it to a separate worker without
  thinking about Autoscale (multiple instances → duplicate clones).
  Current handler is idempotent on `(template_invoice_id, period_key)`.

## Logging

- `pino` everywhere. Never `console.log` from request handlers — pino
  pretty-prints in dev and ships JSON in prod.
- Never log a Clerk JWT, Clerk secret key, Resend API key, or
  `DATABASE_URL`. The `pino` redactor is configured for the obvious
  fields; if you add a new sensitive field, extend the redactor.

## Frontend conventions

- Use generated React Query hooks from `@workspace/api-client-react`.
  Don't `fetch` directly except inside `ApiTokenBridge`.
- shadcn components live in `artifacts/mgmt/src/components/ui/`. Don't
  edit them by hand unless you'd accept the divergence forever — instead
  wrap or extend.
- Toasts: use `sonner` (`toast.success`, `toast.error`). Don't sprinkle
  alert dialogs for transient feedback.
- Forms: `react-hook-form` + `@hookform/resolvers/zod` against the
  generated Zod schemas where possible.

## Deployment notes

- Deploy target: Autoscale (`.replit` → `[deployment]`).
- The Clerk publishable key in `.replit` is a **dev** key. Replit auto-
  swaps to the live key on deploy via secret injection — don't paste
  prod keys into the file.
- `scripts/post-merge.sh` runs `pnpm install --frozen-lockfile` and
  `pnpm migrate`. Anything else (data backfills, etc.) should be a
  one-off script in `scripts/` that you invoke manually, not added here.

## Things future-me should not forget

- The `drizzle.config.ts` file throws on import if `DATABASE_URL` is
  missing. CI / local scripts that don't need a DB will fail to even
  load the config — set the var or shadow the file.
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (24h). If a
  fresh package install errors with "package too new", wait or add to
  `minimumReleaseAgeExclude`.
- Vite bakes `import.meta.env.VITE_*` at build time. Changing
  `VITE_CLERK_PUBLISHABLE_KEY` requires a frontend restart, not just a
  page refresh.
- Wouter doesn't have nested routes; we fake them with prefix matching
  inside `App.tsx`. Keep that simple — don't reach for a router lib.
