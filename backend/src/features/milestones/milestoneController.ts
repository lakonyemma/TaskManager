import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";
import { createActivityLog } from "../../utils/activity.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const MAX_NAME_LENGTH = 60;
// Same bar as tags: anyone above GUEST can create/edit; deleting (which
// detaches the milestone from every task counting toward it) needs Manager+.
const canManageMilestones = (role: string) => role !== "GUEST";
const canDeleteMilestones = (role: string) => ["OWNER", "ADMIN", "MANAGER"].includes(role);

const MILESTONE_INCLUDE = {
    tasks: { select: { id: true, status: true } },
} as const;

// Progress is always derived from linked tasks, never stored, so it can
// never drift out of sync with the tasks themselves.
const withProgress = <T extends { tasks: { id: string; status: string }[] }>(milestone: T) => {
    const { tasks, ...rest } = milestone;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
    return { ...rest, totalTasks, completedTasks };
};

export const listMilestones = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const milestones = await prisma.milestone.findMany({
            where: { workspaceId },
            orderBy: { order: "asc" },
            include: MILESTONE_INCLUDE,
        });

        return res.status(200).json({ milestones: milestones.map(withProgress) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createMilestone = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canManageMilestones(membership.role)) return res.status(403).json({ message: "Guests cannot create milestones" });

        const { name, description, dueDate } = req.body as { name?: string; description?: string; dueDate?: string };
        const trimmed = name?.trim();
        if (!trimmed) return res.status(400).json({ message: "Milestone name is required" });
        if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `Milestone name must be ${MAX_NAME_LENGTH} characters or fewer` });

        const last = await prisma.milestone.findFirst({ where: { workspaceId }, orderBy: { order: "desc" } });
        const milestone = await prisma.milestone.create({
            data: {
                workspaceId,
                name: trimmed,
                description: description?.trim() || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                order: (last?.order ?? -1) + 1,
            },
            include: MILESTONE_INCLUDE,
        });

        await createActivityLog({ userId: authUser.id, action: `Created milestone ${milestone.name}`, workspaceId, entityType: "milestone_created", entityId: milestone.id });

        return res.status(201).json({ milestone: withProgress(milestone) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateMilestone = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const existing = await prisma.milestone.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: "Milestone not found" });

        const membership = await getMembership(authUser.id, existing.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canManageMilestones(membership.role)) return res.status(403).json({ message: "Guests cannot edit milestones" });

        const { name, description, dueDate, achieved, order } = req.body as {
            name?: string; description?: string; dueDate?: string | null; achieved?: boolean; order?: number;
        };

        const data: Record<string, unknown> = {};
        if (name !== undefined) {
            const trimmed = name.trim();
            if (!trimmed) return res.status(400).json({ message: "Milestone name cannot be empty" });
            if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `Milestone name must be ${MAX_NAME_LENGTH} characters or fewer` });
            data.name = trimmed;
        }
        if (description !== undefined) data.description = description?.trim() || null;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (achieved !== undefined) data.achievedAt = achieved ? new Date() : null;
        if (typeof order === "number") data.order = order;

        const milestone = await prisma.milestone.update({ where: { id }, data, include: MILESTONE_INCLUDE });

        if (achieved !== undefined) {
            await createActivityLog({
                userId: authUser.id,
                action: achieved ? `Reached milestone ${milestone.name}` : `Reopened milestone ${milestone.name}`,
                workspaceId: existing.workspaceId,
                entityType: achieved ? "milestone_achieved" : "milestone_reopened",
                entityId: milestone.id,
            });
        }

        return res.status(200).json({ milestone: withProgress(milestone) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteMilestone = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const existing = await prisma.milestone.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: "Milestone not found" });

        const membership = await getMembership(authUser.id, existing.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canDeleteMilestones(membership.role)) return res.status(403).json({ message: "Only managers, admins, and owners can delete milestones" });

        // Tasks linked to this milestone just lose the link (Task.milestoneId
        // is ON DELETE SET NULL) — deleting a milestone never deletes tasks.
        await prisma.milestone.delete({ where: { id } });

        await createActivityLog({ userId: authUser.id, action: `Deleted milestone ${existing.name}`, workspaceId: existing.workspaceId, entityType: "milestone_deleted", entityId: id });

        return res.status(200).json({ message: "Milestone deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
