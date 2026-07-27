import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { assertWithinTaskLimit, getMembership, getWorkspacePlan } from "../../utils/plan.js";
import { cancelTaskReminders, syncTaskReminders } from "../reminders/reminderService.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const notifyAssignee = async (data: { userId: string; workspaceId: string; taskId?: string; type: "TASK_ASSIGNED" | "TASK_UPDATED" | "TASK_DELETED"; message: string }) => {
    const assignee = await prisma.user.findUnique({ where: { id: data.userId }, select: { taskNotificationsEnabled: true } });
    if (!assignee?.taskNotificationsEnabled) return;
    await prisma.notification.create({ data });
};

const TASK_INCLUDE = {
    assignedTo: { select: { id: true, firstname: true, lastName: true, email: true } },
    workspace: true,
    subtasks: { select: { id: true, title: true, status: true } },
    dependsOn: { select: { id: true, title: true, status: true } },
    _count: { select: { comments: true, files: true } },
} as const;

export const listTasks = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const assignedToId = req.query.assignedToId as string | undefined;
        const label = req.query.label as string | undefined;
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
        if (label) {
            where.labels = { has: label };
        }
        const tasks = await prisma.task.findMany({
            where,
            include: TASK_INCLUDE,
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ tasks });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createTask = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const {
            title, description, priority, status, workspaceId, assignedToId, dueDate,
            labels, parentTaskId, isRecurring, recurrenceRule, dependsOn,
            reminderOffsets, customReminderTimes,
        } = req.body;
        if (!title || !workspaceId) {
            return res.status(400).json({ message: "Title and workspaceId are required" });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }
        if (membership.role === "GUEST") {
            return res.status(403).json({ message: "Guests cannot create tasks" });
        }
        // Members can only assign tasks to themselves — assigning to someone
        // else is a Manager+ action (see spec: "Manager: assign tasks").
        if (membership.role === "MEMBER" && assignedToId && assignedToId !== authUser.id) {
            return res.status(403).json({ message: "Only managers, admins, and owners can assign tasks to other members" });
        }

        const limitError = await assertWithinTaskLimit(workspaceId);
        if (limitError) return res.status(403).json(limitError);

        const plan = await getWorkspacePlan(workspaceId);
        if (labels?.length && !plan.canUseLabels) {
            return res.status(403).json({ message: "Labels require a plan upgrade.", upgradeRequired: true, feature: "canUseLabels" });
        }
        if (parentTaskId && !plan.canUseSubtasks) {
            return res.status(403).json({ message: "Subtasks require a plan upgrade.", upgradeRequired: true, feature: "canUseSubtasks" });
        }
        if (isRecurring && !plan.canUseRecurringTasks) {
            return res.status(403).json({ message: "Recurring tasks require a plan upgrade.", upgradeRequired: true, feature: "canUseRecurringTasks" });
        }
        if (dependsOn?.length && !plan.canUseDependencies) {
            return res.status(403).json({ message: "Task dependencies require a plan upgrade.", upgradeRequired: true, feature: "canUseDependencies" });
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
                labels: labels || [],
                parentTaskId: parentTaskId || null,
                isRecurring: !!isRecurring,
                recurrenceRule: isRecurring ? recurrenceRule : null,
                ...(dependsOn?.length ? { dependsOn: { connect: dependsOn.map((id: string) => ({ id })) } } : {}),
            },
            include: TASK_INCLUDE,
        });

        await createActivityLog({ userId: authUser.id, action: `Created task ${task.title}`, workspaceId, taskId: task.id });

        if (task.dueDate && task.assignedToId) {
            await syncTaskReminders(task, {
                offsets: Array.isArray(reminderOffsets) ? reminderOffsets : undefined,
                customTimes: Array.isArray(customReminderTimes) ? customReminderTimes : undefined,
            });
        }

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

export const updateTask = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Task id is required" });
        }

        const existingTask = await prisma.task.findUnique({ where: { id } });
        if (!existingTask) {
            return res.status(404).json({ message: "Task not found" });
        }

        const membership = await getMembership(authUser.id, existingTask.workspaceId);
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const { title, description, priority, status, assignedToId, dueDate, labels, reminderOffsets, customReminderTimes } = req.body;

        // Guests may only flip the status of a task assigned to them —
        // everything else (reassigning, editing, retitling) is off-limits.
        if (membership.role === "GUEST") {
            if (existingTask.assignedToId !== authUser.id) {
                return res.status(403).json({ message: "Guests can only update tasks assigned to them" });
            }
            const task = await prisma.task.update({ where: { id }, data: { status }, include: TASK_INCLUDE });
            await createActivityLog({ userId: authUser.id, action: `Updated task ${task.title}`, workspaceId: task.workspaceId, taskId: task.id });

            if (existingTask.status !== "COMPLETED" && task.status === "COMPLETED") {
                await cancelTaskReminders(task.id);
            } else if (existingTask.status === "COMPLETED" && task.status !== "COMPLETED") {
                await syncTaskReminders(task);
            }

            return res.status(200).json({ task });
        }

        if (
            membership.role === "MEMBER" &&
            assignedToId &&
            assignedToId !== authUser.id &&
            assignedToId !== existingTask.assignedToId
        ) {
            return res.status(403).json({ message: "Only managers, admins, and owners can assign tasks to other members" });
        }

        const plan = await getWorkspacePlan(existingTask.workspaceId);
        if (labels?.length && !plan.canUseLabels) {
            return res.status(403).json({ message: "Labels require a plan upgrade.", upgradeRequired: true, feature: "canUseLabels" });
        }

        // Only fields actually present in the request body are written —
        // omitted keys leave the existing value untouched. (A blind
        // `assignedToId || null` / `dueDate ? ... : null` here would silently
        // clear the assignee and due date on every partial update, e.g. a
        // kanban drag that only sends `{ status }`.)
        const data: Record<string, unknown> = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (priority !== undefined) data.priority = priority;
        if (status !== undefined) data.status = status;
        if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (labels !== undefined) data.labels = labels;

        const task = await prisma.task.update({
            where: { id },
            data,
            include: TASK_INCLUDE,
        });

        await createActivityLog({ userId: authUser.id, action: `Updated task ${task.title}`, workspaceId: task.workspaceId, taskId: task.id });

        const becameCompleted = existingTask.status !== "COMPLETED" && task.status === "COMPLETED";
        const becameReopened = existingTask.status === "COMPLETED" && task.status !== "COMPLETED";
        const remindersExplicit = Array.isArray(reminderOffsets) || Array.isArray(customReminderTimes);
        if (becameCompleted) {
            await cancelTaskReminders(task.id);
        } else if (dueDate !== undefined || assignedToId !== undefined || remindersExplicit || becameReopened) {
            await syncTaskReminders(task, {
                offsets: Array.isArray(reminderOffsets) ? reminderOffsets : undefined,
                customTimes: Array.isArray(customReminderTimes) ? customReminderTimes : undefined,
            });
        }

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

export const deleteTask = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Task id is required" });
        }

        const existingTask = await prisma.task.findUnique({ where: { id } });
        if (!existingTask) {
            return res.status(404).json({ message: "Task not found" });
        }

        const membership = await getMembership(authUser.id, existingTask.workspaceId);
        if (!membership || membership.role === "GUEST") {
            return res.status(403).json({ message: "You do not have permission to delete this task" });
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
