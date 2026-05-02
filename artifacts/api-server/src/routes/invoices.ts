import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  pool,
  invoicesTable,
  invoiceLineItemsTable,
  companiesTable,
  usersTable,
  projectsTable,
  timeEntriesTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
const TAX_TYPES = ["none", "vat", "cgst_sgst", "igst"] as const;

const ADMIN_PM_ACCT = ["admin", "project_manager", "germany_accountant", "india_accountant"];

const LineItemSchema = z.object({
  timeEntryId: z.number().int().nullable().optional(),
  description: z.string().min(1),
  quantity: z.string().default("1"),
  unitPrice: z.string().default("0"),
  sortOrder: z.number().int().optional(),
});

const CreateInvoiceBody = z.object({
  companyId: z.number().int(),
  projectId: z.number().int().nullable().optional(),
  clientId: z.number().int().nullable().optional(),
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  issueDate: z.string(),
  dueDate: z.string().nullable().optional(),
  taxType: z.enum(TAX_TYPES).optional(),
  sellerState: z.string().nullable().optional(),
  buyerState: z.string().nullable().optional(),
  currency: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurringInterval: z.string().nullable().optional(),
  lineItems: z.array(LineItemSchema).optional(),
});

function addInterval(dateStr: string, interval: string): string {
  const date = new Date(dateStr);
  if (interval === "quarterly") {
    date.setMonth(date.getMonth() + 3);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function determineTaxRate(taxType: string): number {
  if (taxType === "vat") return 19;
  if (taxType === "cgst_sgst" || taxType === "igst") return 18;
  return 0;
}

function determineTaxType(taxRegime: string, sellerState?: string | null, buyerState?: string | null): string {
  if (taxRegime === "vat") return "vat";
  if (taxRegime === "gst") {
    // Intra-state (same state) → CGST+SGST; inter-state (different states or buyer state unknown) → IGST
    if (sellerState && buyerState) {
      return sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase() ? "cgst_sgst" : "igst";
    }
    return "cgst_sgst"; // default to intra-state when states unknown
  }
  return "none";
}

async function generateInvoiceNumber(companyId: number, taxRegime: string, year: number): Promise<string> {
  const result = await pool.query<{ next_seq: number }>(
    `INSERT INTO invoice_sequences (company_id, year, next_seq)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, year)
     DO UPDATE SET next_seq = invoice_sequences.next_seq + 1
     RETURNING next_seq`,
    [companyId, year],
  );
  const seq = result.rows[0].next_seq;
  const seqStr = String(seq).padStart(3, "0");
  if (taxRegime === "vat") return `DE-${year}-${seqStr}`;
  if (taxRegime === "gst") return `IN-GST-${year}-${seqStr}`;
  return `IN-${year}-${seqStr}`;
}

async function computeTotals(
  lineItems: Array<{ quantity: string; unitPrice: string }>,
  taxRate: number,
) {
  const subtotal = lineItems.reduce((sum, li) => {
    return sum + parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0");
  }, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;
  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  };
}

async function getInvoiceWithDetails(invoiceId: number) {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return null;

  const lineItems = await db
    .select()
    .from(invoiceLineItemsTable)
    .where(eq(invoiceLineItemsTable.invoiceId, invoiceId))
    .orderBy(invoiceLineItemsTable.sortOrder);

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, invoice.companyId));

  let client = null;
  if (invoice.clientId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, invoice.clientId));
    client = u ?? null;
  }

  let project = null;
  if (invoice.projectId) {
    const [p] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, invoice.projectId));
    project = p ?? null;
  }

  return { ...invoice, lineItems, company, client, project };
}

// LIST invoices
router.get("/invoices", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const statusFilter = req.query.status as string | undefined;
  const companyFilter = req.query.companyId ? parseInt(String(req.query.companyId)) : undefined;

  let query = db.select().from(invoicesTable);
  const conditions = [];

  if (statusFilter) conditions.push(eq(invoicesTable.status, statusFilter));
  if (companyFilter) conditions.push(eq(invoicesTable.companyId, companyFilter));

  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(invoicesTable.id)
    : await query.orderBy(invoicesTable.id);

  const invoices = await Promise.all(rows.map(r => getInvoiceWithDetails(r.id)));
  res.json(invoices.filter(Boolean));
});

