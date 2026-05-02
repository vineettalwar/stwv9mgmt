import { Router, type IRouter } from "express";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, expensesTable, projectsTable, usersTable, projectAssignmentsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const ADMIN_PM = ["admin", "project_manager"];
const BILLING_ROLES = ["admin", "project_manager", "germany_accountant", "india_accountant"];
const STAFF_ROLES = ["admin", "project_manager", "employee", "freelancer", "germany_accountant", "india_accountant"];
const EXPENSE_CATEGORIES = ["travel", "software", "hardware", "other"] as const;

const ExpenseBody = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number"),
  currency: z.string().min(1).max(10).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  isBillable: z.boolean().optional(),
});

async function canAccessProject(userId: number, userRole: string, projectId: number): Promise<boolean> {
  if (BILLING_ROLES.includes(userRole)) return true;
  const [assignment] = await db
    .select({ id: projectAssignmentsTable.id })
    .from(projectAssignmentsTable)
    .where(and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, userId)));
  return !!assignment;
}

router.get("/projects/:id/expenses", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!STAFF_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  const allowed = await canAccessProject(user.id, user.role, projectId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const expenses = await db
    .select({
      id: expensesTable.id,
      projectId: expensesTable.projectId,
      amount: expensesTable.amount,
      currency: expensesTable.currency,
      category: expensesTable.category,
      description: expensesTable.description,
      date: expensesTable.date,
      isBillable: expensesTable.isBillable,
      invoicedAt: expensesTable.invoicedAt,
      createdAt: expensesTable.createdAt,
      createdBy: expensesTable.createdBy,
      creatorEmail: usersTable.email,
      creatorFirstName: usersTable.firstName,
      creatorLastName: usersTable.lastName,
    })
    .from(expensesTable)
    .leftJoin(usersTable, eq(expensesTable.createdBy, usersTable.id))
    .where(eq(expensesTable.projectId, projectId))
    .orderBy(expensesTable.date);

  res.json(expenses);
});

router.post("/projects/:id/expenses", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!STAFF_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  const allowed = await canAccessProject(user.id, user.role, projectId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = ExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const canSetBillable = ADMIN_PM.includes(user.role);
  const [expense] = await db.insert(expensesTable).values({
    projectId,
    createdBy: user.id,
    amount: parsed.data.amount,
    currency: parsed.data.currency ?? "EUR",
    category: parsed.data.category ?? "other",
    description: parsed.data.description,
    date: parsed.data.date,
    isBillable: canSetBillable ? (parsed.data.isBillable ?? false) : false,
  }).returning();

  res.status(201).json(expense);
});

router.patch("/projects/:id/expenses/:expenseId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!STAFF_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  const expenseId = parseInt(String(req.params.expenseId));
  if (isNaN(projectId) || isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = await canAccessProject(user.id, user.role, projectId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const PatchBody = ExpenseBody.partial().extend({
    isBillable: z.boolean().optional(),
  });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(expensesTable).where(
    and(eq(expensesTable.id, expenseId), eq(expensesTable.projectId, projectId))
  );
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }

  const isAdminPm = ADMIN_PM.includes(user.role);
  if (!isAdminPm && existing.createdBy !== user.id) {
    res.status(403).json({ error: "Only the expense creator or an admin/project manager can update this expense" });
    return;
  }

  const updates: Partial<typeof expensesTable.$inferInsert> = { ...parsed.data, updatedAt: new Date() };
  if (!isAdminPm) delete updates.isBillable;

  const [updated] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, expenseId)).returning();
  res.json(updated);
});

router.delete("/projects/:id/expenses/:expenseId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!STAFF_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  const expenseId = parseInt(String(req.params.expenseId));
  if (isNaN(projectId) || isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const allowed = await canAccessProject(user.id, user.role, projectId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const [existing] = await db.select().from(expensesTable).where(
    and(eq(expensesTable.id, expenseId), eq(expensesTable.projectId, projectId))
  );
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (existing.invoicedAt) { res.status(409).json({ error: "Cannot delete an expense that has already been invoiced" }); return; }

  if (!ADMIN_PM.includes(user.role) && existing.createdBy !== user.id) {
    res.status(403).json({ error: "Only the expense creator or an admin/project manager can delete this expense" });
    return;
  }

  await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));
  res.status(204).send();
});

router.get("/projects/:id/expenses/unbilled", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!STAFF_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  const allowed = await canAccessProject(user.id, user.role, projectId);
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(and(
      eq(expensesTable.projectId, projectId),
      eq(expensesTable.isBillable, true),
      isNull(expensesTable.invoicedAt),
    ))
    .orderBy(expensesTable.date);

  res.json(expenses);
});

router.post("/projects/:id/expenses/mark-invoiced", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_PM.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project id" }); return; }

  const Body = z.object({ expenseIds: z.array(z.number().int()).min(1) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { expenseIds } = parsed.data;

  const validExpenses = await db.select({ id: expensesTable.id })
    .from(expensesTable)
    .where(and(
      inArray(expensesTable.id, expenseIds),
      eq(expensesTable.projectId, projectId),
      eq(expensesTable.isBillable, true),
      isNull(expensesTable.invoicedAt),
    ));
  const validIds = validExpenses.map(e => e.id);
  const invalidIds = expenseIds.filter(id => !validIds.includes(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: `Invalid expenseIds: ${invalidIds.join(", ")} — must belong to project, be billable, and not yet invoiced` });
    return;
  }

  if (validIds.length > 0) {
    const now = new Date();
    await db.update(expensesTable)
      .set({ invoicedAt: now, updatedAt: now })
      .where(inArray(expensesTable.id, validIds));
  }

  res.json({ success: true, count: validIds.length });
});

export default router;
