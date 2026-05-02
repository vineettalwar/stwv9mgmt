import { Router, type IRouter } from "express";
import { db, invoicesTable, timeEntriesTable, offersTable, complianceChecklistsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { requireAuth, loadDbUser } from "../middlewares/requireRole";

const router: IRouter = Router();

const ADMIN_ROLES = ["admin", "germany_accountant", "india_accountant", "project_manager"];

router.get("/dashboard/admin-stats", requireAuth, loadDbUser, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  if (!ADMIN_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  const [
    pendingInvoicesResult,
    overdueInvoicesResult,
    openOffersResult,
    hoursThisMonthResult,
    upcomingComplianceResult,
    overdueComplianceResult,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(total_amount)::text, '0')` })
      .from(invoicesTable)
      .where(eq(invoicesTable.status, "sent"))
      .then(r => r[0]),
    db.select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(total_amount)::text, '0')` })
      .from(invoicesTable)
      .where(eq(invoicesTable.status, "overdue"))
      .then(r => r[0]),
    db.select({ count: sql<number>`count(*)::int` })
      .from(offersTable)
      .where(eq(offersTable.status, "sent"))
      .then(r => r[0]),
    db.execute(sql`
      SELECT coalesce(sum(hours::numeric), 0)::text as total_hours
      FROM time_entries
      WHERE to_char(date::date, 'YYYY-MM') = ${currentMonth}
    `).then(r => (r.rows[0] as { total_hours: string })?.total_hours ?? "0"),
    db.execute(sql`
      SELECT count(*)::int as count
      FROM compliance_checklists
      WHERE status = 'pending'
        AND deadline::date BETWEEN current_date AND current_date + interval '30 days'
    `).then(r => (r.rows[0] as { count: number })?.count ?? 0),
    db.execute(sql`
      SELECT count(*)::int as count
      FROM compliance_checklists
      WHERE status = 'overdue'
    `).then(r => (r.rows[0] as { count: number })?.count ?? 0),
  ]);

  // Top 5 invoices by amount (pending/overdue)
  const topInvoices = await db.execute(sql`
    SELECT i.id, i.invoice_number, i.title, i.total_amount, i.currency, i.status, i.due_date,
           u.email as client_email, u.first_name as client_first_name, u.last_name as client_last_name
    FROM invoices i
    LEFT JOIN users u ON i.client_id = u.id
    WHERE i.status IN ('sent', 'overdue')
    ORDER BY i.total_amount::numeric DESC
    LIMIT 5
  `);

  // Recent open offers
  const recentOffers = await db.execute(sql`
    SELECT o.id, o.offer_number, o.title, o.total_amount, o.currency, o.status, o.created_at,
           u.email as client_email, u.first_name as client_first_name, u.last_name as client_last_name
    FROM offers o
    LEFT JOIN users u ON o.client_id = u.id
    WHERE o.status IN ('sent', 'draft')
    ORDER BY o.created_at DESC
    LIMIT 5
  `);

  res.json({
    pendingInvoices: {
      count: pendingInvoicesResult?.count ?? 0,
      totalAmount: pendingInvoicesResult?.total ?? "0",
    },
    overdueInvoices: {
      count: overdueInvoicesResult?.count ?? 0,
      totalAmount: overdueInvoicesResult?.total ?? "0",
    },
    openOffers: {
      count: openOffersResult?.count ?? 0,
    },
    hoursThisMonth: hoursThisMonthResult,
    upcomingCompliance: upcomingComplianceResult,
    overdueCompliance: overdueComplianceResult,
    topPendingInvoices: topInvoices.rows,
    recentOpenOffers: recentOffers.rows,
  });
});

export default router;
