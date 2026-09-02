import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { getEntitlements } from "../features/billing/billingService.js";

export const enforceWorkspaceLimit = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    const entitlements = await getEntitlements(user.id);
    if (entitlements.maxWorkspaces !== null && entitlements.ownedWorkspaces >= entitlements.maxWorkspaces) {
      return res.status(402).json({
        message: "Free plan allows up to 2 workspaces. Upgrade to Premium for unlimited workspaces.",
        code: "WORKSPACE_LIMIT_REACHED",
        entitlements,
      });
    }
    return next();
  } catch (error) {
    console.error("[billing workspace limit]", error);
    return res.status(500).json({ message: "Unable to check plan limits" });
  }
};
