import { pgTable, text, serial, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    legalForm: text("legal_form").notNull(),
    country: text("country").notNull(),
    taxRegime: text("tax_regime").notNull().default("none"), // vat | gst | none
    taxNumber: text("tax_number"),
    address: text("address"),
    bankDetails: text("bank_details"),
    logoUrl: text("logo_url"),
    currency: text("currency").notNull().default("EUR"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("companies_name_unique").on(t.name)],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
