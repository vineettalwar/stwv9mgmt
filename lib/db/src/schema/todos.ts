import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const todosTable = pgTable("todos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, {
    onDelete: "cascade",
  }),
  clientId: integer("client_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  status: text("status").notNull().default("open"), // open | done
  assigneeId: integer("assignee_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  dueDate: text("due_date"), // YYYY-MM-DD
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTodoSchema = createInsertSchema(todosTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTodo = z.infer<typeof insertTodoSchema>;
export type Todo = typeof todosTable.$inferSelect;
