/**
 * Dev-only routes — these endpoints are completely disabled in production.
 *
 * Approach for one-click test login (Task #41):
 *   The frontend asks this server for a Clerk Sign-In Token bound to a
 *   pre-seeded test user. The frontend then exchanges that token for a real
 *   Clerk session via `signIn.create({ strategy: "ticket", ticket })`.
 *
 *   Why a real Clerk session (and not a custom signed cookie)?
 *   - The mgmt frontend deeply integrates with `@clerk/react` (`useAuth`,
 *     `getToken`, `<RedirectToSignIn>`). A custom session would require
 *     forking every place that asks "am I signed in?" — fragile and risky.
 *   - The api-server middleware (`requireAuth`, `requireRole`, `loadDbUser`)
 *     stays 100% unchanged. The dev user is a *real* Clerk user; the role
 *     comes from the seeded `users` row that we link to the Clerk account.
 *
 * Production safety:
 *   - The sub-router below short-circuits with 404 unless
 *     `NODE_ENV !== "production"`. Even if this file is accidentally mounted
 *     in prod, every request returns 404 and no Clerk admin calls are made.
 *   - The route is also intentionally absent from the OpenAPI spec, so it
 *     never appears in the generated client.
 */
import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

const DEV_ROLE_TO_EMAIL = {
  admin: "admin@stwv-dev.com",
  project_manager: "pm@stwv-dev.com",
  client: "client@stwv-dev.com",
  freelancer: "freelancer@stwv-dev.com",
} as const;

type DevRole = keyof typeof DEV_ROLE_TO_EMAIL;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// Hard gate: every request to this sub-router 404s in production.
router.use((_req, res, next) => {
  if (isProduction()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// GET /api/dev/health — lets the frontend check whether dev mode is active
// without leaking that detail in production (returns 404 above).
router.get("/health", (_req, res) => {
  res.json({ ok: true, mode: process.env.NODE_ENV ?? "development" });
});

// POST /api/dev/sign-in-token — body: { role: DevRole }
// Returns a Clerk sign-in token the frontend can exchange for a session.
router.post("/sign-in-token", async (req, res): Promise<void> => {
  const role = String(req.body?.role ?? "") as DevRole;
  const email = DEV_ROLE_TO_EMAIL[role];
  if (!email) {
    res.status(400).json({
      error: `Unsupported dev role '${role}'. Allowed: ${Object.keys(DEV_ROLE_TO_EMAIL).join(", ")}`,
    });
    return;
  }

  try {
    // 1. Look up seeded test user in our DB.
    const dbUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .then((r) => r[0]);

    if (!dbUser) {
      res.status(500).json({
        error:
          `Seed user ${email} is missing. ` +
          `Run: pnpm --filter @workspace/db run seed`,
      });
      return;
    }

    // 2. Find or create the matching Clerk user. Backend-created users have
    //    their email auto-verified and never receive a verification email.
    const list = await clerkClient.users.getUserList({ emailAddress: [email] });
    let clerkUser = list.data[0];
    if (!clerkUser) {
      clerkUser = await clerkClient.users.createUser({
        emailAddress: [email],
        firstName: dbUser.firstName ?? "Test",
        lastName: dbUser.lastName ?? role,
        skipPasswordRequirement: true,
      });
    }

    // 3. Make sure our DB row points at the real Clerk user id, preserving
    //    the seeded role. Without this, provisionUserFromClerk would either
    //    (a) link a "pending:" placeholder on first /users/me, or
    //    (b) refuse with a 409 if the email was previously linked to a
    //    different Clerk account (e.g. when Clerk users are recreated in dev).
    if (dbUser.clerkUserId !== clerkUser.id) {
      await db
        .update(usersTable)
        .set({ clerkUserId: clerkUser.id, updatedAt: new Date() })
        .where(eq(usersTable.id, dbUser.id));
    }

    // 4. Issue a short-lived Clerk sign-in token.
    const token = await clerkClient.signInTokens.createSignInToken({
      userId: clerkUser.id,
      expiresInSeconds: 60,
    });

    res.json({ token: token.token, role, email });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({
      error: e.message ?? "Failed to issue dev sign-in token",
    });
  }
});

export default router;
