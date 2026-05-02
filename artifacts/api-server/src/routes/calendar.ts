import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  milestonesTable,
  complianceChecklistsTable,
  invoicesTable,
  projectAssignmentsTable,
  projectsTable,
} from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

type CalendarEvent = {
  id: string;
  type: "milestone" | "compliance" | "invoice" | "overdue";
  title: string;
  date: string;
  status: string;
  entityId: number;
  projectId: number | null;
  projectName: string | null;
  linkPath: string;
};

const COMPLIANCE_ROLES = ["admin", "germany_accountant", "india_accountant"];
const INVOICE_ROLES = ["admin", "germany_accountant", "india_accountant", "project_manager"];
const MILESTONE_ROLES = ["admin", "germany_accountant", "india_accountant", "project_manager", "freelancer"];

router.get("/calendar/events", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;

  if (user.role === "client") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const QuerySchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start must be YYYY-MM-DD"),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end must be YYYY-MM-DD"),
  });

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "start and end query params (YYYY-MM-DD) are required" });
    return;
  }

  const { start, end } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const events: CalendarEvent[] = [];

  if (MILESTONE_ROLES.includes(user.role)) {
    if (user.role === "freelancer") {
      const assignments = await db
        .select({ projectId: projectAssignmentsTable.projectId })
        .from(projectAssignmentsTable)
        .where(eq(projectAssignmentsTable.userId, user.id));

      const projectIds = assignments.map((a) => a.projectId);

      if (projectIds.length > 0) {
        const milestones = await db
          .select({
            id: milestonesTable.id,
            title: milestonesTable.title,
            dueDate: milestonesTable.dueDate,
            status: milestonesTable.status,
            projectId: milestonesTable.projectId,
          })
          .from(milestonesTable)
          .where(and(
            inArray(milestonesTable.projectId, projectIds),
            gte(milestonesTable.dueDate, start),
            lte(milestonesTable.dueDate, end),
          ));

        const projects = await db
          .select({ id: projectsTable.id, name: projectsTable.name })
          .from(projectsTable)
          .where(inArray(projectsTable.id, projectIds));
        const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

        for (const m of milestones) {
          if (!m.dueDate) continue;
          const isOverdue = m.dueDate < today && m.status !== "completed";
          events.push({
            id: `milestone-${m.id}`,
            type: isOverdue ? "overdue" : "milestone",
            title: m.title,
            date: m.dueDate,
            status: m.status,
            entityId: m.id,
            projectId: m.projectId,
            projectName: projectMap[m.projectId] ?? null,
            linkPath: `/projects/${m.projectId}`,
          });
        }
      }
    } else {
      const milestones = await db
        .select({
          id: milestonesTable.id,
          title: milestonesTable.title,
          dueDate: milestonesTable.dueDate,
          status: milestonesTable.status,
          projectId: milestonesTable.projectId,
        })
        .from(milestonesTable)
        .where(and(
          gte(milestonesTable.dueDate, start),
          lte(milestonesTable.dueDate, end),
        ));

      const projectIds = [...new Set(milestones.map((m) => m.projectId))];
      let projectMap: Record<number, string> = {};
      if (projectIds.length > 0) {
        const projects = await db
          .select({ id: projectsTable.id, name: projectsTable.name })
          .from(projectsTable)
          .where(inArray(projectsTable.id, projectIds));
        projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      }

      for (const m of milestones) {
        if (!m.dueDate) continue;
        const isOverdue = m.dueDate < today && m.status !== "completed";
        events.push({
          id: `milestone-${m.id}`,
          type: isOverdue ? "overdue" : "milestone",
          title: m.title,
          date: m.dueDate,
          status: m.status,
          entityId: m.id,
          projectId: m.projectId,
          projectName: projectMap[m.projectId] ?? null,
          linkPath: `/projects/${m.projectId}`,
        });
      }
    }
  }

  if (COMPLIANCE_ROLES.includes(user.role)) {
    const compliance = await db
      .select({
        id: complianceChecklistsTable.id,
        itemLabel: complianceChecklistsTable.itemLabel,
        deadline: complianceChecklistsTable.deadline,
        status: complianceChecklistsTable.status,
      })
      .from(complianceChecklistsTable)
      .where(and(
        gte(complianceChecklistsTable.deadline, start),
        lte(complianceChecklistsTable.deadline, end),
      ));

    for (const c of compliance) {
      const isOverdue = c.deadline < today && c.status !== "filed";
      events.push({
        id: `compliance-${c.id}`,
        type: isOverdue ? "overdue" : "compliance",
        title: c.itemLabel,
        date: c.deadline,
        status: c.status,
        entityId: c.id,
        projectId: null,
        projectName: null,
        linkPath: "/compliance",
      });
    }
  }

  if (INVOICE_ROLES.includes(user.role)) {
    const invoices = await db
      .select({
        id: invoicesTable.id,
        title: invoicesTable.title,
        invoiceNumber: invoicesTable.invoiceNumber,
        dueDate: invoicesTable.dueDate,
        status: invoicesTable.status,
      })
      .from(invoicesTable)
      .where(and(
        gte(invoicesTable.dueDate, start),
        lte(invoicesTable.dueDate, end),
      ));

    for (const inv of invoices) {
      if (!inv.dueDate) continue;
      const isOverdue = inv.dueDate < today && !["paid", "cancelled"].includes(inv.status);
      events.push({
        id: `invoice-${inv.id}`,
        type: isOverdue ? "overdue" : "invoice",
        title: `${inv.invoiceNumber}: ${inv.title}`,
        date: inv.dueDate,
        status: inv.status,
        entityId: inv.id,
        projectId: null,
        projectName: null,
        linkPath: `/invoices/${inv.id}`,
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  res.json(events);
});

export default router;
