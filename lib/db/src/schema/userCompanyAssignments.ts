import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

export const userCompanyAssignmentsTable = pgTable(
  "user_company_assignments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.companyId)],
);

export const insertUserCompanyAssignmentSchema = createInsertSchema(userCompanyAssignmentsTable).omit({ id: true, createdAt: true });
export type InsertUserCompanyAssignment = z.infer<typeof insertUserCompanyAssignmentSchema>;
export type UserCompanyAssignment = typeof userCompanyAssignmentsTable.$inferSelect;
