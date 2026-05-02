import { Router, type IRouter } from "express";
import { db, usersTable, companiesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireReader } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, requireReader, async (_req, res): Promise<void> => {
  const [totalCompaniesResult, totalUsersResult, usersByRoleResult, companiesByCountryResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(companiesTable).then(r => r[0]),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable).then(r => r[0]),
    db.execute(sql`
      SELECT role, count(*)::int as count
      FROM users
      GROUP BY role
      ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT country, count(*)::int as count
      FROM companies
      GROUP BY country
      ORDER BY count DESC
    `),
  ]);

  res.json({
    totalCompanies: totalCompaniesResult?.count ?? 0,
    totalUsers: totalUsersResult?.count ?? 0,
    usersByRole: (usersByRoleResult.rows as { role: string; count: number }[]).map(r => ({
      role: r.role,
      count: r.count,
    })),
    companiesByCountry: (companiesByCountryResult.rows as { country: string; count: number }[]).map(r => ({
      country: r.country,
      count: r.count,
    })),
  });
});

export default router;
