import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  projectsTable,
  projectAssignmentsTable,
  usersTable,
  companiesTable,
  timeEntriesTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";
import { logAudit, logAuditTx } from "../lib/auditLogger";

const router: IRouter = Router();

const PROJECT_TYPES = ["one_time", "monthly_fixed", "amc", "internal"] as const;
const PROJECT_STATUSES = ["active", "completed", "on_hold"] as const;
const BILLING_MODELS = ["hourly", "fixed", "retainer"] as const;

const CreateProjectBody = z.object({
  name: z.string().min(1),
  type: z.enum(PROJECT_TYPES),
  companyId: z.number().int(),
  clientId: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  billingModel: z.enum(BILLING_MODELS),
  fixedAllocationHours: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const UpdateProjectBody = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(PROJECT_TYPES).optional(),
  companyId: z.number().int().optional(),
  clientId: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  billingModel: z.enum(BILLING_MODELS).optional(),
  fixedAllocationHours: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

async function getProjectWithDetails(projectId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, project.companyId));

  let client = null;
  if (project.clientId) {
    const [u] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.id, project.clientId));
    client = u ?? null;
  }

  return { ...project, company, client };
}

// LIST projects — filtered by role
router.get("/projects", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  let rows;
  if (user.role === "client") {
    rows = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.clientId, user.id));
  } else if (user.role === "freelancer") {
    const assignments = await db
      .select({ projectId: projectAssignmentsTable.projectId })
      .from(projectAssignmentsTable)
      .where(eq(projectAssignmentsTable.userId, user.id));
    const projectIds = assignments.map((a) => a.projectId);
    if (projectIds.length === 0) {
      res.json([]);
      return;
    }
    rows = await db
      .select()
      .from(projectsTable)
      .where(inArray(projectsTable.id, projectIds));
  } else {
    rows = await db.select().from(projectsTable).orderBy(projectsTable.id);
  }

  const projects = await Promise.all(rows.map((r) => getProjectWithDetails(r.id)));
  res.json(projects.filter(Boolean));
});

// CREATE project
router.post("/projects", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let project: { id: number; name: string; status: string };
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(projectsTable)
      .values(parsed.data)
      .returning();
    project = inserted;
    await logAuditTx(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "status_changed",
      entityType: "project",
      entityId: inserted.id,
      entityLabel: inserted.name,
      oldValue: null,
      newValue: { status: inserted.status, name: inserted.name },
      projectId: inserted.id,
    });
  });
  const full = await getProjectWithDetails(project!.id);
  res.status(201).json(full);
});

// GET project
router.get("/projects/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;
  const project = await getProjectWithDetails(id);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Access control
  if (user.role === "client" && project.clientId !== user.id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (user.role === "freelancer") {
    const [a] = await db
      .select()
      .from(projectAssignmentsTable)
      .where(and(eq(projectAssignmentsTable.projectId, id), eq(projectAssignmentsTable.userId, user.id)));
    if (!a) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  res.json(project);
});

// UPDATE project
router.patch("/projects/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }

  let project: typeof projectsTable.$inferSelect;
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projectsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();
    if (!updated) throw Object.assign(new Error("Project not found"), { status: 404 });
    project = updated;
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await logAuditTx(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: "status_changed",
        entityType: "project",
        entityId: id,
        entityLabel: existing.name,
        oldValue: { status: existing.status },
        newValue: { status: parsed.data.status },
        projectId: id,
      });
    }
  });

  const full = await getProjectWithDetails(project!.id);
  res.json(full);
});

// DELETE project
router.delete("/projects/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select({ name: projectsTable.name, status: projectsTable.status })
    .from(projectsTable).where(eq(projectsTable.id, id));
  await db.transaction(async (tx) => {
    await tx.delete(projectsTable).where(eq(projectsTable.id, id));
    await logAuditTx(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: "status_changed",
      entityType: "project",
      entityId: id,
      entityLabel: existing?.name ?? null,
      oldValue: existing ? { status: existing.status, name: existing.name } : null,
      newValue: { status: "deleted" },
      projectId: id,
    });
  });
  res.sendStatus(204);
});

