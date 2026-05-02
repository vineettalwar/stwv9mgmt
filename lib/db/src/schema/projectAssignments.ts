import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const projectAssignmentsTable = pgTable(
  "project_assignments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    memberType: text("member_type").notNull().default("employee"), // employee | freelancer
    hourlyRate: text("hourly_rate"),
    monthlyRate: text("monthly_rate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.userId)],
);

export const insertProjectAssignmentSchema = createInsertSchema(
  projectAssignmentsTable,
).omit({ id: true, createdAt: true });
export type InsertProjectAssignment = z.infer<typeof insertProjectAssignmentSchema>;
export type ProjectAssignment = typeof projectAssignmentsTable.$inferSelect;
