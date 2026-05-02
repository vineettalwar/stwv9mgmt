import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, deliverablesTable, usersTable, projectsTable, projectAssignmentsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const STATUSES = ["todo", "in_progress", "done"] as const;

const CreateDeliverableBody = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const UpdateDeliverableBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

async function enrichDeliverable(d: typeof deliverablesTable.$inferSelect) {
  let assignee = null;
  if (d.assigneeId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, d.assigneeId));
    assignee = u ?? null;
  }
  return { ...d, assignee };
}

async function canAccessProject(user: typeof import("@workspace/db").usersTable.$inferSelect, projectId: number): Promise<boolean> {
  if (["admin", "project_manager", "germany_accountant", "india_accountant"].includes(user.role)) return true;
  if (user.role === "client") {
    const [p] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.clientId, user.id)));
    return !!p;
  }
  if (user.role === "freelancer") {
    const [a] = await db.select().from(projectAssignmentsTable).where(and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, user.id)));
    return !!a;
  }
  return false;
}

// LIST
router.get("/projects/:id/deliverables", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;
  if (!await canAccessProject(user, projectId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(deliverablesTable).where(eq(deliverablesTable.projectId, projectId));
  const enriched = await Promise.all(rows.map(enrichDeliverable));
  res.json(enriched);
});

// CREATE
router.post("/projects/:id/deliverables", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateDeliverableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [d] = await db.insert(deliverablesTable).values({ projectId, ...parsed.data }).returning();
  const enriched = await enrichDeliverable(d);
  res.status(201).json(enriched);
});

// UPDATE
router.patch("/projects/:id/deliverables/:deliverableId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const deliverableId = parseInt(String(req.params.deliverableId));
  if (isNaN(deliverableId)) { res.status(400).json({ error: "Invalid deliverableId" }); return; }
  const parsed = UpdateDeliverableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [d] = await db.update(deliverablesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(deliverablesTable.id, deliverableId)).returning();
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await enrichDeliverable(d);
  res.json(enriched);
});

// DELETE
router.delete("/projects/:id/deliverables/:deliverableId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const deliverableId = parseInt(String(req.params.deliverableId));
  if (isNaN(deliverableId)) { res.status(400).json({ error: "Invalid deliverableId" }); return; }
  await db.delete(deliverablesTable).where(eq(deliverablesTable.id, deliverableId));
  res.sendStatus(204);
});

export default router;
