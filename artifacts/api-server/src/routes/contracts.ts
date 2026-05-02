import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import PDFDocument from "pdfkit";
import {
  db,
  contractsTable,
  contractTemplatesTable,
  companiesTable,
  usersTable,
  projectsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";
import { logAudit, logAuditTx } from "../lib/auditLogger";
import { safeLogoFetch } from "../lib/safeLogoFetch";
import { pdfToBuffer } from "../lib/pdfBuffer";
import { sendDocumentEmail } from "../lib/emailService";

const router: IRouter = Router();

const CONTRACT_TYPES = ["client_service", "freelancer_service"] as const;
const CONTRACT_STATUSES = ["draft", "sent", "signed", "cancelled"] as const;

const ADMIN_PM = ["admin", "project_manager"];

async function getContractWithDetails(contractId: number) {
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, contractId));
  if (!contract) return null;

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, contract.companyId));

  let client = null;
  if (contract.clientId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, contract.clientId));
    client = u ?? null;
  }

  let project = null;
  if (contract.projectId) {
    const [p] = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, contract.projectId));
    project = p ?? null;
  }

  return { ...contract, company, client, project };
}

// LIST contracts
router.get("/contracts", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(contractsTable).orderBy(contractsTable.id);
  const contracts = await Promise.all(rows.map(r => getContractWithDetails(r.id)));
  res.json(contracts.filter(Boolean));
});

// CREATE contract
router.post("/contracts", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const Body = z.object({
    type: z.enum(CONTRACT_TYPES),
    companyId: z.number().int(),
    projectId: z.number().int().nullable().optional(),
    clientId: z.number().int().nullable().optional(),
    title: z.string().min(1),
    content: z.string().min(1),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const contractNumber = `CON-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const [contract] = await db.insert(contractsTable).values({
    ...parsed.data,
    contractNumber,
    status: "draft",
    createdBy: user.id,
  }).returning();

  const full = await getContractWithDetails(contract.id);
  res.status(201).json(full);
});

// GET contract
router.get("/contracts/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const contract = await getContractWithDetails(id);
  if (!contract) { res.status(404).json({ error: "Not found" }); return; }
  res.json(contract);
});

// UPDATE contract
router.patch("/contracts/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    status: z.enum(CONTRACT_STATUSES).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
  });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "signed") {
    updates.signedAt = new Date();
  }

  let contract: typeof contractsTable.$inferSelect;
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(contractsTable).set(updates).where(eq(contractsTable.id, id)).returning();
    if (!updated) throw Object.assign(new Error("Not found"), { status: 404 });
    contract = updated;
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: parsed.data.status === "signed" ? "signed" : "status_changed",
        entityType: "contract",
        entityId: id,
        entityLabel: existing.contractNumber,
        oldValue: { status: existing.status },
        newValue: { status: parsed.data.status },
        projectId: existing.projectId ?? null,
      });
    }
  });

  const full = await getContractWithDetails(contract!.id);
  res.json(full);
});

// DELETE contract
router.delete("/contracts/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contractsTable).where(eq(contractsTable.id, id));
  res.sendStatus(204);
});

type ContractFull = NonNullable<Awaited<ReturnType<typeof getContractWithDetails>>>;

async function buildContractPdf(doc: InstanceType<typeof PDFDocument>, contract: ContractFull): Promise<void> {
  const company = contract.company;
  const client = contract.client;
  const project = contract.project;

  function partyName(): string {
    if (!client) return "—";
    return [client.firstName, client.lastName].filter(Boolean).join(" ") || client.email;
  }

  const BLUE = "#1e3a5f";
  const GRAY = "#64748b";
  const LIGHT = "#f1f5f9";
  const TYPE_LABELS: Record<string, string> = {
    client_service: "Client Service Agreement",
    freelancer_service: "Freelancer Service Agreement",
  };

  // Header bar
  doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("CONTRACT", 50, 28);
  doc.fontSize(10).font("Helvetica").text(contract.contractNumber, 50, 54);
  doc.fillColor("#ffffff").fontSize(10).text(contract.status.toUpperCase(), doc.page.width - 150, 38, { width: 100, align: "right" });

  // Company logo (top-right of header) — SSRF-safe fetch
  if (company?.logoUrl) {
    const logoBuf = await safeLogoFetch(company.logoUrl);
    if (logoBuf) doc.image(logoBuf, doc.page.width - 180, 10, { fit: [120, 60] });
  }

  // Company & Party columns
  const colY = 110;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("COMPANY", 50, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(company?.name ?? "—", 50, colY + 14);
  let fromY = colY + 28;
  if (company?.taxNumber) {
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(`Tax No: ${company.taxNumber}`, 50, fromY); fromY += 13;
  }
  if (company?.address) {
    doc.fillColor(GRAY).fontSize(9).text(company.address, 50, fromY, { width: 220 });
    fromY += company.address.split("\n").length * 13;
  }

  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("PARTY", 300, colY);
  doc.fillColor("#1e293b").fontSize(10).font("Helvetica-Bold").text(partyName(), 300, colY + 14);
  if (client?.email) { doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(client.email, 300, colY + 28); }
  if (project) { doc.fillColor(GRAY).fontSize(9).text(`Project: ${project.name}`, 300, colY + 41); }

  // Dates row
  const datesY = Math.max(fromY, colY + 60) + 20;
  doc.rect(50, datesY, doc.page.width - 100, 1).fill(LIGHT);
  const dateBoxY = datesY + 10;
  doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("TYPE", 50, dateBoxY);
  doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(TYPE_LABELS[contract.type] ?? contract.type, 50, dateBoxY + 12);
  if (contract.startDate) {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("START DATE", 200, dateBoxY);
    doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(contract.startDate, 200, dateBoxY + 12);
  }
  if (contract.endDate) {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("END DATE", 320, dateBoxY);
    doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(contract.endDate, 320, dateBoxY + 12);
  }
  if (contract.signedAt) {
    doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold").text("SIGNED", 430, dateBoxY);
    doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(new Date(contract.signedAt).toLocaleDateString("en-GB"), 430, dateBoxY + 12);
  }

  // Title
  const titleY = dateBoxY + 40;
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("TITLE", 50, titleY);
  doc.fillColor("#1e293b").fontSize(12).font("Helvetica-Bold").text(contract.title, 50, titleY + 12);

  // Divider + Contract body
  const contentY = titleY + 40;
  doc.rect(50, contentY, doc.page.width - 100, 1).fill(LIGHT);
  const bodyY = contentY + 12;
  // contract.content is directly typed on contractsTable.$inferSelect
  const cleanContent = contract.content
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
  doc.fillColor("#1e293b").fontSize(9).font("Helvetica").text(cleanContent, 50, bodyY, { width: doc.page.width - 100, lineGap: 3 });

  // Payment Terms & Bank Details
  const paymentY = doc.y + 20;
  doc.rect(50, paymentY, doc.page.width - 100, 1).fill(LIGHT);
  doc.fillColor(BLUE).fontSize(9).font("Helvetica-Bold").text("PAYMENT TERMS", 50, paymentY + 10);
  const payTerms = company?.taxRegime === "vat"
    ? "Invoices are due within 30 days of issuance. Late payments accrue interest per §288 BGB."
    : "Invoices are due within 30 days of issuance.";
  doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(payTerms, 50, paymentY + 22, { width: doc.page.width - 100 });
  if (company?.bankDetails) {
    doc.fillColor(GRAY).fontSize(9).text(`Bank: ${company.bankDetails}`, 50, doc.y + 6, { width: doc.page.width - 100 });
  }
}

// PDF export — server-side generated PDF for a single contract
router.get("/contracts/:id/pdf", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const contract = await getContractWithDetails(id);
  if (!contract) { res.status(404).json({ error: "Not found" }); return; }
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="contract-${contract.contractNumber}.pdf"`);
  doc.pipe(res);
  await buildContractPdf(doc, contract);
  doc.end();
});

