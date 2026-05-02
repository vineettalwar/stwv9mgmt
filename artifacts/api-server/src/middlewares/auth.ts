import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
