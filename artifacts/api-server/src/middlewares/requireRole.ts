import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type UserRole =
  | "admin"
  | "germany_accountant"
  | "india_accountant"
  | "project_manager"
  | "client"
  | "freelancer";

declare global {
  namespace Express {
    interface Request {
      dbUser?: typeof usersTable.$inferSelect;
    }
  }
}

export async function loadDbUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, auth.userId))
    .then((r) => r[0]);

  if (!user) {
    res.status(403).json({ error: "Forbidden: user not registered in platform" });
    return;
  }
  req.dbUser = user;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.dbUser) {
      await loadDbUser(req, res, () => {
        if (!req.dbUser) return;
        checkRole(req, res, next, allowedRoles);
      });
    } else {
      checkRole(req, res, next, allowedRoles);
    }
  };
}

function checkRole(
  req: Request,
  res: Response,
  next: NextFunction,
  allowedRoles: UserRole[],
): void {
  const role = req.dbUser?.role as UserRole | undefined;
  if (!role || !allowedRoles.includes(role)) {
    res.status(403).json({
      error: `Forbidden: role '${role ?? "unknown"}' is not permitted`,
    });
    return;
  }
  next();
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

export const requireAdmin = requireRole("admin");

const READER_ROLES: UserRole[] = [
  "admin",
  "germany_accountant",
  "india_accountant",
  "project_manager",
];

export const requireReader = requireRole(...READER_ROLES);
