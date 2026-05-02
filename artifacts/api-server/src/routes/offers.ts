import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import {
  db,
  offersTable,
  offerLineItemsTable,
  companiesTable,
  usersTable,
  projectsTable,
  contractsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";
import { logAudit, logAuditTx } from "../lib/auditLogger";
import { safeLogoFetch } from "../lib/safeLogoFetch";
import { pdfToBuffer } from "../lib/pdfBuffer";
import { sendDocumentEmail } from "../lib/emailService";

const router: IRouter = Router();

const OFFER_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().default("1"),
  unitPrice: z.string().default("0"),
  sortOrder: z.number().int().optional(),
});

const CreateOfferBody = z.object({
  companyId: z.number().int(),
  projectId: z.number().int().nullable().optional(),
  clientId: z.number().int().nullable().optional(),
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  currency: z.string().optional(),
  lineItems: z.array(LineItemSchema).optional(),
});

const UpdateOfferBody = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  status: z.enum(OFFER_STATUSES).optional(),
  currency: z.string().optional(),
  lineItems: z.array(LineItemSchema).optional(),
});

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

async function getOfferWithDetails(offerId: number) {
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, offerId));
  if (!offer) return null;

  const lineItems = await db
    .select()
    .from(offerLineItemsTable)
    .where(eq(offerLineItemsTable.offerId, offerId))
    .orderBy(offerLineItemsTable.sortOrder);

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, offer.companyId));

  let client = null;
  if (offer.clientId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, offer.clientId));
    client = u ?? null;
  }

  let project = null;
  if (offer.projectId) {
    const [p] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, offer.projectId));
    project = p ?? null;
  }

  return { ...offer, lineItems, company, client, project };
}

const ADMIN_PM = ["admin", "project_manager"];

// LIST offers
router.get("/offers", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(offersTable).orderBy(offersTable.id);
  const offers = await Promise.all(rows.map(r => getOfferWithDetails(r.id)));
  res.json(offers.filter(Boolean));
});

