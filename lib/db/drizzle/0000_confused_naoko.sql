-- Additive migration: adds the audit_logs table only.
-- Pre-existing schema (companies, users, projects, offers, contracts,
-- invoices, etc.) is assumed to already exist; this migration must apply
-- cleanly to a populated database. Use `drizzle-kit push` for local dev or
-- this SQL for production rollout.

CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "actor_id" integer,
        "actor_role" text NOT NULL,
        "action" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "entity_label" text,
        "old_value" jsonb,
        "new_value" jsonb,
        "project_id" integer
);
--> statement-breakpoint
DO $$ BEGIN
        ALTER TABLE "audit_logs"
                ADD CONSTRAINT "audit_logs_actor_id_users_id_fk"
                FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
                ON DELETE set null ON UPDATE no action;
EXCEPTION
        WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_project_idx" ON "audit_logs" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