// LIST assignments
router.get("/projects/:id/assignments", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select({
      id: projectAssignmentsTable.id,
      projectId: projectAssignmentsTable.projectId,
      userId: projectAssignmentsTable.userId,
      memberType: projectAssignmentsTable.memberType,
      hourlyRate: projectAssignmentsTable.hourlyRate,
      monthlyRate: projectAssignmentsTable.monthlyRate,
      createdAt: projectAssignmentsTable.createdAt,
      user: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      },
    })
    .from(projectAssignmentsTable)
    .innerJoin(usersTable, eq(projectAssignmentsTable.userId, usersTable.id))
    .where(eq(projectAssignmentsTable.projectId, id));
  res.json(rows);
});

// ADD assignment
router.post("/projects/:id/assignments", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Body = z.object({
    userId: z.number().int(),
    memberType: z.enum(["employee", "freelancer"]),
    hourlyRate: z.string().nullable().optional(),
    monthlyRate: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [assignment] = await db
    .insert(projectAssignmentsTable)
    .values({ projectId: id, ...parsed.data })
    .onConflictDoNothing()
    .returning();

  const assignmentId = assignment?.id ?? (await db
    .select({ id: projectAssignmentsTable.id })
    .from(projectAssignmentsTable)
    .where(and(eq(projectAssignmentsTable.projectId, id), eq(projectAssignmentsTable.userId, parsed.data.userId)))
    .then(r => r[0]?.id));

  const [row] = await db
    .select({
      id: projectAssignmentsTable.id,
      projectId: projectAssignmentsTable.projectId,
      userId: projectAssignmentsTable.userId,
      memberType: projectAssignmentsTable.memberType,
      hourlyRate: projectAssignmentsTable.hourlyRate,
      monthlyRate: projectAssignmentsTable.monthlyRate,
      createdAt: projectAssignmentsTable.createdAt,
      user: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      },
    })
    .from(projectAssignmentsTable)
    .innerJoin(usersTable, eq(projectAssignmentsTable.userId, usersTable.id))
    .where(eq(projectAssignmentsTable.id, assignmentId!));

  res.status(201).json(row);
});

// REMOVE assignment
router.delete("/projects/:id/assignments/:userId", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const projectId = parseInt(String(req.params.id));
  const userId = parseInt(String(req.params.userId));
  await db.delete(projectAssignmentsTable).where(
    and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, userId))
  );
  res.sendStatus(204);
});

// BILLING SUMMARY
router.get("/projects/:id/billing-summary", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);

  const entries = await db
    .select()
    .from(timeEntriesTable)
    .where(and(
      eq(timeEntriesTable.projectId, id),
    ));

  const monthEntries = entries.filter(e => e.date.startsWith(month));

  const loggedHours = monthEntries.reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);

  // Group by user
  const byUser: Record<number, number> = {};
  for (const e of monthEntries) {
    byUser[e.userId] = (byUser[e.userId] ?? 0) + parseFloat(e.hours || "0");
  }

  const userIds = Object.keys(byUser).map(Number);
  const users = userIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];

  const memberBreakdown = users.map(u => ({
    userId: u.id,
    userName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
    loggedHours: (byUser[u.id] ?? 0).toFixed(2),
  }));

  const fixedAllocation = project.fixedAllocationHours ? parseFloat(project.fixedAllocationHours) : null;
  const remainingHours = fixedAllocation !== null ? (fixedAllocation - loggedHours).toFixed(2) : null;

  res.json({
    projectId: id,
    month,
    fixedAllocationHours: project.fixedAllocationHours ?? null,
    loggedHours: loggedHours.toFixed(2),
    remainingHours,
    memberBreakdown,
  });
});

export default router;
