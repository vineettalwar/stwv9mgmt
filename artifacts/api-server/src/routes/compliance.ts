import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db, complianceChecklistsTable, usersTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const ALLOWED_ROLES = ["admin", "germany_accountant", "india_accountant"];

function isAllowed(role: string) {
  return ALLOWED_ROLES.includes(role);
}

async function getChecklistWithUser(id: number) {
  const [row] = await db
    .select({
      id: complianceChecklistsTable.id,
      companyId: complianceChecklistsTable.companyId,
      regime: complianceChecklistsTable.regime,
      year: complianceChecklistsTable.year,
      quarter: complianceChecklistsTable.quarter,
      month: complianceChecklistsTable.month,
      itemKey: complianceChecklistsTable.itemKey,
      itemLabel: complianceChecklistsTable.itemLabel,
      deadline: complianceChecklistsTable.deadline,
      status: complianceChecklistsTable.status,
      responsibleUserId: complianceChecklistsTable.responsibleUserId,
      notes: complianceChecklistsTable.notes,
      filedAt: complianceChecklistsTable.filedAt,
      createdAt: complianceChecklistsTable.createdAt,
      updatedAt: complianceChecklistsTable.updatedAt,
      responsibleUser: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      },
    })
    .from(complianceChecklistsTable)
    .leftJoin(usersTable, eq(complianceChecklistsTable.responsibleUserId, usersTable.id))
    .where(eq(complianceChecklistsTable.id, id));
  return row ?? null;
}

// GET /compliance — list compliance items (filterable by regime, companyId, year)
router.get("/compliance", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!isAllowed(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const conditions = [];
  if (req.query.companyId) {
    const companyId = parseInt(String(req.query.companyId));
    if (!isNaN(companyId)) conditions.push(eq(complianceChecklistsTable.companyId, companyId));
  }
  if (req.query.regime) {
    conditions.push(eq(complianceChecklistsTable.regime, String(req.query.regime)));
  }
  if (req.query.year) {
    const year = parseInt(String(req.query.year));
    if (!isNaN(year)) conditions.push(eq(complianceChecklistsTable.year, year));
  }

  const query = db
    .select({
      id: complianceChecklistsTable.id,
      companyId: complianceChecklistsTable.companyId,
      regime: complianceChecklistsTable.regime,
      year: complianceChecklistsTable.year,
      quarter: complianceChecklistsTable.quarter,
      month: complianceChecklistsTable.month,
      itemKey: complianceChecklistsTable.itemKey,
      itemLabel: complianceChecklistsTable.itemLabel,
      deadline: complianceChecklistsTable.deadline,
      status: complianceChecklistsTable.status,
      responsibleUserId: complianceChecklistsTable.responsibleUserId,
      notes: complianceChecklistsTable.notes,
      filedAt: complianceChecklistsTable.filedAt,
      createdAt: complianceChecklistsTable.createdAt,
      updatedAt: complianceChecklistsTable.updatedAt,
      responsibleUser: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      },
    })
    .from(complianceChecklistsTable)
    .leftJoin(usersTable, eq(complianceChecklistsTable.responsibleUserId, usersTable.id));

  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(complianceChecklistsTable.deadline)
    : await query.orderBy(complianceChecklistsTable.deadline);

  res.json(rows);
});

// POST /compliance — create a compliance checklist item
router.post("/compliance", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!isAllowed(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const Body = z.object({
    companyId: z.number().int(),
    regime: z.enum(["germany", "india"]),
    year: z.number().int(),
    quarter: z.number().int().min(1).max(4).nullable().optional(),
    month: z.number().int().min(1).max(12).nullable().optional(),
    itemKey: z.string().min(1),
    itemLabel: z.string().min(1),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["pending", "filed", "overdue"]).optional(),
    responsibleUserId: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [item] = await db.insert(complianceChecklistsTable).values(parsed.data).returning();
  const full = await getChecklistWithUser(item.id);
  res.status(201).json(full);
});

// PATCH /compliance/:id — update status, notes, etc.
router.patch("/compliance/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!isAllowed(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    status: z.enum(["pending", "filed", "overdue"]).optional(),
    notes: z.string().nullable().optional(),
    responsibleUserId: z.number().int().nullable().optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    filedAt: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "filed" && !parsed.data.filedAt) {
    updateData.filedAt = new Date();
  }
  if (parsed.data.filedAt === null) {
    updateData.filedAt = null;
  }

  const [item] = await db
    .update(complianceChecklistsTable)
    .set(updateData as Parameters<typeof db.update>[0])
    .where(eq(complianceChecklistsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  const full = await getChecklistWithUser(item.id);
  res.json(full);
});

// DELETE /compliance/:id
router.delete("/compliance/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(complianceChecklistsTable).where(eq(complianceChecklistsTable.id, id));
  res.sendStatus(204);
});

