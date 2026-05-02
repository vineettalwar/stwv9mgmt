/**
 * user_roles — reference/lookup table for the platform's defined roles.
 * Acts as a FK target for users.role and provides display metadata.
 * The set of valid roles is fixed at the platform level.
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const PLATFORM_ROLES = [
  "admin",
  "germany_accountant",
  "india_accountant",
  "project_manager",
  "client",
  "freelancer",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const userRolesTable = pgTable("user_roles", {
  role: text("role").primaryKey(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRole = typeof userRolesTable.$inferSelect;

export const ROLE_DISPLAY_NAMES: Record<PlatformRole, { displayName: string; description: string }> = {
  admin: {
    displayName: "Administrator",
    description: "Full platform access — user management, all companies, settings",
  },
  germany_accountant: {
    displayName: "Germany Accountant",
    description: "Manages STWV UG (Germany VAT) — invoices, DATEV export",
  },
  india_accountant: {
    displayName: "India Accountant",
    description: "Manages Indian entities — invoices, GST/Tally export",
  },
  project_manager: {
    displayName: "Project Manager",
    description: "Manages projects, hours tracking, team assignments",
  },
  client: {
    displayName: "Client",
    description: "Limited portal — view own invoices and assigned projects",
  },
  freelancer: {
    displayName: "Freelancer",
    description: "Limited portal — log hours, view own assignments",
  },
};
