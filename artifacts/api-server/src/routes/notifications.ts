import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

// GET /notifications — list notifications for current user
router.get("/notifications", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows);
});

// PATCH /notifications/:id/read — mark a notification as read
router.patch("/notifications/:id/read", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;

  const [notification] = await db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)));

  if (!notification) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id));
  res.sendStatus(204);
});

// PATCH /notifications/read-all — mark all as read
router.patch("/notifications/read-all", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));
  res.sendStatus(204);
});

// DELETE /notifications/:id
router.delete("/notifications/:id", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.dbUser!;
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)));
  res.sendStatus(204);
});

export default router;