// SEND contract to client via email
router.post("/contracts/:id/send", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const contract = await getContractWithDetails(id);
  if (!contract) { res.status(404).json({ error: "Not found" }); return; }
  if (!contract.client?.email) {
    res.status(400).json({ error: "Contract has no client with an email address" }); return;
  }
  const SENDABLE_CONTRACT_STATUSES = ["draft", "sent"];
  if (!SENDABLE_CONTRACT_STATUSES.includes(contract.status)) {
    res.status(400).json({ error: `Cannot send a contract with status "${contract.status}"` }); return;
  }
  try {
    const pdfBuffer = await pdfToBuffer(doc => buildContractPdf(doc, contract));
    const recipientName = [contract.client.firstName, contract.client.lastName].filter(Boolean).join(" ") || contract.client.email;
    await sendDocumentEmail({
      type: "contract",
      docNumber: contract.contractNumber,
      title: contract.title,
      recipientName,
      recipientEmail: contract.client.email,
      fromCompanyName: contract.company?.name ?? "STWV",
      taxRegime: contract.company?.taxRegime,
      pdfBuffer,
      pdfFilename: `contract-${contract.contractNumber}.pdf`,
    });
    await db.transaction(async (tx) => {
      await tx.update(contractsTable).set({ status: "sent", updatedAt: new Date() }).where(eq(contractsTable.id, id));
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: "sent",
        entityType: "contract",
        entityId: id,
        entityLabel: contract.contractNumber,
        oldValue: { status: contract.status },
        newValue: { status: "sent" },
        projectId: contract.projectId ?? null,
      });
    });
    res.json({ success: true, email: contract.client.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Email delivery failed: ${message}` });
  }
});

// LIST contract templates
router.get("/contract-templates", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const templates = await db.select().from(contractTemplatesTable).orderBy(contractTemplatesTable.id);
  res.json(templates);
});

// CREATE contract template
router.post("/contract-templates", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const Body = z.object({
    name: z.string().min(1),
    type: z.enum(CONTRACT_TYPES),
    content: z.string().min(1),
    isDefault: z.boolean().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [template] = await db.insert(contractTemplatesTable).values(parsed.data).returning();
  res.status(201).json(template);
});

// UPDATE contract template
router.patch("/contract-templates/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    name: z.string().min(1).optional(),
    content: z.string().optional(),
    isDefault: z.boolean().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [template] = await db.update(contractTemplatesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(contractTemplatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Not found" }); return; }
  res.json(template);
});

export default router;
