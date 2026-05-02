import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const complianceChecklistsTable = pgTable("compliance_checklists", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  regime: text("regime").notNull(), // germany | india
  year: integer("year").notNull(),
  quarter: integer("quarter"), // 1-4 or null for annual
  month: integer("month"), // 1-12 for monthly items
  itemKey: text("item_key").notNull(), // e.g. vat_return_q1, gstr_3b_jan, annual_k_steuer
  itemLabel: text("item_label").notNull(), // Human-readable label
  deadline: text("deadline").notNull(), // YYYY-MM-DD
  status: text("status").notNull().default("pending"), // pending | filed | overdue
  responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  filedAt: timestamp("filed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertComplianceChecklistSchema = createInsertSchema(complianceChecklistsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceChecklist = z.infer<typeof insertComplianceChecklistSchema>;
export type ComplianceChecklist = typeof complianceChecklistsTable.$inferSelect;
