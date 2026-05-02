import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // one_time | monthly_fixed | amc | internal
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  description: text("description"),
  status: text("status").notNull().default("active"), // active | completed | on_hold | archived
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  billingModel: text("billing_model").notNull().default("hourly"), // hourly | fixed | retainer
  fixedAllocationHours: text("fixed_allocation_hours"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
