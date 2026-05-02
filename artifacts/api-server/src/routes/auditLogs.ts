import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, auditLogsTable, usersTable, projectAssignmentsTable, projectsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const AuditLogQuery = z.object({
  entity_type: z.string().min(1).max(64).optional(),
  entity_id: z.coerce.number().int().positive().optional(),
  actor_id: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(64).optional(),
  date_from: isoDateLike.optional(),
  date_to: isoDateLike.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// GET /audit-logs — admin only, filterable
router.get("/audit-logs", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const parsed = AuditLogQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
    return;
  }
  const q = parsed.data;

  const conditions = [];

  if (q.entity_type) conditions.push(eq(auditLogsTable.entityType, q.entity_type));
  if (q.entity_id) conditions.push(eq(auditLogsTable.entityId, q.entity_id));
  if (q.actor_id) conditions.push(eq(auditLogsTable.actorId, q.actor_id));
  if (q.action) conditions.push(eq(auditLogsTable.action, q.action));
  if (q.date_from) conditions.push(gte(auditLogsTable.createdAt, new Date(q.date_from)));
  if (q.date_to) {
    const to = new Date(q.date_to);
    to.setDate(to.getDate() + 1);
    conditions.push(lte(auditLogsTable.createdAt, to));
  }

  const limitVal = q.limit;
  const offsetVal = q.offset;

  const baseQuery = db
    .select({
      id: auditLogsTable.id,
      createdAt: auditLogsTable.createdAt,
      actorId: auditLogsTable.actorId,
      actorRole: auditLogsTable.actorRole,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      entityLabel: auditLogsTable.entityLabel,
      oldValue: auditLogsTable.oldValue,
      newValue: auditLogsTable.newValue,
      projectId: auditLogsTable.projectId,
      actor: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      },
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorId, usersTable.id));

  const rows = conditions.length > 0
    ? await baseQuery.where(and(...conditions)).orderBy(desc(auditLogsTable.createdAt)).limit(limitVal).offset(offsetVal)
    : await baseQuery.orderBy(desc(auditLogsTable.createdAt)).limit(limitVal).offset(offsetVal);

  res.json(rows);
});

// GET /projects/:id/activity — project-scoped activity, visible to project members and admins
router.get("/projects/:id/activity", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Admins and PMs can see any project activity
  // Clients tied to this project via project.clientId can see it
  // Assigned employees/freelancers can see it
  const isAdminOrPm = ["admin", "project_manager"].includes(user.role);
  if (!isAdminOrPm) {
    // Check if client is the project's client contact
    if (user.role === "client") {
      const [proj] = await db
        .select({ clientId: projectsTable.clientId })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId));
      if (!proj || proj.clientId !== user.id) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    } else {
      // For employees, freelancers etc — must be assigned to the project
      const [assignment] = await db
        .select()
        .from(projectAssignmentsTable)
        .where(and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, user.id)));
      if (!assignment) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }
  }

  const rows = await db
    .select({
      id: auditLogsTable.id,
      createdAt: auditLogsTable.createdAt,
      actorId: auditLogsTable.actorId,
      actorRole: auditLogsTable.actorRole,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      entityLabel: auditLogsTable.entityLabel,
      oldValue: auditLogsTable.oldValue,
      newValue: auditLogsTable.newValue,
      projectId: auditLogsTable.projectId,
      actor: {
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      },
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorId, usersTable.id))
    .where(eq(auditLogsTable.projectId, projectId))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(50);

  res.json(rows);
});

export default router;
