import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";

const notifyAssignee = async (data: { userId: string; workspaceId: string; taskId?: string; type: "TASK_ASSIGNED" | "TASK_UPDATED" | "TASK_DELETED"; message: string }) => {
    const assignee = await prisma.user.findUnique({ where: { id: data.userId }, select: { taskNotificationsEnabled: true } });
    if (!assignee?.taskNotificationsEnabled) return;
    await prisma.notification.create({ data });
};

export const listTasks = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const assignedToId = req.query.assignedToId as string | undefined;
        const userWorkspaceMemberships = await prisma.workspaceMember.findMany({
            where: { userId: authUser.id },
            select: { workspaceId: true },
        });
        const userWorkspaceIds = userWorkspaceMemberships.map((w) => w.workspaceId);

        // Verify workspace membership when a specific workspaceId is provided
        if (workspaceId && !userWorkspaceIds.includes(workspaceId)) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const where: Record<string, unknown> = workspaceId
            ? { workspaceId }
            : { workspaceId: { in: userWorkspaceIds } };
        if (assignedToId) {
            where.assignedToId = assignedToId;
        }
        const tasks = await prisma.task.findMany({
            where,
            include: { assignedTo: { select: { id: true, firstname: true, lastName: true, email: true } }, workspace: true },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ tasks });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createTask = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { title, description, priority, status, workspaceId, assignedToId, dueDate } = req.body;
        if (!title || !workspaceId) {
            return res.status(400).json({ message: "Title and workspaceId are required" });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description,
                priority: priority || "MEDIUM",
                status: status || "TODO",
                workspaceId,
                assignedToId: assignedToId || null,
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });

        await createActivityLog({ userId: authUser.id, action: `Created task ${task.title}`, workspaceId, taskId: task.id });

        if (task.assignedToId && task.assignedToId !== authUser.id) {
            await notifyAssignee({
                userId: task.assignedToId,
                workspaceId,
                taskId: task.id,
                type: "TASK_ASSIGNED",
                message: `You were assigned to the task "${task.title}"`,
            });
        }

        return res.status(201).json({ task });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Task id is required" });
        }

        const { title, description, priority, status, assignedToId, dueDate } = req.body;

        const existingTask = await prisma.task.findUnique({ where: { id } });
        if (!existingTask) {
            return res.status(404).json({ message: "Task not found" });
        }

        const task = await prisma.task.update({
            where: { id },
            data: {
                title,
                description,
                priority,
                status,
                assignedToId: assignedToId || null,
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });

        await createActivityLog({ userId: authUser.id, action: `Updated task ${task.title}`, workspaceId: task.workspaceId, taskId: task.id });

        const newAssigneeId = task.assignedToId;
        if (newAssigneeId && newAssigneeId !== authUser.id) {
            const reassigned = newAssigneeId !== existingTask.assignedToId;
            await notifyAssignee({
                userId: newAssigneeId,
                workspaceId: task.workspaceId,
                taskId: task.id,
                type: reassigned ? "TASK_ASSIGNED" : "TASK_UPDATED",
                message: reassigned
                    ? `You were assigned to the task "${task.title}"`
                    : `The task "${task.title}" was updated`,
            });
        }

        return res.status(200).json({ task });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Task id is required" });
        }

        const task = await prisma.task.delete({ where: { id } });

        await createActivityLog({ userId: authUser.id, action: `Deleted task ${task.title}`, workspaceId: task.workspaceId });

        if (task.assignedToId && task.assignedToId !== authUser.id) {
            await notifyAssignee({
                userId: task.assignedToId,
                workspaceId: task.workspaceId,
                type: "TASK_DELETED",
                message: `The task "${task.title}" was deleted`,
            });
        }

        return res.status(200).json({ message: "Task deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
