import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lte, notInArray } from "drizzle-orm";
import { db, invoicesTable, companiesTable } from "@workspace/db";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const REPORT_ROLES = ["admin", "project_manager"];
const TAX_REPORT_ROLES = ["admin", "germany_accountant", "india_accountant"];

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

// ── TAX SUMMARY ──
// Returns VAT (Germany) or GST (India) breakdown for a company/period.

type TaxBand = {
  label: string;
  taxType: string;
  taxRate: string;
  invoiceCount: number;
  grossAmount: string;
  netAmount: string;
  taxAmount: string;
  cgst: string | null;
  sgst: string | null;
  igst: string | null;
};

type PeriodSummary = {
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  totalGross: string;
  totalNet: string;
  totalTax: string;
  breakdown: TaxBand[];
};

async function computeTaxPeriod(
  companyId: number,
  regime: string,
  periodStart: string,
  periodEnd: string,
): Promise<PeriodSummary> {
  // NOTE on data model: tax_type and tax_rate live on invoice headers; aggregating
  // from headers is equivalent to line-level rollups by design (single-rate invoices).
  if (regime === "germany") {
    const result = await db.execute(sql`
      SELECT
        tax_type,
        tax_rate::text AS tax_rate,
        count(*)::int AS invoice_count,
        coalesce(sum(total_amount::numeric), 0)::text AS gross_amount,
        coalesce(sum(subtotal::numeric), 0)::text AS net_amount,
        coalesce(sum(tax_amount::numeric), 0)::text AS tax_amount
      FROM invoices
      WHERE company_id = ${companyId}
        AND issue_date::date BETWEEN ${periodStart}::date AND ${periodEnd}::date
        AND status NOT IN ('draft', 'cancelled')
      GROUP BY tax_type, tax_rate
      ORDER BY tax_rate::numeric DESC
    `);

    type GermanyRow = { tax_type: string; tax_rate: string; invoice_count: number; gross_amount: string; net_amount: string; tax_amount: string };
    const rows = result.rows as GermanyRow[];

    const totals = rows.reduce((acc, r) => ({
      invoiceCount: acc.invoiceCount + Number(r.invoice_count),
      totalGross: acc.totalGross + parseFloat(r.gross_amount),
      totalNet: acc.totalNet + parseFloat(r.net_amount),
      totalTax: acc.totalTax + parseFloat(r.tax_amount),
    }), { invoiceCount: 0, totalGross: 0, totalNet: 0, totalTax: 0 });

    const breakdown: TaxBand[] = rows.map(r => {
      const rate = parseFloat(r.tax_rate);
      const label = rate === 0 ? "Tax Exempt (0%)" : `VAT ${rate.toFixed(0)}% (Umsatzsteuer)`;
      return {
        label,
        taxType: r.tax_type,
        taxRate: r.tax_rate,
        invoiceCount: Number(r.invoice_count),
        grossAmount: r.gross_amount,
        netAmount: r.net_amount,
        taxAmount: r.tax_amount,
        cgst: null,
        sgst: null,
        igst: null,
      };
    });

    return {
      periodStart, periodEnd,
      invoiceCount: totals.invoiceCount,
      totalGross: totals.totalGross.toFixed(2),
      totalNet: totals.totalNet.toFixed(2),
      totalTax: totals.totalTax.toFixed(2),
      breakdown,
    };
  }

  // India GST
  const result = await db.execute(sql`
    SELECT
      tax_type,
      tax_rate::text AS tax_rate,
      count(*)::int AS invoice_count,
      coalesce(sum(total_amount::numeric), 0)::text AS gross_amount,
      coalesce(sum(subtotal::numeric), 0)::text AS net_amount,
      coalesce(sum(tax_amount::numeric), 0)::text AS tax_amount
    FROM invoices
    WHERE company_id = ${companyId}
      AND issue_date::date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY tax_type, tax_rate
    ORDER BY tax_type, tax_rate::numeric DESC
  `);

  type IndiaRow = { tax_type: string; tax_rate: string; invoice_count: number; gross_amount: string; net_amount: string; tax_amount: string };
  const rows = result.rows as IndiaRow[];

  const totals = rows.reduce((acc, r) => ({
    invoiceCount: acc.invoiceCount + Number(r.invoice_count),
    totalGross: acc.totalGross + parseFloat(r.gross_amount),
    totalNet: acc.totalNet + parseFloat(r.net_amount),
    totalTax: acc.totalTax + parseFloat(r.tax_amount),
  }), { invoiceCount: 0, totalGross: 0, totalNet: 0, totalTax: 0 });

  const breakdown: TaxBand[] = rows.map(r => {
    const taxAmt = parseFloat(r.tax_amount);
    const half = (taxAmt / 2).toFixed(2);
    const isCgstSgst = r.tax_type === "cgst_sgst";
    const isIgst = r.tax_type === "igst";
    const rate = parseFloat(r.tax_rate);
    const label = isCgstSgst
      ? `CGST+SGST ${(rate / 2).toFixed(0)}%+${(rate / 2).toFixed(0)}% (Intra-state ${rate.toFixed(0)}%)`
      : isIgst
        ? `IGST ${rate.toFixed(0)}% (Inter-state)`
        : `No GST (Exempt/Export)`;
    return {
      label,
      taxType: r.tax_type,
      taxRate: r.tax_rate,
      invoiceCount: Number(r.invoice_count),
      grossAmount: r.gross_amount,
      netAmount: r.net_amount,
      taxAmount: r.tax_amount,
      cgst: isCgstSgst ? half : null,
      sgst: isCgstSgst ? half : null,
      igst: isIgst ? r.tax_amount : null,
    };
  });

  return {
    periodStart, periodEnd,
    invoiceCount: totals.invoiceCount,
    totalGross: totals.totalGross.toFixed(2),
    totalNet: totals.totalNet.toFixed(2),
    totalTax: totals.totalTax.toFixed(2),
    breakdown,
  };
}

