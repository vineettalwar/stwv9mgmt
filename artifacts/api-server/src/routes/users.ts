import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, companiesTable, userCompanyAssignmentsTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  DeleteUserParams,
  GetUserCompaniesParams,
  AssignUserToCompanyParams,
  AssignUserToCompanyBody,
  RemoveUserFromCompanyParams,
  ListUsersResponse,
  GetUserResponse,
  GetMeResponse,
  UpdateUserResponse,
  GetUserCompaniesResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, loadDbUser } from "../middlewares/requireRole";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

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

// List all users — admin only
router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.id);
  const usersWithCompanies = await Promise.all(users.map(u => getUserWithCompanies(u.id)));
  res.json(ListUsersResponse.parse(usersWithCompanies));
});

// Self-register (upsert) — any authenticated user
router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, parsed.data.clerkUserId))
    .then(r => r[0]);
  if (existing) {
    const updated = await getUserWithCompanies(existing.id);
    res.status(201).json(GetUserResponse.parse(updated));
    return;
  }
  const [user] = await db.insert(usersTable).values(parsed.data).returning();
  const full = await getUserWithCompanies(user.id);
  res.status(201).json(GetUserResponse.parse(full));
});

// Current user profile — any authenticated user
router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkId))
    .then(r => r[0]);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const full = await getUserWithCompanies(user.id);
  res.json(GetMeResponse.parse(full));
});

// Get specific user — admin only (or self)
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Allow self-access or admin
  const auth = getAuth(req);
  const self = await db.select().from(usersTable)
    .where(eq(usersTable.clerkUserId, auth?.userId ?? ""))
    .then(r => r[0]);
  const isSelf = self?.id === params.data.id;
  const isAdmin = self?.role === "admin";
  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const user = await getUserWithCompanies(params.data.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(user));
});

// Update user — admin only
router.patch("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const full = await getUserWithCompanies(user.id);
  res.json(UpdateUserResponse.parse(full));
});

// Delete user — admin only
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.sendStatus(204);
});

// Get user's company assignments — admin or self
router.get("/users/:id/companies", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserCompaniesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const auth = getAuth(req);
  const self = await db.select().from(usersTable)
    .where(eq(usersTable.clerkUserId, auth?.userId ?? ""))
    .then(r => r[0]);
  const isSelf = self?.id === params.data.id;
  const isAdmin = self?.role === "admin";
  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const assignments = await db
    .select({
      id: userCompanyAssignmentsTable.id,
      userId: userCompanyAssignmentsTable.userId,
      companyId: userCompanyAssignmentsTable.companyId,
      createdAt: userCompanyAssignmentsTable.createdAt,
      company: companiesTable,
    })
    .from(userCompanyAssignmentsTable)
    .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
    .where(eq(userCompanyAssignmentsTable.userId, params.data.id));
  res.json(GetUserCompaniesResponse.parse(assignments));
});

// Assign company — admin only
router.post("/users/:id/companies", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = AssignUserToCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AssignUserToCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [assignment] = await db
    .insert(userCompanyAssignmentsTable)
    .values({ userId: params.data.id, companyId: parsed.data.companyId })
    .onConflictDoNothing()
    .returning();
  if (!assignment) {
    const existing = await db
      .select({
        id: userCompanyAssignmentsTable.id,
        userId: userCompanyAssignmentsTable.userId,
        companyId: userCompanyAssignmentsTable.companyId,
        createdAt: userCompanyAssignmentsTable.createdAt,
        company: companiesTable,
      })
      .from(userCompanyAssignmentsTable)
      .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
      .where(
        and(
          eq(userCompanyAssignmentsTable.userId, params.data.id),
          eq(userCompanyAssignmentsTable.companyId, parsed.data.companyId),
        ),
      )
      .then(r => r[0]);
    res.status(201).json(existing);
    return;
  }
  const [withCompany] = await db
    .select({
      id: userCompanyAssignmentsTable.id,
      userId: userCompanyAssignmentsTable.userId,
      companyId: userCompanyAssignmentsTable.companyId,
      createdAt: userCompanyAssignmentsTable.createdAt,
      company: companiesTable,
    })
    .from(userCompanyAssignmentsTable)
    .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
    .where(eq(userCompanyAssignmentsTable.id, assignment.id));
  res.status(201).json(withCompany);
});

// Remove company assignment — admin only
router.delete("/users/:id/companies/:companyId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = RemoveUserFromCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(userCompanyAssignmentsTable)
    .where(
      and(
        eq(userCompanyAssignmentsTable.userId, params.data.id),
        eq(userCompanyAssignmentsTable.companyId, params.data.companyId),
      ),
    );
  res.sendStatus(204);
});

export default router;
