import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, usersTable, timeEntriesTable, projectsTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

router.get("/resources/capacity", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!["admin", "project_manager"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const from = isValidDate(req.query.from) ? req.query.from : undefined;
  const to = isValidDate(req.query.to) ? req.query.to : undefined;

  if (!from || !to) {
    res.status(400).json({ error: "from and to (YYYY-MM-DD) are required" });
    return;
  }

  const rangeStart = getMondayOf(from);
  const rangeEnd = addDays(getMondayOf(to), 6);

  const weeks: string[] = [];
  let cur = rangeStart;
  while (cur <= rangeEnd) {
    weeks.push(cur);
    cur = addDays(cur, 7);
  }

  const freelancers = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      weeklyCapacityHours: usersTable.weeklyCapacityHours,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "freelancer"), eq(usersTable.isActive, true)))
    .orderBy(usersTable.lastName, usersTable.firstName);

  if (freelancers.length === 0) {
    res.json({ from, to, weeks, freelancers: [] });
    return;
  }

  const freelancerIds = freelancers.map(f => f.id);

  const entries = await db
    .select({
      userId: timeEntriesTable.userId,
      date: timeEntriesTable.date,
      hours: timeEntriesTable.hours,
      projectId: projectsTable.id,
      projectName: projectsTable.name,
    })
    .from(timeEntriesTable)
    .innerJoin(projectsTable, eq(timeEntriesTable.projectId, projectsTable.id))
    .where(
      and(
        inArray(timeEntriesTable.userId, freelancerIds),
        gte(timeEntriesTable.date, rangeStart),
        lte(timeEntriesTable.date, rangeEnd)
      )
    );

  const result = freelancers.map(f => {
    const userEntries = entries.filter(e => e.userId === f.id);
    const weekData = weeks.map(weekStart => {
      const weekEnd = addDays(weekStart, 6);
      const weekEntries = userEntries.filter(e => e.date >= weekStart && e.date <= weekEnd);

      const projectMap = new Map<number, { projectId: number; projectName: string; hours: number }>();
      let loggedHours = 0;

      for (const e of weekEntries) {
        const h = parseFloat(e.hours);
        loggedHours += h;
        const existing = projectMap.get(e.projectId);
        if (existing) {
          existing.hours += h;
        } else {
          projectMap.set(e.projectId, { projectId: e.projectId, projectName: e.projectName, hours: h });
        }
      }

      const roundedLogged = Math.round(loggedHours * 10) / 10;
      const capacity = f.weeklyCapacityHours;
      const utilization = capacity > 0 ? Math.round((loggedHours / capacity) * 100) : 0;

      return {
        weekStart,
        loggedHours: roundedLogged,
        utilization,
        projects: Array.from(projectMap.values()).map(p => ({
          ...p,
          hours: Math.round(p.hours * 10) / 10,
        })),
      };
    });

    return {
      userId: f.id,
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email,
      weeklyCapacityHours: f.weeklyCapacityHours,
      weeks: weekData,
    };
  });

  res.json({ from, to, weeks, freelancers: result });
});

export default router;
