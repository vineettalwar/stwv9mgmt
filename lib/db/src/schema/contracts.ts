import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";
import { projectsTable } from "./projects";
import { offersTable } from "./offers";

export const contractTemplatesTable = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // client_service | freelancer_service
  content: text("content").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull(),
  type: text("type").notNull(), // client_service | freelancer_service
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => usersTable.id, { onDelete: "set null" }),
  offerId: integer("offer_id").references(() => offersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"), // draft | sent | signed | cancelled
  signedAt: timestamp("signed_at", { withTimezone: true }),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type ContractTemplate = typeof contractTemplatesTable.$inferSelect;
export type Contract = typeof contractsTable.$inferSelect;
