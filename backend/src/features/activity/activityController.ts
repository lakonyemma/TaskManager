import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { AUDIT_ENTITY_TYPES } from "../../utils/activity.js";

export const listActivity = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const limit = Math.min(Number(req.query.limit) || 50, 500);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const search = (req.query.search as string | undefined)?.trim();
        const filterUserId = req.query.userId as string | undefined;
        const entityType = req.query.type as string | undefined;
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;

        const userWorkspaceMemberships = await prisma.workspaceMember.findMany({
            where: { userId: authUser.id },
            select: { workspaceId: true },
        });
        const userWorkspaceIds = userWorkspaceMemberships.map((w) => w.workspaceId);

        if (workspaceId && !userWorkspaceIds.includes(workspaceId)) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        // Security/administrative events (login, password changes, etc.)
        // belong in the dedicated audit log (/api/audit-logs), not this
        // general collaboration feed — they carry an IP address and other
        // members shouldn't see each other's login history here. `notIn`
        // alone would also drop every legacy untyped (entityType: null) row
        // under SQL's three-valued NULL logic, so null is allowed explicitly.
        const notAuditType = { OR: [{ entityType: null }, { entityType: { notIn: AUDIT_ENTITY_TYPES as unknown as string[] } }] };
        const scope = workspaceId
            ? { workspaceId }
            : { OR: [{ userId: authUser.id }, { workspaceId: { in: userWorkspaceIds } }] };
        const where: Record<string, unknown> = { AND: [scope, notAuditType] };
        if (search) where.action = { contains: search, mode: "insensitive" };
        if (filterUserId) where.userId = filterUserId;
        if (entityType) where.entityType = entityType;
        if (from || to) {
            where.createdAt = {
                ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
                ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
            };
        }

        const [activity, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, firstname: true, lastName: true, avatarUrl: true } },
                    workspace: { select: { id: true, name: true } },
                    task: { select: { id: true, title: true } },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.activityLog.count({ where }),
        ]);

        return res.status(200).json({ activity, total, page, limit });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
