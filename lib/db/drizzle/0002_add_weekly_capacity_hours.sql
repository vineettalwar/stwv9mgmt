-- Migration: add weekly_capacity_hours to users table for resource capacity planning.
-- Idempotent: safe to run against a database that already has the column.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "weekly_capacity_hours" integer NOT NULL DEFAULT 40;
