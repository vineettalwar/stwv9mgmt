import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, milestonesTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const STATUSES = ["pending", "completed"] as const;

const CreateMilestoneBody = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: z.string().nullable().optional(),
});

const UpdateMilestoneBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

// LIST
router.get("/projects/:id/milestones", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(milestonesTable).where(eq(milestonesTable.projectId, projectId));
  res.json(rows);
});

// CREATE
router.post("/projects/:id/milestones", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [m] = await db.insert(milestonesTable).values({ projectId, ...parsed.data }).returning();
  res.status(201).json(m);
});

// UPDATE
router.patch("/projects/:id/milestones/:milestoneId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const milestoneId = parseInt(String(req.params.milestoneId));
  if (isNaN(milestoneId)) { res.status(400).json({ error: "Invalid milestoneId" }); return; }
  const parsed = UpdateMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.completedAt) {
    update.completedAt = new Date(parsed.data.completedAt);
  } else if (parsed.data.completedAt === null) {
    update.completedAt = null;
  }

  const [m] = await db.update(milestonesTable).set(update).where(eq(milestonesTable.id, milestoneId)).returning();
  if (!m) { res.status(404).json({ error: "Not found" }); return; }
  res.json(m);
});

// DELETE
router.delete("/projects/:id/milestones/:milestoneId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const milestoneId = parseInt(String(req.params.milestoneId));
  if (isNaN(milestoneId)) { res.status(400).json({ error: "Invalid milestoneId" }); return; }
  await db.delete(milestonesTable).where(eq(milestonesTable.id, milestoneId));
  res.sendStatus(204);
});

export default router;
