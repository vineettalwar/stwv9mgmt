import { pgTable, serial, timestamp, text, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorRole: text("actor_role").notNull(),
  // Snapshotted at write time so historical rows remain accurate even if the
  // user is later renamed or deleted (DB-level tamper-evident triggers also
  // block UPDATE/DELETE on this table — see migration 0000).
  actorEmail: text("actor_email"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityLabel: text("entity_label"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  projectId: integer("project_id"),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
