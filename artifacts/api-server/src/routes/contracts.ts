import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  contractsTable,
  contractTemplatesTable,
  companiesTable,
  usersTable,
  projectsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

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

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "signed") {
    updates.signedAt = new Date();
  }

  const [contract] = await db.update(contractsTable).set(updates).where(eq(contractsTable.id, id)).returning();
  if (!contract) { res.status(404).json({ error: "Not found" }); return; }

  const full = await getContractWithDetails(contract.id);
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
