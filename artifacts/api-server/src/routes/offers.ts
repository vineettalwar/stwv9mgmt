import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
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

  await db.update(offersTable).set({ ...offerData, ...totals, updatedAt: new Date() }).where(eq(offersTable.id, id));
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

  await db.update(offersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offersTable.id, id));

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
