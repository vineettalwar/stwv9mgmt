import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, auditLogsTable, usersTable, projectAssignmentsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

// GET /audit-logs — admin only, filterable
router.get("/audit-logs", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const conditions = [];

  if (req.query.entity_type) {
    conditions.push(eq(auditLogsTable.entityType, String(req.query.entity_type)));
  }
  if (req.query.entity_id) {
    const eid = parseInt(String(req.query.entity_id));
    if (!isNaN(eid)) conditions.push(eq(auditLogsTable.entityId, eid));
  }
  if (req.query.actor_id) {
    const aid = parseInt(String(req.query.actor_id));
    if (!isNaN(aid)) conditions.push(eq(auditLogsTable.actorId, aid));
  }
  if (req.query.action) {
    conditions.push(eq(auditLogsTable.action, String(req.query.action)));
  }
  if (req.query.date_from) {
    conditions.push(gte(auditLogsTable.createdAt, new Date(String(req.query.date_from))));
  }
  if (req.query.date_to) {
    const to = new Date(String(req.query.date_to));
    to.setDate(to.getDate() + 1);
    conditions.push(lte(auditLogsTable.createdAt, to));
  }

  const limitVal = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
  const offsetVal = parseInt(String(req.query.offset ?? "0")) || 0;

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

  // Admins and PMs can see any project activity; others must be assigned
  const isAdminOrPm = ["admin", "project_manager"].includes(user.role);
  if (!isAdminOrPm) {
    const [assignment] = await db
      .select()
      .from(projectAssignmentsTable)
      .where(and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, user.id)));
    if (!assignment) {
      res.status(403).json({ error: "Forbidden" }); return;
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
