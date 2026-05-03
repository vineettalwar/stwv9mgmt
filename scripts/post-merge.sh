#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply any new Drizzle migrations against the configured DATABASE_URL.
# All schema changes are tracked as files under lib/db/drizzle/.
# This is idempotent — drizzle-kit migrate skips migrations already applied.
pnpm --filter @workspace/db run migrate