// CREATE offer
router.post("/offers", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { lineItems = [], ...offerData } = parsed.data;

  // Get company for tax info
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, offerData.companyId));
  if (!company) { res.status(400).json({ error: "Company not found" }); return; }

  const taxRate = company.taxRegime === "vat" ? 19 : 0;
  const totals = await computeTotals(lineItems, taxRate);

  const offerNumber = `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const [offer] = await db.insert(offersTable).values({
    ...offerData,
    offerNumber,
    currency: offerData.currency ?? company.currency,
    createdBy: user.id,
    ...totals,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(offerLineItemsTable).values(
      lineItems.map((li, idx) => ({
        offerId: offer.id,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: (parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0")).toFixed(2),
        sortOrder: li.sortOrder ?? idx,
      }))
    );
  }

  const full = await getOfferWithDetails(offer.id);
  res.status(201).json(full);
});

// GET offer
router.get("/offers/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const offer = await getOfferWithDetails(id);
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  res.json(offer);
});

// UPDATE offer
router.patch("/offers/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { lineItems, ...offerData } = parsed.data;

  const [existing] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let totals = {};
  if (lineItems !== undefined) {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, existing.companyId));
    const taxRate = company?.taxRegime === "vat" ? 19 : 0;
    totals = await computeTotals(lineItems, taxRate);

    await db.delete(offerLineItemsTable).where(eq(offerLineItemsTable.offerId, id));
    if (lineItems.length > 0) {
      await db.insert(offerLineItemsTable).values(
        lineItems.map((li, idx) => ({
          offerId: id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: (parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0")).toFixed(2),
          sortOrder: li.sortOrder ?? idx,
        }))
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(offersTable).set({ ...offerData, ...totals, updatedAt: new Date() }).where(eq(offersTable.id, id));
    if (offerData.status && offerData.status !== existing.status) {
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: "status_changed",
        entityType: "offer",
        entityId: id,
        entityLabel: existing.offerNumber,
        oldValue: { status: existing.status },
        newValue: { status: offerData.status },
        projectId: existing.projectId ?? null,
      });
    }
  });

  const full = await getOfferWithDetails(id);
  res.json(full);
});

// DELETE offer
router.delete("/offers/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(offersTable).where(eq(offersTable.id, id));
  res.sendStatus(204);
});

type OfferFull = NonNullable<Awaited<ReturnType<typeof getOfferWithDetails>>>;

async function buildOfferPdf(doc: InstanceType<typeof PDFDocument>, offer: OfferFull): Promise<void> {
  const company = offer.company;
  const client = offer.client;
  const project = offer.project;

  function f(v: string | number | null | undefined): string {
    return parseFloat(String(v ?? 0)).toFixed(2);
  }
  function clientName(): string {
    if (!client) return "—";
    return [client.firstName, client.lastName].filter(Boolean).join(" ") || client.email;
  }

  const cur = offer.currency ?? "EUR";
  const BLUE = "#1e3a5f";
  const GRAY = "#64748b";
  const LIGHT = "#f1f5f9";

  // Header bar
  doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("OFFER", 50, 28);
  doc.fontSize(10).font("Helvetica").text(offer.offerNumber, 50, 54);
  doc.fillColor("#ffffff").fontSize(10).text(offer.status.toUpperCase(), doc.page.width - 150, 38, { width: 100, align: "right" });

  // Company logo (top-right of header) — SSRF-safe fetch
  if (company?.logoUrl) {
    const logoBuf = await safeLogoFetch(company.logoUrl);
    if (logoBuf) doc.image(logoBuf, doc.page.width - 180, 10, { fit: [120, 60] });
  }

  // Company & Client columns
  const colY = 110;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("FROM", 50, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(company?.name ?? "—", 50, colY + 14);
  let fromY = colY + 28;
  if (company?.taxNumber) {
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(`Tax No: ${company.taxNumber}`, 50, fromY); fromY += 13;
  }
  if (company?.address) {
    doc.fillColor(GRAY).fontSize(9).text(company.address, 50, fromY, { width: 220 });
    fromY += company.address.split("\n").length * 13;
  }

  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("TO", 300, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(clientName(), 300, colY + 14);
  if (client?.email) { doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(client.email, 300, colY + 28); }
  if (project) { doc.fillColor(GRAY).fontSize(9).text(`Project: ${project.name}`, 300, colY + 41); }

  // Dates row
  const datesY = Math.max(fromY, colY + 60) + 20;
  doc.rect(50, datesY, doc.page.width - 100, 1).fill(LIGHT);
  const dateBoxY = datesY + 10;
  doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("OFFER DATE", 50, dateBoxY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica").text(new Date(offer.createdAt).toLocaleDateString("en-GB"), 50, dateBoxY + 12);
  if (offer.validUntil) {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("VALID UNTIL", 180, dateBoxY);
    doc.fillColor("#1e293b").fontSize(10).font("Helvetica").text(offer.validUntil, 180, dateBoxY + 12);
  }

  // Subject
  const subjectY = dateBoxY + 40;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("SUBJECT", 50, subjectY);
  doc.fillColor("#1e293b").fontSize(12).font("Helvetica-Bold").text(offer.title, 50, subjectY + 12);

  // Line items table
  const tableY = subjectY + 40;
  const colWidths = [260, 60, 90, 90];
  const colXs = [50, 310, 370, 460];

  doc.rect(50, tableY, doc.page.width - 100, 20).fill(BLUE);
  const tableHeaders = ["Description", "Qty", "Unit Price", "Amount"];
  tableHeaders.forEach((h, i) => {
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold").text(h, colXs[i], tableY + 6, { width: colWidths[i], align: i > 0 ? "right" : "left" });
  });

  let rowY = tableY + 24;
  const lineItems = offer.lineItems ?? [];
  lineItems.forEach((li, idx) => {
    if (idx % 2 === 0) doc.rect(50, rowY - 2, doc.page.width - 100, 18).fill("#f8fafc");
    const amount = (parseFloat(String(li.quantity)) * parseFloat(String(li.unitPrice))).toFixed(2);
    doc.fillColor("#334155").fontSize(9).font("Helvetica").text(li.description, colXs[0], rowY, { width: colWidths[0] });
    doc.text(String(li.quantity), colXs[1], rowY, { width: colWidths[1], align: "right" });
    doc.text(`${cur} ${f(li.unitPrice)}`, colXs[2], rowY, { width: colWidths[2], align: "right" });
    doc.text(`${cur} ${f(amount)}`, colXs[3], rowY, { width: colWidths[3], align: "right" });
    rowY += 20;
  });

  // Totals — VAT/GST-specific breakdown matching invoice format
  const totalsX = 370;
  const totalsWidth = 140;
  rowY += 10;
  doc.rect(50, rowY, doc.page.width - 100, 1).fill(LIGHT);
  rowY += 8;

  doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("Subtotal", totalsX, rowY, { width: totalsWidth, align: "left" });
  doc.fillColor("#1e293b").text(`${cur} ${f(offer.subtotal)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
  rowY += 16;

  const taxAmt = parseFloat(f(offer.taxAmount));
  const taxRegime = company?.taxRegime ?? "none";
  if (taxAmt > 0) {
    if (taxRegime === "vat") {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("MwSt 19% (VAT)", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${f(offer.taxAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 16;
    } else if (taxRegime === "gst") {
      const half = (taxAmt / 2).toFixed(2);
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("CGST (9%)", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${half}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 14;
      doc.fillColor(GRAY).font("Helvetica").text("SGST (9%)", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${half}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 14;
    } else if (taxRegime === "igst") {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("IGST 18%", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${f(offer.taxAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 16;
    } else {
      doc.fillColor(GRAY).fontSize(9).font("Helvetica").text("Tax", totalsX, rowY, { width: totalsWidth, align: "left" });
      doc.fillColor("#1e293b").text(`${cur} ${f(offer.taxAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
      rowY += 16;
    }
  }

  rowY += 6;
  doc.rect(totalsX, rowY, totalsWidth, 1).fill(BLUE);
  rowY += 6;
  doc.fillColor(BLUE).fontSize(11).font("Helvetica-Bold").text("Total", totalsX, rowY, { width: totalsWidth, align: "left" });
  doc.text(`${cur} ${f(offer.totalAmount)}`, totalsX, rowY, { width: totalsWidth, align: "right" });
  rowY += 28;

  // Notes
  if (offer.notes) {
    doc.rect(50, rowY, doc.page.width - 100, 1).fill(LIGHT);
    rowY += 10;
    doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("NOTES", 50, rowY);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(offer.notes, 50, rowY + 12, { width: doc.page.width - 100 });
    rowY += 24 + (offer.notes.split("\n").length * 12);
  }

  // Payment Terms
  doc.rect(50, rowY, doc.page.width - 100, 1).fill(LIGHT);
  rowY += 10;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("PAYMENT TERMS", 50, rowY);
  rowY += 12;
  const paymentText = taxRegime === "vat"
    ? "Invoices are due within 30 days of issuance. Late payments accrue interest per §288 BGB."
    : "Invoices are due within 30 days of issuance.";
  doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(paymentText, 50, rowY, { width: doc.page.width - 100 });
  rowY += 14;
  if (company?.bankDetails) {
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(`Bank: ${company.bankDetails}`, 50, rowY, { width: doc.page.width - 100 });
  }

}

// PDF export — server-side generated PDF for a single offer
router.get("/offers/:id/pdf", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const offer = await getOfferWithDetails(id);
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="offer-${offer.offerNumber}.pdf"`);
  doc.pipe(res);
  await buildOfferPdf(doc, offer);
  doc.end();
});

// SEND offer to client via email
router.post("/offers/:id/send", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const offer = await getOfferWithDetails(id);
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }
  if (!offer.client?.email) {
    res.status(400).json({ error: "Offer has no client with an email address" }); return;
  }
  const SENDABLE_OFFER_STATUSES = ["draft", "sent"];
  if (!SENDABLE_OFFER_STATUSES.includes(offer.status)) {
    res.status(400).json({ error: `Cannot send an offer with status "${offer.status}"` }); return;
  }
  try {
    const pdfBuffer = await pdfToBuffer(doc => buildOfferPdf(doc, offer));
    const recipientName = [offer.client.firstName, offer.client.lastName].filter(Boolean).join(" ") || offer.client.email;
    await sendDocumentEmail({
      type: "offer",
      docNumber: offer.offerNumber,
      title: offer.title,
      recipientName,
      recipientEmail: offer.client.email,
      fromCompanyName: offer.company?.name ?? "STWV",
      taxRegime: offer.company?.taxRegime,
      currency: offer.currency,
      totalAmount: offer.totalAmount,
      validUntil: offer.validUntil,
      pdfBuffer,
      pdfFilename: `offer-${offer.offerNumber}.pdf`,
    });
    await db.transaction(async (tx) => {
      await tx.update(offersTable).set({ status: "sent", updatedAt: new Date() }).where(eq(offersTable.id, id));
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: "status_changed",
        entityType: "offer",
        entityId: id,
        entityLabel: offer.offerNumber,
        oldValue: { status: offer.status },
        newValue: { status: "sent" },
        projectId: offer.projectId ?? null,
      });
    });
    res.json({ success: true, email: offer.client.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Email delivery failed: ${message}` });
  }
});

// CONVERT offer to contract
router.post("/offers/:id/convert-to-contract", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const offer = await getOfferWithDetails(id);
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }

  const Body = z.object({ type: z.enum(["client_service", "freelancer_service"]).optional() });
  const parsed = Body.safeParse(req.body);
  const contractType = parsed.success ? (parsed.data.type ?? "client_service") : "client_service";

  const contractNumber = `CON-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const defaultContent = generateContractContent(contractType, offer);

  const [contract] = await db.insert(contractsTable).values({
    contractNumber,
    type: contractType,
    companyId: offer.companyId,
    projectId: offer.projectId ?? null,
    clientId: offer.clientId ?? null,
    offerId: offer.id,
    title: `Contract: ${offer.title}`,
    content: defaultContent,
    status: "draft",
    createdBy: user.id,
  }).returning();

  await db.transaction(async (tx) => {
    await tx.update(offersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offersTable.id, id));
    await logAuditTx(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "status_changed",
      entityType: "offer",
      entityId: id,
      entityLabel: offer.offerNumber,
      oldValue: { status: offer.status },
      newValue: { status: "accepted" },
      projectId: offer.projectId ?? null,
    });
  });

  res.status(201).json(contract);
});

function generateContractContent(type: string, offer: { title: string; company: { name: string } | null; client: { firstName?: string | null; lastName?: string | null; email: string } | null }): string {
  const clientName = offer.client
    ? [offer.client.firstName, offer.client.lastName].filter(Boolean).join(" ") || offer.client.email
    : "[CLIENT NAME]";
  const companyName = offer.company?.name ?? "[COMPANY NAME]";

  if (type === "client_service") {
    return `# Client Service Agreement

**Parties**
- Service Provider: ${companyName}
- Client: ${clientName}

**Project**: ${offer.title}

**Scope of Services**
The Service Provider agrees to provide the services as described in the offer/proposal attached hereto.

**Payment Terms**
Payment shall be made as per the terms outlined in the offer document. Invoices are due within 30 days of issuance.

**Intellectual Property**
All work product created under this agreement shall be owned by the Client upon full payment.

**Confidentiality**
Both parties agree to maintain confidentiality of all proprietary information shared during the engagement.

**Termination**
Either party may terminate this agreement with 30 days written notice.

**Governing Law**
This agreement shall be governed by applicable law.

---
*This contract was generated from Offer: ${offer.title}*`;
  }

  return `# Freelancer Service Agreement

**Parties**
- Company: ${companyName}
- Freelancer: ${clientName}

**Project**: ${offer.title}

**Scope of Work**
The Freelancer agrees to provide services as described in the attached work order.

**Compensation**
The Freelancer shall be compensated as per the rates agreed upon in the offer document.

**Independent Contractor**
The Freelancer is an independent contractor and not an employee of the Company.

**Deliverables**
All deliverables shall be submitted as per the agreed timeline.

**Intellectual Property**
All work product created under this agreement shall be the property of the Company upon payment.

**Confidentiality**
The Freelancer agrees to maintain confidentiality of all company proprietary information.

**Termination**
Either party may terminate with 14 days written notice.

---
*This contract was generated from Offer: ${offer.title}*`;
}

export default router;
