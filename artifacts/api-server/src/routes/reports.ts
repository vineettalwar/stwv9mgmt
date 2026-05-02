import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const REPORT_ROLES = ["admin", "project_manager"];

function requireReporter(req: import("express").Request, res: import("express").Response): boolean {
  const user = req.dbUser;
  if (!user || !REPORT_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function parseIntOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? undefined : n;
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map(r => columns.map(c => csvCell(r[c] as string | number | null | undefined)).join(","));
  return [header, ...body].join("\n");
}

// ── REVENUE TREND ──
// Monthly invoiced totals over last N months (default 12), broken down by company.
async function fetchRevenueTrend(months: number, companyId: number | undefined) {
  const monthsClamped = Math.min(Math.max(months, 1), 36);
  const companyFilter = companyId ? sql`AND i.company_id = ${companyId}` : sql``;

  const result = await db.execute(sql`
    WITH months AS (
      SELECT to_char(date_trunc('month', current_date) - (n || ' month')::interval, 'YYYY-MM') AS month
      FROM generate_series(0, ${monthsClamped - 1}) AS n
    )
    SELECT
      m.month,
      c.id AS company_id,
      c.name AS company_name,
      coalesce(c.currency, 'EUR') AS currency,
      coalesce(sum(i.total_amount::numeric), 0)::text AS total
    FROM months m
    CROSS JOIN companies c
    LEFT JOIN invoices i
      ON i.company_id = c.id
      AND to_char(i.issue_date::date, 'YYYY-MM') = m.month
      AND i.status IN ('sent', 'paid', 'overdue')
      ${companyFilter}
    GROUP BY m.month, c.id, c.name, c.currency
    ORDER BY m.month ASC, c.name ASC
  `);

  return (result.rows as Array<{ month: string; company_id: number; company_name: string; currency: string; total: string }>).map(r => ({
    month: r.month,
    companyId: r.company_id,
    companyName: r.company_name,
    currency: r.currency,
    total: r.total,
  }));
}

router.get("/reports/revenue-trend", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  if (!requireReporter(req, res)) return;
  const months = parseIntOrUndef(req.query.months) ?? 12;
  const companyId = parseIntOrUndef(req.query.companyId);
  const data = await fetchRevenueTrend(months, companyId);
  res.json({ months, companyId: companyId ?? null, points: data });
});

// ── PROJECT PROFITABILITY ──
// For each project: total invoiced (sent/paid/overdue), total cost (hours * rate), margin.
async function fetchProjectProfitability(companyId: number | undefined, startDate: string | undefined, endDate: string | undefined) {
  const companyFilter = companyId ? sql`AND p.company_id = ${companyId}` : sql``;
  const invDateFilter = startDate && endDate
    ? sql`AND i.issue_date::date BETWEEN ${startDate}::date AND ${endDate}::date`
    : sql``;
  const teDateFilter = startDate && endDate
    ? sql`AND te.date::date BETWEEN ${startDate}::date AND ${endDate}::date`
    : sql``;

  const result = await db.execute(sql`
    WITH invoiced AS (
      SELECT i.project_id, coalesce(sum(i.total_amount::numeric), 0) AS total_invoiced, max(i.currency) AS currency
      FROM invoices i
      WHERE i.status IN ('sent', 'paid', 'overdue')
        ${invDateFilter}
      GROUP BY i.project_id
    ),
    costs AS (
      SELECT te.project_id,
             coalesce(sum(te.hours::numeric), 0) AS total_hours,
             coalesce(sum(te.hours::numeric * coalesce(pa.hourly_rate::numeric, 0)), 0) AS total_cost
      FROM time_entries te
      LEFT JOIN project_assignments pa
        ON pa.project_id = te.project_id AND pa.user_id = te.user_id
      WHERE 1 = 1
        ${teDateFilter}
      GROUP BY te.project_id
    )
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.status,
      c.id AS company_id,
      c.name AS company_name,
      coalesce(c.currency, 'EUR') AS currency,
      coalesce(inv.total_invoiced, 0)::text AS total_invoiced,
      coalesce(co.total_hours, 0)::text AS total_hours,
      coalesce(co.total_cost, 0)::text AS total_cost,
      (coalesce(inv.total_invoiced, 0) - coalesce(co.total_cost, 0))::text AS margin
    FROM projects p
    LEFT JOIN companies c ON c.id = p.company_id
    LEFT JOIN invoiced inv ON inv.project_id = p.id
    LEFT JOIN costs co ON co.project_id = p.id
    WHERE 1 = 1
      ${companyFilter}
    ORDER BY (coalesce(inv.total_invoiced, 0) - coalesce(co.total_cost, 0)) DESC
  `);

  return (result.rows as Array<{
    project_id: number; project_name: string; status: string;
    company_id: number | null; company_name: string | null; currency: string;
    total_invoiced: string; total_hours: string; total_cost: string; margin: string;
  }>).map(r => ({
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status,
    companyId: r.company_id,
    companyName: r.company_name,
    currency: r.currency,
    totalInvoiced: r.total_invoiced,
    totalHours: r.total_hours,
    totalCost: r.total_cost,
    margin: r.margin,
  }));
}

