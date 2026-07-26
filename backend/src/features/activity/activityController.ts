import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

export const listActivity = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const limit = Math.min(Number(req.query.limit) || 50, 200);

        const userWorkspaceMemberships = await prisma.workspaceMember.findMany({
            where: { userId: authUser.id },
            select: { workspaceId: true },
        });
        const userWorkspaceIds = userWorkspaceMemberships.map((w) => w.workspaceId);

        if (workspaceId && !userWorkspaceIds.includes(workspaceId)) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const activity = await prisma.activityLog.findMany({
            where: workspaceId
                ? { workspaceId }
                : { OR: [{ userId: authUser.id }, { workspaceId: { in: userWorkspaceIds } }] },
            include: {
                user: { select: { id: true, firstname: true, lastName: true, avatarUrl: true } },
                workspace: { select: { id: true, name: true } },
                task: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return res.status(200).json({ activity });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
