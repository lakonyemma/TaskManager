import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";

// Gate for the entire /api/admin surface — a platform-wide capability,
// orthogonal to (and independent of) any workspace's WorkspaceRole. Must
// run after `authenticate` (needs req.user already populated).
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const authUser = (req as Request & { user?: { id: string; email: string } }).user;
    if (!authUser) return res.status(401).json({ message: "Authentication required" });

    const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { isSuperAdmin: true } });
    if (!user?.isSuperAdmin) return res.status(403).json({ message: "Super admin access required" });

    next();
};