router.get("/reports/project-profitability", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  if (!requireReporter(req, res)) return;
  const companyId = parseIntOrUndef(req.query.companyId);
  const startDate = isValidDate(req.query.startDate) ? req.query.startDate : undefined;
  const endDate = isValidDate(req.query.endDate) ? req.query.endDate : undefined;
  const data = await fetchProjectProfitability(companyId, startDate, endDate);
  res.json({
    companyId: companyId ?? null,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    rows: data,
  });
});

// ── TIME TRACKING SUMMARY ──
// Hours per project and per freelancer for a date range.
async function fetchTimeSummary(startDate: string, endDate: string, companyId: number | undefined) {
  const companyFilter = companyId ? sql`AND p.company_id = ${companyId}` : sql``;

  const byProject = await db.execute(sql`
    SELECT p.id AS project_id, p.name AS project_name,
           c.name AS company_name,
           coalesce(sum(te.hours::numeric), 0)::text AS total_hours
    FROM time_entries te
    JOIN projects p ON p.id = te.project_id
    LEFT JOIN companies c ON c.id = p.company_id
    WHERE te.date::date BETWEEN ${startDate}::date AND ${endDate}::date
      ${companyFilter}
    GROUP BY p.id, p.name, c.name
    ORDER BY total_hours DESC
  `);

  const byUser = await db.execute(sql`
    SELECT u.id AS user_id, u.email,
           u.first_name, u.last_name, u.role,
           coalesce(sum(te.hours::numeric), 0)::text AS total_hours
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    JOIN projects p ON p.id = te.project_id
    WHERE te.date::date BETWEEN ${startDate}::date AND ${endDate}::date
      ${companyFilter}
    GROUP BY u.id, u.email, u.first_name, u.last_name, u.role
    ORDER BY total_hours DESC
  `);

  return {
    byProject: (byProject.rows as Array<{ project_id: number; project_name: string; company_name: string | null; total_hours: string }>).map(r => ({
      projectId: r.project_id,
      projectName: r.project_name,
      companyName: r.company_name,
      totalHours: r.total_hours,
    })),
    byUser: (byUser.rows as Array<{ user_id: number; email: string; first_name: string | null; last_name: string | null; role: string; total_hours: string }>).map(r => ({
      userId: r.user_id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      totalHours: r.total_hours,
    })),
  };
}

router.get("/reports/time-summary", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  if (!requireReporter(req, res)) return;
  const startDate = isValidDate(req.query.startDate) ? req.query.startDate : undefined;
  const endDate = isValidDate(req.query.endDate) ? req.query.endDate : undefined;
  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate (YYYY-MM-DD) are required" });
    return;
  }
  const companyId = parseIntOrUndef(req.query.companyId);
  const data = await fetchTimeSummary(startDate, endDate, companyId);
  res.json({ startDate, endDate, companyId: companyId ?? null, ...data });
});

// ── CSV EXPORT ──
router.get("/reports/export", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  if (!requireReporter(req, res)) return;
  const reportType = String(req.query.type ?? "");
  const companyId = parseIntOrUndef(req.query.companyId);
  const startDate = isValidDate(req.query.startDate) ? req.query.startDate : undefined;
  const endDate = isValidDate(req.query.endDate) ? req.query.endDate : undefined;

  let csv: string;
  let filename: string;

  if (reportType === "revenue-trend") {
    const months = parseIntOrUndef(req.query.months) ?? 12;
    const points = await fetchRevenueTrend(months, companyId);
    csv = toCsv(
      points.map(p => ({ month: p.month, companyId: p.companyId, companyName: p.companyName, currency: p.currency, total: p.total })),
      ["month", "companyId", "companyName", "currency", "total"],
    );
    filename = `revenue-trend-${months}m.csv`;
  } else if (reportType === "project-profitability") {
    const rows = await fetchProjectProfitability(companyId, startDate, endDate);
    csv = toCsv(
      rows.map(r => ({
        projectId: r.projectId, projectName: r.projectName, status: r.status,
        companyName: r.companyName ?? "", currency: r.currency,
        totalInvoiced: r.totalInvoiced, totalHours: r.totalHours, totalCost: r.totalCost, margin: r.margin,
      })),
      ["projectId", "projectName", "status", "companyName", "currency", "totalInvoiced", "totalHours", "totalCost", "margin"],
    );
    filename = "project-profitability.csv";
  } else if (reportType === "time-summary") {
    if (!startDate || !endDate) { res.status(400).json({ error: "startDate and endDate required" }); return; }
    const data = await fetchTimeSummary(startDate, endDate, companyId);
    const projectCsv = toCsv(
      data.byProject.map(r => ({ section: "by_project", projectId: r.projectId, projectName: r.projectName, companyName: r.companyName ?? "", userId: "", userName: "", role: "", totalHours: r.totalHours })),
      ["section", "projectId", "projectName", "companyName", "userId", "userName", "role", "totalHours"],
    );
    const userCsv = data.byUser.map(r => [
      csvCell("by_user"), csvCell(""), csvCell(""), csvCell(""),
      csvCell(r.userId),
      csvCell([r.firstName, r.lastName].filter(Boolean).join(" ") || r.email),
      csvCell(r.role), csvCell(r.totalHours),
    ].join(",")).join("\n");
    csv = userCsv ? `${projectCsv}\n${userCsv}` : projectCsv;
    filename = `time-summary-${startDate}_to_${endDate}.csv`;
  } else {
    res.status(400).json({ error: "Unknown report type. Use revenue-trend | project-profitability | time-summary" });
    return;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
