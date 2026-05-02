import { Router, type IRouter } from "express";
import { eq, and, inArray, or } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { pdfToBuffer } from "../lib/pdfBuffer";
import { sendDocumentEmail } from "../lib/emailService";
import {
  db,
  pool,
  invoicesTable,
  invoiceLineItemsTable,
  companiesTable,
  usersTable,
  projectsTable,
  timeEntriesTable,
  userCompanyAssignmentsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";
import { logAudit, logAuditTx } from "../lib/auditLogger";

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
  const isStaff = ADMIN_PM_ACCT.includes(user.role);
  const isClient = user.role === "client";
  if (!isStaff && !isClient) { res.status(403).json({ error: "Forbidden" }); return; }

  const statusFilter = req.query.status as string | undefined;
  const companyFilter = req.query.companyId ? parseInt(String(req.query.companyId)) : undefined;

  let query = db.select().from(invoicesTable);
  const conditions = [];

  if (isClient) {
    // Clients see invoices for companies they are assigned to, OR invoices directly addressed to them
    const assignments = await db
      .select({ companyId: userCompanyAssignmentsTable.companyId })
      .from(userCompanyAssignmentsTable)
      .where(eq(userCompanyAssignmentsTable.userId, user.id));
    const clientCompanyIds = assignments.map(a => a.companyId);
    if (clientCompanyIds.length > 0) {
      // inArray on companyId covers company-scoped invoices; clientId check covers directly addressed ones
      conditions.push(or(
        inArray(invoicesTable.companyId, clientCompanyIds),
        eq(invoicesTable.clientId, user.id),
      )!);
    } else {
      // No companies assigned — only show invoices directly addressed to this client
      conditions.push(eq(invoicesTable.clientId, user.id));
    }
  }

  if (statusFilter) conditions.push(eq(invoicesTable.status, statusFilter));
  if (companyFilter && isStaff) conditions.push(eq(invoicesTable.companyId, companyFilter));

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

  const issueYear = invoiceData.issueDate
    ? parseInt(invoiceData.issueDate.slice(0, 4), 10) || new Date().getFullYear()
    : new Date().getFullYear();
  const invoiceNumber = await generateInvoiceNumber(company.id, company.taxRegime, issueYear);

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

type InvoiceFull = NonNullable<Awaited<ReturnType<typeof getInvoiceWithDetails>>>;

async function buildInvoicePdf(doc: InstanceType<typeof PDFDocument>, invoice: InvoiceFull): Promise<void> {
  const TAX_LABELS: Record<string, string> = {
    none: "No Tax",
    vat: "MwSt 19% (VAT)",
    cgst_sgst: "CGST+SGST 9%+9%",
    igst: "IGST 18%",
  };

  function f(v: string | number | null | undefined): string {
    return parseFloat(String(v ?? 0)).toFixed(2);
  }
  function clientName(): string {
    if (!invoice.client) return "—";
    return [invoice.client.firstName, invoice.client.lastName].filter(Boolean).join(" ") || invoice.client.email;
  }

  const cur = invoice.currency;
  const BLUE = "#1e3a5f";
  const GRAY = "#64748b";
  const LIGHT = "#f1f5f9";

  // Header bar
  doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("INVOICE", 50, 28);
  doc.fontSize(10).font("Helvetica").text(invoice.invoiceNumber, 50, 54);
  doc.fillColor("#ffffff").fontSize(10).text(invoice.status.toUpperCase(), doc.page.width - 150, 38, { width: 100, align: "right" });

  // Company & Client columns
  const colY = 110;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("FROM", 50, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(invoice.company?.name ?? "—", 50, colY + 14);
  let fromY = colY + 28;
  if (invoice.company?.taxNumber) { doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(`Tax No: ${invoice.company.taxNumber}`, 50, fromY); fromY += 13; }
  if (invoice.company?.address) { doc.fillColor(GRAY).fontSize(9).text(invoice.company.address, 50, fromY, { width: 220 }); fromY += (invoice.company.address.split("\n").length) * 13; }
  if (invoice.company?.bankDetails) { doc.fillColor(GRAY).fontSize(9).text(`Bank: ${invoice.company.bankDetails}`, 50, fromY, { width: 220 }); }

  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("BILL TO", 300, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(clientName(), 300, colY + 14);
  if (invoice.client?.email) { doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(invoice.client.email, 300, colY + 28); }
  if (invoice.project) { doc.fillColor(GRAY).fontSize(9).text(`Project: ${invoice.project.name}`, 300, colY + 41); }

  // Dates row
  const datesY = Math.max(fromY, colY + 60) + 20;
  doc.rect(50, datesY, doc.page.width - 100, 1).fill(LIGHT);
  const dateBoxY = datesY + 10;
  doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("ISSUE DATE", 50, dateBoxY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica").text(invoice.issueDate, 50, dateBoxY + 12);
  if (invoice.dueDate) {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("DUE DATE", 160, dateBoxY);
    doc.fillColor("#1e293b").fontSize(10).font("Helvetica").text(invoice.dueDate, 160, dateBoxY + 12);
  }
  doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("TAX TREATMENT", 270, dateBoxY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica").text(TAX_LABELS[invoice.taxType] ?? invoice.taxType, 270, dateBoxY + 12);

  // Subject
  const subjectY = dateBoxY + 40;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("SUBJECT", 50, subjectY);
  doc.fillColor("#1e293b").fontSize(12).font("Helvetica-Bold").text(invoice.title, 50, subjectY + 12);

  // Line items table
  const tableY = subjectY + 40;
  const colWidths = [260, 60, 90, 90];
  const colXs = [50, 310, 370, 460];

  // Table header
  doc.rect(50, tableY, doc.page.width - 100, 20).fill(BLUE);
  const headers = ["Description", "Qty", "Unit Price", "Amount"];
  headers.forEach((h, i) => {
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text(h, colXs[i], tableY + 6, { width: colWidths[i], align: i > 0 ? "right" : "left" });
  });

  let rowY = tableY + 24;
  const lineItems = invoice.lineItems ?? [];
  lineItems.forEach((li, idx) => {
    if (idx % 2 === 0) doc.rect(50, rowY - 2, doc.page.width - 100, 18).fill("#f8fafc");
    const amount = (parseFloat(String(li.quantity)) * parseFloat(String(li.unitPrice))).toFixed(2);
    doc.fillColor("#334155").fontSize(9).font("Helvetica").text(li.description, colXs[0], rowY, { width: colWidths[0] });
    doc.text(String(li.quantity), colXs[1], rowY, { width: colWidths[1], align: "right" });
    doc.text(`${cur} ${f(li.unitPrice)}`, colXs[2], rowY, { width: colWidths[2], align: "right" });
    doc.text(`${cur} ${f(amount)}`, colXs[3], rowY, { width: colWidths[3], align: "right" });
    rowY += 20;
  });

  // Totals
  const totalsX = 370;
  const totalsWidth = 140;
  rowY += 10;
  doc.rect(50, rowY, doc.page.width - 100, 1).fill(LIGHT);
  rowY += 8;

  doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("Subtotal", totalsX, rowY, { width: totalsWidth, align: "left" });
  doc.fillColor("#1e293b").text(`${cur} ${f(invoice.subtotal)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
  rowY += 16;

  const taxAmt = parseFloat(f(invoice.taxAmount));
  if (taxAmt > 0) {
    if (invoice.taxType === "cgst_sgst") {
      const half = (taxAmt / 2).toFixed(2);
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("CGST (9%)", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${half}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 14;
      doc.fillColor(GRAY).text("SGST (9%)", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${half}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 14;
    } else {
      const taxLabel = TAX_LABELS[invoice.taxType] ?? invoice.taxType;
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(taxLabel, totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${f(invoice.taxAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 16;
    }
  }

  rowY += 6;
  doc.rect(totalsX, rowY, totalsWidth, 1).fill(BLUE);
  rowY += 6;
  doc.fillColor(BLUE).fontSize(11).font("Helvetica-Bold").text("Total Due", totalsX, rowY, { width: totalsWidth, align: "left" });
  doc.text(`${cur} ${f(invoice.totalAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });

  // Notes
  if (invoice.notes) {
    rowY += 36;
    doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("NOTES", 50, rowY);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(invoice.notes, 50, rowY + 12, { width: doc.page.width - 100 });
  }
}

// PDF export — server-side generated PDF for a single invoice
router.get("/invoices/:id/pdf", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const isStaff = ADMIN_PM_ACCT.includes(user.role);
  const isClient = user.role === "client";
  if (!isStaff && !isClient) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoiceRaw = await getInvoiceWithDetails(id);
  if (!invoiceRaw) { res.status(404).json({ error: "Not found" }); return; }
  if (isClient) {
    const assignments = await db
      .select({ companyId: userCompanyAssignmentsTable.companyId })
      .from(userCompanyAssignmentsTable)
      .where(eq(userCompanyAssignmentsTable.userId, user.id));
    const clientCompanyIds = assignments.map(a => a.companyId);
    const allowed = clientCompanyIds.includes(invoiceRaw.companyId) || invoiceRaw.clientId === user.id;
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceRaw.invoiceNumber}.pdf"`);
  doc.pipe(res);
  await buildInvoicePdf(doc, invoiceRaw);
  doc.end();
});

// SEND invoice to client via email
router.post("/invoices/:id/send", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM_ACCT.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const invoice = await getInvoiceWithDetails(id);
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }
  if (!invoice.client?.email) {
    res.status(400).json({ error: "Invoice has no client with an email address" }); return;
  }
  const SENDABLE_INVOICE_STATUSES = ["draft", "sent"];
  if (!SENDABLE_INVOICE_STATUSES.includes(invoice.status)) {
    res.status(400).json({ error: `Cannot send an invoice with status "${invoice.status}"` }); return;
  }
  try {
    const pdfBuffer = await pdfToBuffer(doc => buildInvoicePdf(doc, invoice));
    const recipientName = [invoice.client.firstName, invoice.client.lastName].filter(Boolean).join(" ") || invoice.client.email;
    await sendDocumentEmail({
      type: "invoice",
      docNumber: invoice.invoiceNumber,
      title: invoice.title,
      recipientName,
      recipientEmail: invoice.client.email,
      fromCompanyName: invoice.company?.name ?? "STWV",
      taxRegime: invoice.company?.taxRegime,
      currency: invoice.currency,
      totalAmount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      pdfBuffer,
      pdfFilename: `invoice-${invoice.invoiceNumber}.pdf`,
    });
    await db.transaction(async (tx) => {
      await tx.update(invoicesTable).set({ status: "sent", updatedAt: new Date() }).where(eq(invoicesTable.id, id));
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: "status_changed",
        entityType: "invoice",
        entityId: id,
        entityLabel: invoice.invoiceNumber,
        oldValue: { status: invoice.status },
        newValue: { status: "sent" },
        projectId: invoice.projectId ?? null,
      });
    });
    res.json({ success: true, email: invoice.client.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Email delivery failed: ${message}` });
  }
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

  if (invoiceData.status && invoiceData.status !== existing.status) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "status_changed",
      entityType: "invoice",
      entityId: id,
      entityLabel: existing.invoiceNumber,
      oldValue: { status: existing.status },
      newValue: { status: invoiceData.status },
      projectId: existing.projectId ?? null,
    });
  }

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