router.get("/reports/tax-summary", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!TAX_REPORT_ROLES.includes(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const companyId = parseIntOrUndef(req.query.companyId);
  const regime = String(req.query.regime ?? "");
  const periodStart = isValidDate(req.query.periodStart) ? req.query.periodStart : undefined;
  const periodEnd = isValidDate(req.query.periodEnd) ? req.query.periodEnd : undefined;
  const prevPeriodStart = isValidDate(req.query.prevPeriodStart) ? req.query.prevPeriodStart : undefined;
  const prevPeriodEnd = isValidDate(req.query.prevPeriodEnd) ? req.query.prevPeriodEnd : undefined;

  if (!companyId || !regime || !periodStart || !periodEnd) {
    res.status(400).json({ error: "companyId, regime, periodStart, and periodEnd (YYYY-MM-DD) are required" });
    return;
  }
  if (!["germany", "india"].includes(regime)) {
    res.status(400).json({ error: "regime must be 'germany' or 'india'" });
    return;
  }
  if ((prevPeriodStart && !prevPeriodEnd) || (!prevPeriodStart && prevPeriodEnd)) {
    res.status(400).json({ error: "prevPeriodStart and prevPeriodEnd must both be provided" });
    return;
  }

  const [company] = await db.select({ id: companiesTable.id, name: companiesTable.name, currency: companiesTable.currency })
    .from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }

  if (user.role === "germany_accountant" && regime !== "germany") { res.status(403).json({ error: "Forbidden" }); return; }
  if (user.role === "india_accountant" && regime !== "india") { res.status(403).json({ error: "Forbidden" }); return; }

  const [main, previous] = await Promise.all([
    computeTaxPeriod(companyId, regime, periodStart, periodEnd),
    prevPeriodStart && prevPeriodEnd
      ? computeTaxPeriod(companyId, regime, prevPeriodStart, prevPeriodEnd)
      : Promise.resolve(undefined),
  ]);

  const currency = company.currency ?? (regime === "germany" ? "EUR" : "INR");

  res.json({
    companyId,
    companyName: company.name,
    regime,
    periodStart: main.periodStart,
    periodEnd: main.periodEnd,
    currency,
    invoiceCount: main.invoiceCount,
    totalGross: main.totalGross,
    totalNet: main.totalNet,
    totalTax: main.totalTax,
    breakdown: main.breakdown,
    ...(previous ? { previousPeriod: previous } : {}),
  });
});

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

  const expDateFilter = startDate && endDate
    ? sql`AND ex.date::date BETWEEN ${startDate}::date AND ${endDate}::date`
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
    ),
    expense_costs AS (
      SELECT ex.project_id,
             coalesce(sum(CASE WHEN ex.is_billable THEN ex.amount::numeric ELSE 0 END), 0) AS billable_expense_cost,
             coalesce(sum(CASE WHEN NOT ex.is_billable THEN ex.amount::numeric ELSE 0 END), 0) AS internal_expense_cost,
             coalesce(sum(ex.amount::numeric), 0) AS total_expense_cost
      FROM expenses ex
      WHERE 1 = 1
        ${expDateFilter}
      GROUP BY ex.project_id
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
      coalesce(ex.total_expense_cost, 0)::text AS total_expense_cost,
      coalesce(ex.billable_expense_cost, 0)::text AS billable_expense_cost,
      coalesce(ex.internal_expense_cost, 0)::text AS internal_expense_cost,
      (coalesce(inv.total_invoiced, 0) - coalesce(co.total_cost, 0) - coalesce(ex.total_expense_cost, 0))::text AS margin
    FROM projects p
    LEFT JOIN companies c ON c.id = p.company_id
    LEFT JOIN invoiced inv ON inv.project_id = p.id
    LEFT JOIN costs co ON co.project_id = p.id
    LEFT JOIN expense_costs ex ON ex.project_id = p.id
    WHERE 1 = 1
      ${companyFilter}
    ORDER BY (coalesce(inv.total_invoiced, 0) - coalesce(co.total_cost, 0) - coalesce(ex.total_expense_cost, 0)) DESC
  `);

  return (result.rows as Array<{
    project_id: number; project_name: string; status: string;
    company_id: number | null; company_name: string | null; currency: string;
    total_invoiced: string; total_hours: string; total_cost: string;
    total_expense_cost: string; billable_expense_cost: string; internal_expense_cost: string;
    margin: string;
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
    totalExpenseCost: r.total_expense_cost,
    billableExpenseCost: r.billable_expense_cost,
    internalExpenseCost: r.internal_expense_cost,
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
