#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Idempotent migrations for tables not managed by drizzle-kit push
psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS invoice_sequences (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, year)
);
SQL
