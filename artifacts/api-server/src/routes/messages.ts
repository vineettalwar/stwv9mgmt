import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  messageThreadsTable,
  messagesTable,
  usersTable,
  projectsTable,
  projectAssignmentsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

async function canAccessProject(userId: number, userRole: string, projectId: number): Promise<boolean> {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return false;
  if (["admin", "project_manager", "germany_accountant", "india_accountant"].includes(userRole)) return true;
  if (userRole === "client" && project.clientId === userId) return true;
  if (userRole === "freelancer") {
    const [assignment] = await db.select().from(projectAssignmentsTable).where(
      and(eq(projectAssignmentsTable.projectId, projectId), eq(projectAssignmentsTable.userId, userId))
    );
    return !!assignment;
  }
  return false;
}

async function getMessageWithSender(messageId: number) {
  const [row] = await db
    .select({
      id: messagesTable.id,
      threadId: messagesTable.threadId,
      senderId: messagesTable.senderId,
      body: messagesTable.body,
      attachmentUrl: messagesTable.attachmentUrl,
      attachmentName: messagesTable.attachmentName,
      attachmentType: messagesTable.attachmentType,
      isRead: messagesTable.isRead,
      createdAt: messagesTable.createdAt,
      senderEmail: usersTable.email,
      senderFirstName: usersTable.firstName,
      senderLastName: usersTable.lastName,
      senderRole: usersTable.role,
    })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.id, messageId));
  return row ?? null;
}

// GET /projects/:id/thread — get or create thread for project
router.get("/projects/:id/thread", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;

  if (!await canAccessProject(user.id, user.role, projectId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let [thread] = await db.select().from(messageThreadsTable).where(eq(messageThreadsTable.projectId, projectId));
  if (!thread) {
    [thread] = await db.insert(messageThreadsTable).values({ projectId }).returning();
  }

  const messages = await db
    .select({
      id: messagesTable.id,
      threadId: messagesTable.threadId,
      senderId: messagesTable.senderId,
      body: messagesTable.body,
      attachmentUrl: messagesTable.attachmentUrl,
      attachmentName: messagesTable.attachmentName,
      attachmentType: messagesTable.attachmentType,
      isRead: messagesTable.isRead,
      createdAt: messagesTable.createdAt,
      senderEmail: usersTable.email,
      senderFirstName: usersTable.firstName,
      senderLastName: usersTable.lastName,
      senderRole: usersTable.role,
    })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.threadId, thread.id))
    .orderBy(messagesTable.createdAt);

  res.json({ thread, messages });
});

// POST /projects/:id/messages — send a message
router.post("/projects/:id/messages", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.id));
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;

  if (!await canAccessProject(user.id, user.role, projectId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const Body = z.object({
    body: z.string().min(1),
    attachmentUrl: z.string().nullable().optional(),
    attachmentName: z.string().nullable().optional(),
    attachmentType: z.string().nullable().optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let [thread] = await db.select().from(messageThreadsTable).where(eq(messageThreadsTable.projectId, projectId));
  if (!thread) {
    [thread] = await db.insert(messageThreadsTable).values({ projectId }).returning();
  }

  const [message] = await db
    .insert(messagesTable)
    .values({ threadId: thread.id, senderId: user.id, ...parsed.data })
    .returning();

  // Create notifications for project participants
  try {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (project) {
      const recipientIds = new Set<number>();
      // Add client
      if (project.clientId && project.clientId !== user.id) recipientIds.add(project.clientId);
      // Add freelancers
      const assignments = await db
        .select({ userId: projectAssignmentsTable.userId })
        .from(projectAssignmentsTable)
        .where(eq(projectAssignmentsTable.projectId, projectId));
      assignments.forEach(a => { if (a.userId !== user.id) recipientIds.add(a.userId); });

      const senderName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      for (const recipientId of recipientIds) {
        await db.insert(notificationsTable).values({
          userId: recipientId,
          type: "new_message",
          title: `New message in project`,
          body: `${senderName}: ${parsed.data.body.slice(0, 120)}`,
          entityType: "project",
          entityId: projectId,
        });
      }
    }
  } catch (_) { /* notification failures are non-fatal */ }

  const full = await getMessageWithSender(message.id);
  res.status(201).json(full);
});

// PATCH /projects/:projectId/messages/:messageId/read — mark as read
router.patch("/projects/:id/messages/:messageId/read", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.id));
  const messageId = parseInt(String(req.params.messageId));
  if (isNaN(projectId) || isNaN(messageId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;

  if (!await canAccessProject(user.id, user.role, projectId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.update(messagesTable).set({ isRead: true }).where(eq(messagesTable.id, messageId));
  res.sendStatus(204);
});

export default router;
