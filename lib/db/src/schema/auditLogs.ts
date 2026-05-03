import { pgTable, serial, timestamp, text, integer, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
    actorRole: text("actor_role").notNull(),
    // Snapshotted at write time so historical rows remain accurate even if the
    // user is later renamed or deleted (DB-level tamper-evident triggers also
    // block UPDATE/DELETE on this table — see migration 0001).
    actorEmail: text("actor_email"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    entityLabel: text("entity_label"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    projectId: integer("project_id"),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_project_idx").on(t.projectId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