// POST /compliance/seed — seed compliance items for a company/year
router.post("/compliance/seed", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!isAllowed(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const Body = z.object({
    companyId: z.number().int(),
    regime: z.enum(["germany", "india"]),
    year: z.number().int(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { companyId, regime, year } = parsed.data;

  const items: Parameters<typeof db.insert>[0]["values"] = [];

  if (regime === "germany") {
    // Quarterly VAT returns
    const vatDeadlines = [
      { quarter: 1, deadline: `${year}-04-10`, label: "VAT Return Q1 (Umsatzsteuervoranmeldung)" },
      { quarter: 2, deadline: `${year}-07-10`, label: "VAT Return Q2 (Umsatzsteuervoranmeldung)" },
      { quarter: 3, deadline: `${year}-10-10`, label: "VAT Return Q3 (Umsatzsteuervoranmeldung)" },
      { quarter: 4, deadline: `${year + 1}-01-10`, label: "VAT Return Q4 (Umsatzsteuervoranmeldung)" },
    ];
    for (const v of vatDeadlines) {
      items.push({
        companyId, regime, year, quarter: v.quarter, month: null,
        itemKey: `vat_return_q${v.quarter}`,
        itemLabel: v.label,
        deadline: v.deadline,
        status: new Date() > new Date(v.deadline) ? "overdue" : "pending",
      });
    }
    // Annual Körperschaftsteuer
    items.push({
      companyId, regime, year, quarter: null, month: null,
      itemKey: "annual_k_steuer",
      itemLabel: "Annual Corporate Tax (Körperschaftsteuer)",
      deadline: `${year + 1}-07-31`,
      status: "pending",
    });
    // Annual Gewerbesteuer
    items.push({
      companyId, regime, year, quarter: null, month: null,
      itemKey: "annual_gewerbesteuer",
      itemLabel: "Annual Trade Tax (Gewerbesteuer)",
      deadline: `${year + 1}-07-31`,
      status: "pending",
    });
  } else if (regime === "india") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Monthly GSTR-3B (due 20th of next month)
    for (let m = 1; m <= 12; m++) {
      const dueYear = m === 12 ? year + 1 : year;
      const dueMonth = m === 12 ? 1 : m + 1;
      const deadline = `${dueYear}-${String(dueMonth).padStart(2, "0")}-20`;
      items.push({
        companyId, regime, year, quarter: null, month: m,
        itemKey: `gstr_3b_${monthNames[m - 1]!.toLowerCase()}`,
        itemLabel: `GSTR-3B ${monthNames[m - 1]} ${year}`,
        deadline,
        status: new Date() > new Date(deadline) ? "overdue" : "pending",
      });
    }
    // Quarterly GSTR-1
    const gstr1Items = [
      { quarter: 1, months: "Apr-Jun", deadline: `${year}-07-11`, label: `GSTR-1 Q1 (Apr-Jun ${year})` },
      { quarter: 2, months: "Jul-Sep", deadline: `${year}-10-11`, label: `GSTR-1 Q2 (Jul-Sep ${year})` },
      { quarter: 3, months: "Oct-Dec", deadline: `${year + 1}-01-11`, label: `GSTR-1 Q3 (Oct-Dec ${year})` },
      { quarter: 4, months: "Jan-Mar", deadline: `${year + 1}-04-11`, label: `GSTR-1 Q4 (Jan-Mar ${year + 1})` },
    ];
    for (const g of gstr1Items) {
      items.push({
        companyId, regime, year, quarter: g.quarter, month: null,
        itemKey: `gstr_1_q${g.quarter}`,
        itemLabel: g.label,
        deadline: g.deadline,
        status: new Date() > new Date(g.deadline) ? "overdue" : "pending",
      });
    }
  }

  const inserted = await db.insert(complianceChecklistsTable).values(items as never[]).returning();
  res.status(201).json(inserted);
});

export default router;
