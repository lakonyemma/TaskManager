import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { cancelTaskReminders, syncTaskReminders } from "../reminders/reminderService.js";
import { getIncompleteDependencies, wouldCreateCycle } from "./dependencyService.js";
import { generateNextOccurrence } from "./recurrenceService.js";
import { checkAndGrantAchievements } from "../achievements/achievementService.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const notifyAssignee = async (data: { userId: string; workspaceId: string; taskId?: string; type: "TASK_ASSIGNED" | "TASK_UPDATED" | "TASK_DELETED" | "TASK_COMPLETED"; message: string }) => {
    const assignee = await prisma.user.findUnique({ where: { id: data.userId }, select: { taskNotificationsEnabled: true } });
    if (!assignee?.taskNotificationsEnabled) return;
    await prisma.notification.create({ data });
};

const TASK_INCLUDE = {
    assignedTo: { select: { id: true, firstname: true, lastName: true, email: true } },
    workspace: true,
    subtasks: { select: { id: true, title: true, status: true } },
    dependsOn: { select: { id: true, title: true, status: true } },
    blocks: { select: { id: true, title: true, status: true } },
    relatedTo: { select: { id: true, title: true, status: true } },
    relatedFrom: { select: { id: true, title: true, status: true } },
    tags: { select: { id: true, name: true, color: true } },
    _count: { select: { comments: true, files: true } },
} as const;

// "Related to" is stored one-directionally (via relatedTo) but should read
// the same from either task — merge both sides and dedupe for the response.
const mergeRelated = <T extends { relatedTo: { id: string }[]; relatedFrom: { id: string }[] }>(task: T) => {
    const seen = new Set<string>();
    const merged = [...task.relatedTo, ...task.relatedFrom].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    const { relatedFrom, ...rest } = task;
    void relatedFrom;
    return { ...rest, relatedTo: merged };
};

// Runs after a task transitions into COMPLETED: spins up the next occurrence
// if the task is recurring, and checks/grants any newly-earned achievements
// for whoever actually completed it — not the assignee. A solo user very
// often completes tasks they never bothered to explicitly self-assign, and
// crediting assignedToId meant those completions silently never counted
// toward anything. Both are best-effort side effects — failures here
// shouldn't fail the completion request itself.
const handleCompletionSideEffects = async (
    task: Parameters<typeof generateNextOccurrence>[0],
    completedByUserId: string,
) => {
    let nextOccurrence = null;
    let newAchievements: Awaited<ReturnType<typeof checkAndGrantAchievements>> = [];
    try {
        nextOccurrence = await generateNextOccurrence(task);
    } catch (error) {
        console.error("[tasks] Failed to generate next recurring occurrence:", error);
    }
    try {
        newAchievements = await checkAndGrantAchievements(completedByUserId);
    } catch (error) {
        console.error("[tasks] Failed to check achievements:", error);
    }
    return { nextOccurrence, newAchievements };
};

