import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, companiesTable, userCompanyAssignmentsTable } from "@workspace/db";
import {
  UpdateUserParams,
  DeleteUserParams,
  GetUserParams,
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
import { requireAuth, requireAdmin } from "../middlewares/requireRole";
import { getAuth, clerkClient } from "@clerk/express";

const router: IRouter = Router();

const ROLE_ENUM = z.enum([
  "admin",
  "germany_accountant",
  "india_accountant",
  "project_manager",
  "client",
  "freelancer",
]);

const SafeUpdateUserBody = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  role: ROLE_ENUM.optional(),
  isActive: z.boolean().optional(),
});

function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

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
 * Derive and upsert a user record from the Clerk identity.
 * All identity data (email, name) is fetched server-side from Clerk API
 * and NEVER trusted from the client request body.
 *
 * Handles:
 *   1. Existing user by clerkUserId → return as-is
 *   2. Pending pre-registration (admin-created placeholder) → link Clerk account
 *   3. No record → auto-provision with safe default role
 */
async function provisionUserFromClerk(clerkId: string): Promise<typeof usersTable.$inferSelect> {
  // Check if already registered by clerkUserId
  const existingByClerk = await db.select().from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkId)).then(r => r[0]);
  if (existingByClerk) return existingByClerk;

  // Derive identity from Clerk server-side — never trust client-provided fields
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress;
  if (!email) throw Object.assign(new Error("Clerk account has no verified email"), { status: 400 });

  const firstName = clerkUser.firstName ?? null;
  const lastName = clerkUser.lastName ?? null;

  // Check for pending pre-registration by email
  const pendingByEmail = await db.select().from(usersTable)
    .where(eq(usersTable.email, email)).then(r => r[0]);

  if (pendingByEmail) {
    if (pendingByEmail.clerkUserId.startsWith("pending:")) {
      // Link Clerk account to the pre-registered record
      const [linked] = await db.update(usersTable)
        .set({ clerkUserId: clerkId, firstName: firstName ?? pendingByEmail.firstName, lastName: lastName ?? pendingByEmail.lastName, updatedAt: new Date() })
        .where(eq(usersTable.id, pendingByEmail.id))
        .returning();
      return linked;
    }
    // Email registered with a different Clerk account — conflict
    throw Object.assign(new Error("Email already registered with a different Clerk account"), { status: 409 });
  }

  // Create new user — role based on PLATFORM_ADMIN_EMAILS, defaulting to "freelancer"
  const adminEmails = getAdminEmails();
  const role = adminEmails.has(email.toLowerCase()) ? "admin" : "freelancer";

  const [user] = await db.insert(usersTable)
    .values({ clerkUserId: clerkId, email, firstName, lastName, role, isActive: true })
    .returning();
  return user;
}

// List all users — admin only
router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.id);
  const usersWithCompanies = await Promise.all(users.map(u => getUserWithCompanies(u.id)));
  res.json(ListUsersResponse.parse(usersWithCompanies));
});

// Provision or sync authenticated user — any Clerk-authenticated user.
// Body is ignored for identity/role; all fields are derived server-side from Clerk.
// Returns 201 when a new platform user is created, 200 when one already exists.
router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth!.userId!;
  try {
    // Check if user already exists before provisioning
    const existing = await db.select().from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkId)).then(r => r[0]);
    const user = await provisionUserFromClerk(clerkId);
    const full = await getUserWithCompanies(user.id);
    const status = existing ? 200 : 201;
    res.status(status).json(GetUserResponse.parse(full));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Failed to provision user" });
  }
});

// GET /users/me — auto-provisions the user if they don't yet exist in the platform DB.
// Email, name, and role are derived server-side from Clerk — never from client.
router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const clerkId = auth!.userId!;
  try {
    const user = await provisionUserFromClerk(clerkId);
    const full = await getUserWithCompanies(user.id);
    res.json(GetMeResponse.parse(full));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "Failed to provision user" });
  }
});

// Get specific user — admin or self only
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const auth = getAuth(req);
  const self = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, auth?.userId ?? "")).then(r => r[0]);
  if (!self || (self.id !== params.data.id && self.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const user = await getUserWithCompanies(params.data.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(GetUserResponse.parse(user));
});

// Update user — admin only; role validated as enum.
// When role changes, it is also synced to Clerk publicMetadata so Clerk
// acts as a secondary source of truth alongside the platform DB.
router.patch("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SafeUpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [user] = await db.update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Sync role to Clerk publicMetadata if the Clerk account is active (not a pending placeholder)
  if (parsed.data.role && !user.clerkUserId.startsWith("pending:")) {
    try {
      const clerkUser = await clerkClient.users.getUser(user.clerkUserId);
      await clerkClient.users.updateUser(user.clerkUserId, {
        publicMetadata: { ...(clerkUser.publicMetadata ?? {}), role: user.role },
      });
    } catch {
      // Non-fatal: DB is the primary source of truth; Clerk sync is best-effort
    }
  }

  const full = await getUserWithCompanies(user.id);
  res.json(UpdateUserResponse.parse(full));
});

// Delete user — admin only
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.sendStatus(204);
});

// Get user's company assignments — admin or self
router.get("/users/:id/companies", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserCompaniesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const auth = getAuth(req);
  const self = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, auth?.userId ?? "")).then(r => r[0]);
  if (!self || (self.id !== params.data.id && self.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const assignments = await db
    .select({ id: userCompanyAssignmentsTable.id, userId: userCompanyAssignmentsTable.userId, companyId: userCompanyAssignmentsTable.companyId, createdAt: userCompanyAssignmentsTable.createdAt, company: companiesTable })
    .from(userCompanyAssignmentsTable)
    .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
    .where(eq(userCompanyAssignmentsTable.userId, params.data.id));
  res.json(GetUserCompaniesResponse.parse(assignments));
});

// Assign company — admin only
router.post("/users/:id/companies", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = AssignUserToCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AssignUserToCompanyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [assignment] = await db.insert(userCompanyAssignmentsTable)
    .values({ userId: params.data.id, companyId: parsed.data.companyId })
    .onConflictDoNothing().returning();
  const id = assignment
    ? assignment.id
    : (await db.select({ id: userCompanyAssignmentsTable.id }).from(userCompanyAssignmentsTable)
        .where(and(eq(userCompanyAssignmentsTable.userId, params.data.id), eq(userCompanyAssignmentsTable.companyId, parsed.data.companyId)))
        .then(r => r[0]))!.id;
  const [withCompany] = await db
    .select({ id: userCompanyAssignmentsTable.id, userId: userCompanyAssignmentsTable.userId, companyId: userCompanyAssignmentsTable.companyId, createdAt: userCompanyAssignmentsTable.createdAt, company: companiesTable })
    .from(userCompanyAssignmentsTable)
    .innerJoin(companiesTable, eq(userCompanyAssignmentsTable.companyId, companiesTable.id))
    .where(eq(userCompanyAssignmentsTable.id, id));
  res.status(201).json(withCompany);
});

// Remove company assignment — admin only
router.delete("/users/:id/companies/:companyId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = RemoveUserFromCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(userCompanyAssignmentsTable)
    .where(and(eq(userCompanyAssignmentsTable.userId, params.data.id), eq(userCompanyAssignmentsTable.companyId, params.data.companyId)));
  res.sendStatus(204);
});

export default router;