// CREATE invoice
router.post("/invoices", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { lineItems = [], ...invoiceData } = parsed.data;

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, invoiceData.companyId));
  if (!company) { res.status(400).json({ error: "Company not found" }); return; }

  const taxType = invoiceData.taxType ?? determineTaxType(company.taxRegime, invoiceData.sellerState, invoiceData.buyerState);
  const taxRate = determineTaxRate(taxType);
  const totals = await computeTotals(lineItems, taxRate);

  const invoiceNumber = await generateInvoiceNumber(company.id, company.taxRegime, new Date().getFullYear());

  const initialNextInvoiceDate =
    invoiceData.isRecurring && invoiceData.recurringInterval && invoiceData.issueDate
      ? addInterval(invoiceData.issueDate, invoiceData.recurringInterval)
      : null;

  const [invoice] = await db.insert(invoicesTable).values({
    ...invoiceData,
    invoiceNumber,
    taxType,
    taxRate: taxRate.toFixed(2),
    currency: invoiceData.currency ?? company.currency,
    nextInvoiceDate: initialNextInvoiceDate,
    createdBy: user.id,
    ...totals,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(invoiceLineItemsTable).values(
      lineItems.map((li, idx) => ({
        invoiceId: invoice.id,
        timeEntryId: li.timeEntryId ?? null,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: (parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0")).toFixed(2),
        sortOrder: li.sortOrder ?? idx,
      }))
    );
  }

  const full = await getInvoiceWithDetails(invoice.id);
  res.status(201).json(full);
});

// GET invoice
router.get("/invoices/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithDetails(id);
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }
  res.json(invoice);
});

// UPDATE invoice
router.patch("/invoices/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    title: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
    issueDate: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    isRecurring: z.boolean().optional(),
    recurringInterval: z.string().nullable().optional(),
    nextInvoiceDate: z.string().nullable().optional(),
    lineItems: z.array(LineItemSchema).optional(),
  });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { lineItems, ...invoiceData } = parsed.data;

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let totals = {};
  if (lineItems !== undefined) {
    const taxRate = determineTaxRate(existing.taxType);
    totals = await computeTotals(lineItems, taxRate);

    await db.delete(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
    if (lineItems.length > 0) {
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li, idx) => ({
          invoiceId: id,
          timeEntryId: li.timeEntryId ?? null,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: (parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0")).toFixed(2),
          sortOrder: li.sortOrder ?? idx,
        }))
      );
    }
  }

  await db.update(invoicesTable).set({ ...invoiceData, ...totals, updatedAt: new Date() }).where(eq(invoicesTable.id, id));
  const full = await getInvoiceWithDetails(id);
  res.json(full);
});

// DELETE invoice
router.delete("/invoices/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.sendStatus(204);
});

