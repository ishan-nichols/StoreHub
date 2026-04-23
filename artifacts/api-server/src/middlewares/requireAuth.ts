import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const accessToken = req.cookies?.sh_access as string | undefined;
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyAccessToken(accessToken);
  if (!payload) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  req.userId = payload.userId;
  next();
}