// Diffs old vs. new task state into distinct, typed activity-log entries —
// a status change from IN_PROGRESS straight to COMPLETED with a bumped
// priority in the same request should show up as two legible feed items
// ("Completed…", "Changed priority…"), not one vague "Updated task".
const describeTaskChanges = (
    existingTask: { status: string; priority: string; dueDate: Date | null },
    task: { title: string; status: string; priority: string; dueDate: Date | null },
): { action: string; entityType: string; previousValue?: object; newValue?: object }[] => {
    const changes: { action: string; entityType: string; previousValue?: object; newValue?: object }[] = [];
    const becameCompleted = existingTask.status !== "COMPLETED" && task.status === "COMPLETED";
    const becameReopened = existingTask.status === "COMPLETED" && task.status !== "COMPLETED";

    if (becameCompleted) changes.push({ action: `Completed task ${task.title}`, entityType: "task_completed", previousValue: { status: existingTask.status }, newValue: { status: task.status } });
    else if (becameReopened) changes.push({ action: `Reopened task ${task.title}`, entityType: "task_reopened", previousValue: { status: existingTask.status }, newValue: { status: task.status } });
    else if (existingTask.status !== task.status) changes.push({ action: `Changed status of ${task.title} to ${task.status.replace("_", " ")}`, entityType: "status_changed", previousValue: { status: existingTask.status }, newValue: { status: task.status } });

    if (existingTask.priority !== task.priority) {
        changes.push({ action: `Changed priority of ${task.title} to ${task.priority}`, entityType: "priority_changed", previousValue: { priority: existingTask.priority }, newValue: { priority: task.priority } });
    }

    const oldDue = existingTask.dueDate ? existingTask.dueDate.getTime() : null;
    const newDue = task.dueDate ? new Date(task.dueDate).getTime() : null;
    if (oldDue !== newDue) {
        changes.push({
            action: task.dueDate ? `Changed due date of ${task.title} to ${new Date(task.dueDate).toLocaleDateString()}` : `Removed due date from ${task.title}`,
            entityType: "due_date_changed",
            previousValue: { dueDate: existingTask.dueDate },
            newValue: { dueDate: task.dueDate },
        });
    }

    if (changes.length === 0) changes.push({ action: `Updated task ${task.title}`, entityType: "task_updated" });
    return changes;
};

