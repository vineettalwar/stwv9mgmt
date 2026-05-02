import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, companiesTable, userCompanyAssignmentsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireRole";
import { GetUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const ROLE_ENUM = z.enum([
  "admin",
  "germany_accountant",
  "india_accountant",
  "project_manager",
  "client",
  "freelancer",
]);

const AdminCreateUserBody = z.object({
  email: z.string().email({ message: "Valid email required" }),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  role: ROLE_ENUM.default("freelancer"),
});

async function getUserWithCompanies(userId: number) {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user) return null;
  const assignments = await db
    .select({ company: companiesTable })
    .from(userCompanyAssignmentsTable)
    .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
    .where(eq(userCompanyAssignmentsTable.userId, userId));
  return { ...user, companies: assignments.map(a => a.company) };
}

/**
 * POST /admin/users
 * Admin-only: pre-register a platform user with a specific role.
 * The user's clerkUserId is set to "pending:{email}" as a placeholder.
 * When the user signs in via Clerk and self-registers (POST /users),
 * the system links their Clerk account by matching on email.
 */
router.post("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminCreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, firstName, lastName, role } = parsed.data;

  // Check if a user with this email already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).then(r => r[0]);
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  // Create placeholder: clerkUserId will be linked when user signs in
  const pendingClerkId = `pending:${email}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: pendingClerkId,
      email,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role,
      isActive: true,
    })
    .returning();

  const full = await getUserWithCompanies(user.id);
  res.status(201).json(GetUserResponse.parse(full));
});

export default router;
