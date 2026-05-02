import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  timeEntriesTable,
  projectsTable,
  projectAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const CreateTimeEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.string(),
  description: z.string().nullable().optional(),
});

const UpdateTimeEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hours: z.string().optional(),
  description: z.string().nullable().optional(),
});

// LIST time entries for a project
router.get("/projects/:id/time-entries", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const month = req.query.month as string | undefined;
  const filterUserId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

  let entries = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.projectId, projectId))
    .orderBy(timeEntriesTable.date);

  // Freelancers/clients only see their own entries
  if (user.role === "freelancer") {
    entries = entries.filter(e => e.userId === user.id);
  } else if (user.role === "client") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (month) {
    entries = entries.filter(e => e.date.startsWith(month));
  }
  if (filterUserId) {
    entries = entries.filter(e => e.userId === filterUserId);
  }

  res.json(entries);
});

// LOG time entry
router.post("/projects/:id/time-entries", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Check access for freelancers
  if (user.role === "freelancer") {
    const [a] = await db
      .select()
      .from(projectAssignmentsTable)
      .where(and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, user.id)));
    if (!a) { res.status(403).json({ error: "Forbidden: not assigned to project" }); return; }
  } else if (user.role === "client") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const parsed = CreateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Determine userId: staff can log for themselves; freelancers log for themselves
  const userId = user.id;

  const [entry] = await db
    .insert(timeEntriesTable)
    .values({ projectId, userId, ...parsed.data })
    .returning();

  res.status(201).json(entry);
});

// UPDATE time entry
router.patch("/projects/:id/time-entries/:entryId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const entryId = parseInt(String(req.params.entryId));
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entryId" }); return; }

  const [existing] = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, entryId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // Only owner or admin/pm can update
  if (!["admin", "project_manager"].includes(user.role) && existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const parsed = UpdateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db
    .update(timeEntriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(timeEntriesTable.id, entryId))
    .returning();
  res.json(entry);
});

// DELETE time entry
router.delete("/projects/:id/time-entries/:entryId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const entryId = parseInt(String(req.params.entryId));
  if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entryId" }); return; }

  const [existing] = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, entryId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (!["admin", "project_manager"].includes(user.role) && existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, entryId));
  res.sendStatus(204);
});

// LIST my time entries (current user or all if admin)
router.get("/time-entries", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const month = req.query.month as string | undefined;

  let entries;
  if (["admin", "germany_accountant", "india_accountant"].includes(user.role)) {
    entries = await db.select().from(timeEntriesTable).orderBy(timeEntriesTable.date);
  } else {
    entries = await db
      .select()
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.userId, user.id))
      .orderBy(timeEntriesTable.date);
  }

  if (month) {
    entries = entries.filter(e => e.date.startsWith(month));
  }

  // Enrich with project names
  const projectIds = [...new Set(entries.map(e => e.projectId))];
  const projects = projectIds.length > 0
    ? await db.select().from(projectsTable).where(inArray(projectsTable.id, projectIds))
    : [];
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  // Enrich freelancers with their hourly rate per project (for earnings calculation)
  let rateMap: Record<number, string | null> = {};
  if (user.role === "freelancer" && projectIds.length > 0) {
    const rateRows = await db
      .select({ projectId: projectAssignmentsTable.projectId, hourlyRate: projectAssignmentsTable.hourlyRate })
      .from(projectAssignmentsTable)
      .where(and(eq(projectAssignmentsTable.userId, user.id), inArray(projectAssignmentsTable.projectId, projectIds)));
    rateMap = Object.fromEntries(rateRows.map(r => [r.projectId, r.hourlyRate ?? null]));
  }

  const result = entries.map(e => ({
    ...e,
    projectName: projectMap[e.projectId] ?? "Unknown",
    hourlyRate: rateMap[e.projectId] ?? null,
  }));

  res.json(result);
});

export default router;