export const listTasks = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const assignedToId = req.query.assignedToId as string | undefined;
        const tagId = req.query.tagId as string | undefined;
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
        if (tagId) {
            where.tags = { some: { id: tagId } };
        }
        const tasks = await prisma.task.findMany({
            where,
            include: TASK_INCLUDE,
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ tasks: tasks.map(mergeRelated) });
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
            tagIds, parentTaskId, isRecurring, recurrenceRule, dependsOn, relatedTaskIds,
            reminderOffsets, customReminderTimes,
            recurrenceInterval, recurrenceDaysOfWeek, recurrenceBusinessDaysOnly, recurrenceEndDate, recurrenceCount,
            estimatedMinutes, clientId,
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

        // Idempotent create: an offline-queued mutation may be retried after a
        // dropped response — if a task with this clientId already exists,
        // return it instead of erroring on the unique-constraint violation.
        // Only trusted as a dedup hit when it's the same workspace the
        // caller is asking to create in (and thus already a verified member
        // of) — otherwise a clientId collision/reuse could leak another
        // workspace's task details to someone with no access to it.
        if (clientId) {
            const existing = await prisma.task.findUnique({ where: { clientId }, include: TASK_INCLUDE });
            if (existing && existing.workspaceId === workspaceId) {
                return res.status(200).json({ task: mergeRelated(existing), deduped: true });
            }
        }

        // Members can only assign tasks to themselves — assigning to someone
        // else is a Manager+ action (see spec: "Manager: assign tasks").
        if (membership.role === "MEMBER" && assignedToId && assignedToId !== authUser.id) {
            return res.status(403).json({ message: "Only managers, admins, and owners can assign tasks to other members" });
        }

        // Dependencies must live in the same workspace — silently drop any
        // that don't rather than letting a cross-workspace id leak status
        // info the requester might not have access to.
        let validDependsOn: string[] = [];
        if (Array.isArray(dependsOn) && dependsOn.length > 0) {
            const refTasks = await prisma.task.findMany({ where: { id: { in: dependsOn } }, select: { id: true, workspaceId: true } });
            validDependsOn = refTasks.filter((t) => t.workspaceId === workspaceId).map((t) => t.id);
        }

        // Tags must belong to the same workspace — same reasoning as
        // dependsOn above, drop silently rather than leak/attach cross-tenant.
        let validTagIds: string[] = [];
        if (Array.isArray(tagIds) && tagIds.length > 0) {
            const refTags = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, workspaceId: true } });
            validTagIds = refTags.filter((tg) => tg.workspaceId === workspaceId).map((tg) => tg.id);
        }

        // Related tasks: same cross-tenant guard, no cycle check needed since
        // this link carries no blocking semantics.
        let validRelatedIds: string[] = [];
        if (Array.isArray(relatedTaskIds) && relatedTaskIds.length > 0) {
            const refRelated = await prisma.task.findMany({ where: { id: { in: relatedTaskIds } }, select: { id: true, workspaceId: true } });
            validRelatedIds = refRelated.filter((t) => t.workspaceId === workspaceId).map((t) => t.id);
        }

        const task = await prisma.task.create({
            data: {
                title,
                description,
                priority: priority || "MEDIUM",
                status: status || "TODO",
                completedAt: status === "COMPLETED" ? new Date() : null,
                completedById: status === "COMPLETED" ? authUser.id : null,
                workspaceId,
                // Default to the creator when no assignee is picked — the UI's
                // "assign to" dropdown intentionally excludes yourself (see the
                // MEMBER-role check above), so an unassigned task is really a
                // self-assigned one. Without this, solo-owned tasks never get
                // assignedToId set and reminderService.syncTaskReminders (which
                // requires an assignee to know who to notify) silently never
                // schedules a reminder for them.
                assignedToId: assignedToId || authUser.id,
                dueDate: dueDate ? new Date(dueDate) : null,
                estimatedMinutes: estimatedMinutes ?? null,
                clientId: clientId || null,
                ...(validTagIds.length ? { tags: { connect: validTagIds.map((tid) => ({ id: tid })) } } : {}),
                ...(validRelatedIds.length ? { relatedTo: { connect: validRelatedIds.map((tid) => ({ id: tid })) } } : {}),
                parentTaskId: parentTaskId || null,
                isRecurring: !!isRecurring,
                recurrenceRule: isRecurring ? recurrenceRule : null,
                recurrenceInterval: isRecurring ? (recurrenceInterval ?? null) : null,
                recurrenceDaysOfWeek: isRecurring && Array.isArray(recurrenceDaysOfWeek) ? recurrenceDaysOfWeek : [],
                recurrenceBusinessDaysOnly: isRecurring ? !!recurrenceBusinessDaysOnly : false,
                recurrenceEndDate: isRecurring && recurrenceEndDate ? new Date(recurrenceEndDate) : null,
                recurrenceCount: isRecurring ? (recurrenceCount ?? null) : null,
                ...(validDependsOn.length ? { dependsOn: { connect: validDependsOn.map((depId) => ({ id: depId })) } } : {}),
            },
            include: TASK_INCLUDE,
        });

        await createActivityLog({ userId: authUser.id, action: `Created task ${task.title}`, workspaceId, taskId: task.id, entityType: "task_created", entityId: task.id });

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

        return res.status(201).json({ task: mergeRelated(task) });
    } catch (error) {
        // Only reachable if a clientId collides with another workspace's
        // task (the same-workspace case is already handled as a dedup hit
        // above) — a genuine UUID collision, or a clientId deliberately
        // replayed across workspaces, which the dedup check above already
        // refuses to treat as a match. Either way this is a clean conflict,
        // not a server fault.
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
            return res.status(409).json({ message: "This task was already created" });
        }
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

        const {
            title, description, notes, priority, status, assignedToId, dueDate, tagIds, relatedTaskIds, reminderOffsets, customReminderTimes,
            dependsOn, isRecurring, recurrenceRule, recurrenceInterval, recurrenceDaysOfWeek, recurrenceBusinessDaysOnly,
            recurrenceEndDate, recurrenceCount, estimatedMinutes,
        } = req.body;

        // A task can't be completed while it still has incomplete
        // dependencies. When `dependsOn` is part of this same request, check
        // against the newly-requested set rather than what's stored — the
        // two should agree, but the request is the more current intent.
        const checkDependencyBlock = async (): Promise<{ id: string; title: string; status: string }[]> => {
            if (status !== "COMPLETED" || existingTask.status === "COMPLETED") return [];
            const depIds: string[] = Array.isArray(dependsOn)
                ? dependsOn
                : (await prisma.task.findUnique({ where: { id }, select: { dependsOn: { select: { id: true } } } }))?.dependsOn.map((d) => d.id) ?? [];
            if (depIds.length === 0) return [];
            const depTasks = await prisma.task.findMany({ where: { id: { in: depIds } }, select: { id: true, title: true, status: true } });
            return depTasks.filter((d) => d.status !== "COMPLETED");
        };

        // Guests may only flip the status of a task assigned to them —
        // everything else (reassigning, editing, retitling) is off-limits.
        if (membership.role === "GUEST") {
            if (existingTask.assignedToId !== authUser.id) {
                return res.status(403).json({ message: "Guests can only update tasks assigned to them" });
            }

            const blockedBy = await checkDependencyBlock();
            if (blockedBy.length > 0) {
                return res.status(409).json({ message: `Cannot complete this task — it depends on ${blockedBy.length} incomplete task(s): ${blockedBy.map((d) => d.title).join(", ")}`, blockedBy });
            }

            const guestData: Record<string, unknown> = { status };
            if (status === "COMPLETED" && existingTask.status !== "COMPLETED") { guestData.completedAt = new Date(); guestData.completedById = authUser.id; }
            else if (status !== "COMPLETED" && existingTask.status === "COMPLETED") { guestData.completedAt = null; guestData.completedById = null; }
            const task = await prisma.task.update({ where: { id }, data: guestData, include: TASK_INCLUDE });
            for (const change of describeTaskChanges(existingTask, task)) {
                await createActivityLog({ userId: authUser.id, action: change.action, workspaceId: task.workspaceId, taskId: task.id, entityType: change.entityType, entityId: task.id, previousValue: change.previousValue, newValue: change.newValue });
            }

            let nextOccurrence = null;
            let newAchievements: Awaited<ReturnType<typeof checkAndGrantAchievements>> = [];
            if (existingTask.status !== "COMPLETED" && task.status === "COMPLETED") {
                await cancelTaskReminders(task.id);
                ({ nextOccurrence, newAchievements } = await handleCompletionSideEffects(task, authUser.id));
            } else if (existingTask.status === "COMPLETED" && task.status !== "COMPLETED") {
                await syncTaskReminders(task);
            }

            return res.status(200).json({ task: mergeRelated(task), nextOccurrence, newAchievements });
        }

        if (
            membership.role === "MEMBER" &&
            assignedToId &&
            assignedToId !== authUser.id &&
            assignedToId !== existingTask.assignedToId
        ) {
            return res.status(403).json({ message: "Only managers, admins, and owners can assign tasks to other members" });
        }

        const blockedBy = await checkDependencyBlock();
        if (blockedBy.length > 0) {
            return res.status(409).json({ message: `Cannot complete this task — it depends on ${blockedBy.length} incomplete task(s): ${blockedBy.map((d) => d.title).join(", ")}`, blockedBy });
        }

        // Only fields actually present in the request body are written —
        // omitted keys leave the existing value untouched. (A blind
        // `assignedToId || null` / `dueDate ? ... : null` here would silently
        // clear the assignee and due date on every partial update, e.g. a
        // kanban drag that only sends `{ status }`.)
        const data: Record<string, unknown> = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (notes !== undefined) data.notes = notes;
        if (priority !== undefined) data.priority = priority;
        if (status !== undefined) {
            data.status = status;
            if (status === "COMPLETED" && existingTask.status !== "COMPLETED") { data.completedAt = new Date(); data.completedById = authUser.id; }
            else if (status !== "COMPLETED" && existingTask.status === "COMPLETED") { data.completedAt = null; data.completedById = null; }
        }
        if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes;
        if (isRecurring !== undefined) data.isRecurring = !!isRecurring;
        if (recurrenceRule !== undefined) data.recurrenceRule = recurrenceRule || null;
        if (recurrenceInterval !== undefined) data.recurrenceInterval = recurrenceInterval;
        if (Array.isArray(recurrenceDaysOfWeek)) data.recurrenceDaysOfWeek = recurrenceDaysOfWeek;
        if (recurrenceBusinessDaysOnly !== undefined) data.recurrenceBusinessDaysOnly = !!recurrenceBusinessDaysOnly;
        if (recurrenceEndDate !== undefined) data.recurrenceEndDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null;
        if (recurrenceCount !== undefined) data.recurrenceCount = recurrenceCount;

        if (Array.isArray(dependsOn)) {
            const candidateIds = dependsOn.filter((depId: string) => depId !== id);
            let validIds: string[] = [];
            if (candidateIds.length > 0) {
                const refTasks = await prisma.task.findMany({ where: { id: { in: candidateIds } }, select: { id: true, workspaceId: true } });
                validIds = refTasks.filter((t) => t.workspaceId === existingTask.workspaceId).map((t) => t.id);
                if (await wouldCreateCycle(id, validIds)) {
                    return res.status(409).json({ message: "That would create a circular dependency between tasks" });
                }
            }
            data.dependsOn = { set: validIds.map((depId) => ({ id: depId })) };
        }

        if (Array.isArray(tagIds)) {
            const refTags = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, workspaceId: true } });
            const validTagIds = refTags.filter((tg) => tg.workspaceId === existingTask.workspaceId).map((tg) => tg.id);
            data.tags = { set: validTagIds.map((tid) => ({ id: tid })) };
        }

        if (Array.isArray(relatedTaskIds)) {
            const candidateIds = relatedTaskIds.filter((rid: string) => rid !== id);
            const refRelated = await prisma.task.findMany({ where: { id: { in: candidateIds } }, select: { id: true, workspaceId: true } });
            const validRelatedIds = refRelated.filter((t) => t.workspaceId === existingTask.workspaceId).map((t) => t.id);
            data.relatedTo = { set: validRelatedIds.map((tid) => ({ id: tid })) };
        }

        const task = await prisma.task.update({
            where: { id },
            data,
            include: TASK_INCLUDE,
        });

        for (const change of describeTaskChanges(existingTask, task)) {
            await createActivityLog({ userId: authUser.id, action: change.action, workspaceId: task.workspaceId, taskId: task.id, entityType: change.entityType, entityId: task.id, previousValue: change.previousValue, newValue: change.newValue });
        }

        const becameCompleted = existingTask.status !== "COMPLETED" && task.status === "COMPLETED";
        const becameReopened = existingTask.status === "COMPLETED" && task.status !== "COMPLETED";
        const remindersExplicit = Array.isArray(reminderOffsets) || Array.isArray(customReminderTimes);
        let nextOccurrence = null;
        let newAchievements: Awaited<ReturnType<typeof checkAndGrantAchievements>> = [];
        if (becameCompleted) {
            await cancelTaskReminders(task.id);
            ({ nextOccurrence, newAchievements } = await handleCompletionSideEffects(task, authUser.id));
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
                type: becameCompleted ? "TASK_COMPLETED" : reassigned ? "TASK_ASSIGNED" : "TASK_UPDATED",
                message: becameCompleted
                    ? `The task "${task.title}" was marked complete`
                    : reassigned
                        ? `You were assigned to the task "${task.title}"`
                        : `The task "${task.title}" was updated`,
            });
        }

        return res.status(200).json({ task: mergeRelated(task), nextOccurrence, newAchievements });
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

        await createActivityLog({ userId: authUser.id, action: `Deleted task ${task.title}`, workspaceId: task.workspaceId, entityType: "task_deleted", entityId: task.id });

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
