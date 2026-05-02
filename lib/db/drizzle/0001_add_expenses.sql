-- Migration: add expenses table for project expense tracking.
-- Idempotent: safe to run against a database that already has the table.

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "created_by" integer,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "category" text NOT NULL DEFAULT 'other',
  "description" text NOT NULL,
  "date" text NOT NULL,
  "is_billable" boolean NOT NULL DEFAULT false,
  "invoiced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_project_idx" ON "expenses" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_date_idx" ON "expenses" ("date");
