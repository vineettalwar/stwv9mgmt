import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const invoiceSequencesTable = pgTable(
  "invoice_sequences",
  {
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    nextSeq: integer("next_seq").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.year] })],
);