// DATEV export — German invoices
router.get("/invoices/export/datev", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "germany_accountant"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const companies = await db.select().from(companiesTable).where(eq(companiesTable.taxRegime, "vat"));
  const companyIds = companies.map(c => c.id);

  if (companyIds.length === 0) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=datev_export.csv");
    res.send("Belegdatum;Buchungstext;Betrag;Steuersatz;Steuerbetrag;Waehrung;Rechnungsnummer;Debitor\n");
    return;
  }

  const invoices = await db.select().from(invoicesTable).where(inArray(invoicesTable.companyId, companyIds));
  const fullInvoices = await Promise.all(invoices.map(i => getInvoiceWithDetails(i.id)));

  function csvSemicolon(val: string | number | null | undefined): string {
    const s = String(val ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const header = "Belegdatum;Buchungstext;Betrag;Steuersatz;Steuerbetrag;Waehrung;Rechnungsnummer;Debitor";
  const rows = fullInvoices.filter(Boolean).map(inv => {
    const clientName = inv!.client
      ? [inv!.client.firstName, inv!.client.lastName].filter(Boolean).join(" ") || inv!.client.email
      : "";
    return [
      csvSemicolon(inv!.issueDate),
      csvSemicolon(inv!.title),
      csvSemicolon(inv!.totalAmount),
      csvSemicolon(`${inv!.taxRate}%`),
      csvSemicolon(inv!.taxAmount),
      csvSemicolon(inv!.currency),
      csvSemicolon(inv!.invoiceNumber),
      csvSemicolon(clientName),
    ].join(";");
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=datev_export.csv");
  res.send([header, ...rows].join("\n"));
});

// Tally export — Indian invoices
router.get("/invoices/export/tally", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "india_accountant"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const format = (req.query.format as string) ?? "xml";

  const companies = await db.select().from(companiesTable).where(eq(companiesTable.taxRegime, "gst"));
  const noneCompanies = await db.select().from(companiesTable).where(eq(companiesTable.taxRegime, "none"));
  const allCompanies = [...companies, ...noneCompanies].filter(c => c.country === "India" || c.currency === "INR");
  const companyIds = allCompanies.map(c => c.id);

  if (companyIds.length === 0) {
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=tally_export.csv");
      res.send("Date,Voucher No,Party Name,Amount,CGST,SGST,IGST,Total\n");
      return;
    }
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", "attachment; filename=tally_export.xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>');
    return;
  }

  const invoices = await db.select().from(invoicesTable).where(inArray(invoicesTable.companyId, companyIds));
  const fullInvoices = await Promise.all(invoices.map(i => getInvoiceWithDetails(i.id)));
  const valid = fullInvoices.filter(Boolean);

  function csvComma(val: string | number | null | undefined): string {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function xmlEsc(val: string | number | null | undefined): string {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  if (format === "csv") {
    const header = "Date,Voucher No,Party Name,Amount,CGST,SGST,IGST,Total";
    const rows = valid.map(inv => {
      const clientName = inv!.client
        ? [inv!.client.firstName, inv!.client.lastName].filter(Boolean).join(" ") || inv!.client.email
        : "";
      const isCgstSgst = inv!.taxType === "cgst_sgst";
      const isIgst = inv!.taxType === "igst";
      const halfTax = (parseFloat(inv!.taxAmount) / 2).toFixed(2);
      return [
        csvComma(inv!.issueDate),
        csvComma(inv!.invoiceNumber),
        csvComma(clientName),
        csvComma(inv!.subtotal),
        csvComma(isCgstSgst ? halfTax : "0.00"),
        csvComma(isCgstSgst ? halfTax : "0.00"),
        csvComma(isIgst ? inv!.taxAmount : "0.00"),
        csvComma(inv!.totalAmount),
      ].join(",");
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=tally_export.csv");
    res.send([header, ...rows].join("\n"));
    return;
  }

  // XML format
  const voucherXml = valid.map(inv => {
    const clientName = inv!.client
      ? [inv!.client.firstName, inv!.client.lastName].filter(Boolean).join(" ") || inv!.client.email
      : "Unknown";
    const isCgstSgst = inv!.taxType === "cgst_sgst";
    const isIgst = inv!.taxType === "igst";
    const halfTax = (parseFloat(inv!.taxAmount) / 2).toFixed(2);
    return `<VOUCHER>
  <DATE>${xmlEsc(inv!.issueDate)}</DATE>
  <VOUCHERNUMBER>${xmlEsc(inv!.invoiceNumber)}</VOUCHERNUMBER>
  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <PARTYLEDGERNAME>${xmlEsc(clientName)}</PARTYLEDGERNAME>
  <AMOUNT>${xmlEsc(inv!.subtotal)}</AMOUNT>
  ${isCgstSgst ? `<CGST>${xmlEsc(halfTax)}</CGST><SGST>${xmlEsc(halfTax)}</SGST>` : ""}
  ${isIgst ? `<IGST>${xmlEsc(inv!.taxAmount)}</IGST>` : ""}
  <TOTALAMOUNT>${xmlEsc(inv!.totalAmount)}</TOTALAMOUNT>
  <CURRENCY>${xmlEsc(inv!.currency)}</CURRENCY>
</VOUCHER>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        ${voucherXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=tally_export.xml");
  res.send(xml);
});

export default router;
