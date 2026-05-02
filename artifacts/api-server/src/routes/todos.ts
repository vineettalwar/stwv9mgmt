import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, todosTable, usersTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const PRIORITIES = ["low", "medium", "high"] as const;
const STATUSES = ["open", "done"] as const;

const CreateTodoBody = z.object({
  projectId: z.number().int().nullable().optional(),
  clientId: z.number().int().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const UpdateTodoBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

async function enrichTodo(t: typeof todosTable.$inferSelect) {
  let assignee = null;
  if (t.assigneeId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, t.assigneeId));
    assignee = u ?? null;
  }
  return { ...t, assignee };
}

// LIST
router.get("/todos", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
  const status = req.query.status as string | undefined;

  let rows = await db.select().from(todosTable).orderBy(todosTable.createdAt);

  // Freelancers see only todos assigned to them or on their projects
  if (user.role === "freelancer") {
    rows = rows.filter(t => t.assigneeId === user.id);
  } else if (user.role === "client") {
    rows = rows.filter(t => t.clientId === user.id);
  }

  if (projectId !== undefined) {
    rows = rows.filter(t => t.projectId === projectId);
  }
  if (status) {
    rows = rows.filter(t => t.status === status);
  }

  const enriched = await Promise.all(rows.map(enrichTodo));
  res.json(enriched);
});

// CREATE
router.post("/todos", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (user.role === "client") { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateTodoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [t] = await db.insert(todosTable).values(parsed.data).returning();
  const enriched = await enrichTodo(t);
  res.status(201).json(enriched);
});

// UPDATE
router.patch("/todos/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(todosTable).where(eq(todosTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const parsed = UpdateTodoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.completedAt) {
    update.completedAt = new Date(parsed.data.completedAt);
  } else if (parsed.data.status === "done" && !existing.completedAt) {
    update.completedAt = new Date();
  } else if (parsed.data.status === "open") {
    update.completedAt = null;
  }

  const [t] = await db.update(todosTable).set(update).where(eq(todosTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichTodo(t);
  res.json(enriched);
});

// DELETE
router.delete("/todos/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(todosTable).where(eq(todosTable.id, id));
  res.sendStatus(204);
});

export default router;
