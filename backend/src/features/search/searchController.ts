import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const RESULTS_PER_CATEGORY = 8;

// One query across every entity type the spec calls for (tasks, projects/
// workspaces, comments, members, files), each scoped to workspaces the
// requester actually belongs to — never leaks another tenant's data via a
// broad text match. Optional status/priority/assignee/date/workspace
// filters only narrow the task category (the other categories don't have
// an obvious analog for e.g. "priority").
export const search = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const q = ((req.query.q as string) || "").trim();
        if (q.length < 2) return res.status(200).json({ tasks: [], workspaces: [], comments: [], members: [], files: [], query: q });

        const workspaceId = req.query.workspaceId as string | undefined;
        const status = req.query.status as string | undefined;
        const priority = req.query.priority as string | undefined;
        const assigneeId = req.query.assigneeId as string | undefined;
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;

        const memberships = await prisma.workspaceMember.findMany({ where: { userId: authUser.id }, select: { workspaceId: true } });
        const myWorkspaceIds = memberships.map((m) => m.workspaceId);
        if (workspaceId && !myWorkspaceIds.includes(workspaceId)) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }
        const scopeIds = workspaceId ? [workspaceId] : myWorkspaceIds;
        if (scopeIds.length === 0) return res.status(200).json({ tasks: [], workspaces: [], comments: [], members: [], files: [], query: q });

        const taskWhere: Record<string, unknown> = {
            workspaceId: { in: scopeIds },
            OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
        };
        if (status) taskWhere.status = status;
        if (priority) taskWhere.priority = priority;
        if (assigneeId) taskWhere.assignedToId = assigneeId;
        if (from || to) {
            taskWhere.dueDate = { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) };
        }

        const [tasks, workspaces, comments, members, files] = await Promise.all([
            prisma.task.findMany({
                where: taskWhere,
                select: { id: true, title: true, description: true, status: true, priority: true, workspaceId: true, dueDate: true },
                take: RESULTS_PER_CATEGORY,
                orderBy: { updatedAt: "desc" },
            }),
            prisma.workspace.findMany({
                where: { id: { in: scopeIds }, name: { contains: q, mode: "insensitive" } },
                select: { id: true, name: true, description: true },
                take: RESULTS_PER_CATEGORY,
            }),
            prisma.comment.findMany({
                where: { body: { contains: q, mode: "insensitive" }, task: { workspaceId: { in: scopeIds } } },
                select: { id: true, body: true, taskId: true, task: { select: { title: true, workspaceId: true } }, user: { select: { firstname: true, lastName: true } } },
                take: RESULTS_PER_CATEGORY,
                orderBy: { createdAt: "desc" },
            }),
            prisma.workspaceMember.findMany({
                where: {
                    workspaceId: { in: scopeIds },
                    user: { OR: [{ firstname: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
                },
                select: { id: true, userId: true, workspaceId: true, role: true, user: { select: { firstname: true, lastName: true, email: true, avatarUrl: true } } },
                take: RESULTS_PER_CATEGORY,
                distinct: ["userId"],
            }),
            prisma.file.findMany({
                where: { filename: { contains: q, mode: "insensitive" }, workspaceId: { in: scopeIds } },
                select: { id: true, filename: true, taskId: true, workspaceId: true, sizeBytes: true },
                take: RESULTS_PER_CATEGORY,
                orderBy: { createdAt: "desc" },
            }),
        ]);

        return res.status(200).json({ tasks, workspaces, comments, members, files, query: q });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
