import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { cancelTaskReminders, syncTaskReminders } from "../reminders/reminderService.js";
import {
    buildDeadlineRisks,
    buildTodayPlan,
    buildWeeklyReview,
    clampCapacityMinutes,
    computeExecutionScore,
    daysBetween,
    selectNextAction,
    suggestSmartReschedule,
    type ExecutionTask,
} from "./executionPlanner.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const WAITING_TAG_NAME = "Waiting";

const serializeTask = (task: ExecutionTask & { effortMinutes?: number; urgencyScore?: number; overflow?: boolean }) => ({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
});

const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const mapTask = (task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    completedAt: Date | null;
    estimatedMinutes: number | null;
    updatedAt: Date;
    tags: { name: string }[];
}): ExecutionTask => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    estimatedMinutes: task.estimatedMinutes,
    updatedAt: task.updatedAt,
    isWaiting: task.tags.some((tag) => tag.name.toLowerCase() === WAITING_TAG_NAME.toLowerCase()),
});

const parseCapacity = (value: unknown) => {
    const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : undefined;
    return clampCapacityMinutes(parsed);
};

const defaultFollowUpDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    date.setHours(9, 0, 0, 0);
    return date;
};

export const getExecutionOverview = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = req.query.workspaceId as string | undefined;
        if (!workspaceId) return res.status(400).json({ message: "workspaceId is required" });

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const capacityMinutes = parseCapacity(req.query.capacityMinutes);
        const memberCount = await prisma.workspaceMember.count({ where: { workspaceId } });
        const soloWorkspace = memberCount === 1;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const tasks = await prisma.task.findMany({
            where: {
                workspaceId,
                ...(soloWorkspace ? {} : { assignedToId: authUser.id }),
                OR: [
                    { status: { not: "COMPLETED" } },
                    { completedAt: { gte: weekAgo } },
                ],
            },
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                completedAt: true,
                estimatedMinutes: true,
                updatedAt: true,
                tags: { select: { name: true } },
            },
        });

        const now = new Date();
        const executionTasks = tasks.map(mapTask);
        const todayPlan = buildTodayPlan(executionTasks, now, capacityMinutes);
        const risks = buildDeadlineRisks(executionTasks, now, capacityMinutes);
        const nextAction = selectNextAction(todayPlan, now);
        const score = computeExecutionScore(executionTasks, now);
        const weeklyReview = buildWeeklyReview(executionTasks, now, capacityMinutes);
        const focusAggregate = await prisma.focusSession.aggregate({
            where: { userId: authUser.id, endedAt: { gte: weekAgo } },
            _sum: { durationSeconds: true },
        });
        const waiting = executionTasks
            .filter((task) => task.status !== "COMPLETED" && task.isWaiting)
            .sort((a, b) => {
                if (!a.dueDate && !b.dueDate) return b.updatedAt.getTime() - a.updatedAt.getTime();
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return a.dueDate.getTime() - b.dueDate.getTime();
            });

        const active = executionTasks.filter((task) => task.status !== "COMPLETED" && !task.isWaiting);
        const dueToday = active.filter((task) => task.dueDate && isSameDay(task.dueDate, now)).length;
        const overdue = active.filter((task) => task.dueDate && daysBetween(now, task.dueDate) < 0).length;
        const followUpsDue = waiting.filter((task) => task.dueDate && daysBetween(now, task.dueDate) <= 0).length;

        return res.status(200).json({
            generatedAt: now.toISOString(),
            soloWorkspace,
            capacityMinutes,
            attention: {
                dueToday,
                overdue,
                atRisk: risks.length,
                followUpsDue,
                total: dueToday + overdue + followUpsDue,
            },
            nextAction: nextAction ? { ...serializeTask(nextAction), reason: nextAction.reason } : null,
            todayPlan: {
                ...todayPlan,
                tasks: todayPlan.tasks.map(serializeTask),
            },
            risks: risks.map((risk) => ({
                ...serializeTask(risk),
                level: risk.level,
                reason: risk.reason,
                daysUntilDue: risk.daysUntilDue,
                workloadPressurePercent: risk.workloadPressurePercent,
                recommendedStartAt: risk.recommendedStartAt.toISOString(),
            })),
            waiting: waiting.map((task) => ({ ...serializeTask(task), followUpAt: task.dueDate?.toISOString() ?? null })),
            score,
            weeklyReview: {
                ...weeklyReview,
                focusMinutes: Math.round((focusAggregate._sum.durationSeconds ?? 0) / 60),
                recentWins: weeklyReview.recentWins.map((item) => ({
                    ...item,
                    completedAt: item.completedAt?.toISOString() ?? null,
                })),
            },
        });
    } catch (error) {
        console.error("[execution] overview failed", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createWaitingItem = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { workspaceId, title, waitingFor, description, followUpAt, priority } = req.body;
        if (!workspaceId || !title?.trim()) {
            return res.status(400).json({ message: "workspaceId and title are required" });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (membership.role === "GUEST") return res.status(403).json({ message: "Guests cannot create waiting items" });

        let waitingTag = await prisma.tag.findFirst({ where: { workspaceId, name: WAITING_TAG_NAME } });
        if (!waitingTag) {
            waitingTag = await prisma.tag.create({
                data: { workspaceId, name: WAITING_TAG_NAME, color: "#0ea5e9" },
            });
        }

        const todoColumn = await prisma.boardColumn.findFirst({
            where: { workspaceId, mapsToStatus: "TODO" },
            orderBy: { order: "asc" },
        });

        const waitingContext = waitingFor?.trim() ? `Waiting for: ${waitingFor.trim()}` : null;
        const mergedDescription = [waitingContext, description?.trim()].filter(Boolean).join("\n\n") || null;
        const parsedFollowUpAt = followUpAt ? new Date(followUpAt) : defaultFollowUpDate();
        if (Number.isNaN(parsedFollowUpAt.getTime())) {
            return res.status(400).json({ message: "followUpAt must be a valid date" });
        }

        const task = await prisma.task.create({
            data: {
                workspaceId,
                title: title.trim(),
                description: mergedDescription,
                priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priority) ? priority : "MEDIUM",
                status: "TODO",
                columnId: todoColumn?.id ?? null,
                assignedToId: authUser.id,
                dueDate: parsedFollowUpAt,
                tags: { connect: [{ id: waitingTag.id }] },
            },
            include: { tags: { select: { id: true, name: true, color: true } } },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Started waiting for ${task.title}`,
            workspaceId,
            taskId: task.id,
            entityType: "waiting_created",
            entityId: task.id,
        });

        if (task.dueDate && task.assignedToId) await syncTaskReminders(task);

        return res.status(201).json({
            waitingItem: {
                id: task.id,
                title: task.title,
                description: task.description,
                priority: task.priority,
                followUpAt: task.dueDate?.toISOString() ?? null,
                status: task.status,
                tags: task.tags,
            },
        });
    } catch (error) {
        console.error("[execution] waiting item creation failed", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const resolveWaitingItem = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return res.status(400).json({ message: "Waiting item id is required" });

        const existing = await prisma.task.findUnique({
            where: { id },
            include: { tags: { select: { name: true } } },
        });
        if (!existing) return res.status(404).json({ message: "Waiting item not found" });

        const membership = await getMembership(authUser.id, existing.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (membership.role === "GUEST" && existing.assignedToId !== authUser.id) {
            return res.status(403).json({ message: "Guests can only resolve their own waiting items" });
        }
        if (!existing.tags.some((tag) => tag.name.toLowerCase() === WAITING_TAG_NAME.toLowerCase())) {
            return res.status(400).json({ message: "This task is not a Waiting For item" });
        }

        if (existing.status === "COMPLETED") {
            return res.status(200).json({ waitingItem: { id: existing.id, title: existing.title, status: existing.status }, alreadyResolved: true });
        }

        const task = await prisma.task.update({
            where: { id },
            data: { status: "COMPLETED", completedAt: new Date(), completedById: authUser.id },
        });
        await cancelTaskReminders(task.id);
        await createActivityLog({
            userId: authUser.id,
            action: `Resolved waiting item ${task.title}`,
            workspaceId: task.workspaceId,
            taskId: task.id,
            entityType: "waiting_resolved",
            entityId: task.id,
        });

        return res.status(200).json({
            waitingItem: { id: task.id, title: task.title, status: task.status, completedAt: task.completedAt?.toISOString() ?? null },
        });
    } catch (error) {
        console.error("[execution] waiting item resolution failed", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const smartRescheduleTask = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return res.status(400).json({ message: "Task id is required" });

        const existing = await prisma.task.findUnique({
            where: { id },
            include: { tags: { select: { name: true } } },
        });
        if (!existing) return res.status(404).json({ message: "Task not found" });
        if (existing.status === "COMPLETED") return res.status(400).json({ message: "Completed tasks do not need rescheduling" });

        const membership = await getMembership(authUser.id, existing.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (membership.role === "GUEST" && existing.assignedToId !== authUser.id) {
            return res.status(403).json({ message: "Guests can only reschedule their own tasks" });
        }

        const capacityMinutes = parseCapacity(req.body?.capacityMinutes);
        const workspaceTasks = await prisma.task.findMany({
            where: { workspaceId: existing.workspaceId, status: { not: "COMPLETED" } },
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                completedAt: true,
                estimatedMinutes: true,
                updatedAt: true,
                tags: { select: { name: true } },
            },
        });
        const mapped = workspaceTasks.map(mapTask);
        const target = mapped.find((task) => task.id === existing.id);
        if (!target) return res.status(404).json({ message: "Task not found in execution plan" });

        const suggestion = suggestSmartReschedule(target, mapped, new Date(), capacityMinutes);
        const previousDueDate = existing.dueDate;
        const task = await prisma.task.update({ where: { id }, data: { dueDate: suggestion.dueDate } });
        if (task.assignedToId) await syncTaskReminders(task);
        await createActivityLog({
            userId: authUser.id,
            action: `Smart-rescheduled ${task.title}`,
            workspaceId: task.workspaceId,
            taskId: task.id,
            entityType: "task_rescheduled",
            entityId: task.id,
            previousValue: { dueDate: previousDueDate?.toISOString() ?? null },
            newValue: { dueDate: task.dueDate?.toISOString() ?? null, reason: suggestion.reason },
        });

        return res.status(200).json({
            task: { id: task.id, title: task.title, dueDate: task.dueDate?.toISOString() ?? null },
            suggestion: {
                reason: suggestion.reason,
                dayLoadMinutes: suggestion.dayLoadMinutes,
                capacityMinutes: suggestion.capacityMinutes,
            },
        });
    } catch (error) {
        console.error("[execution] smart reschedule failed", error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const reportClientTelemetry = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });
        const kind = String(req.body?.kind || "event").slice(0, 40);
        const message = String(req.body?.message || "Client telemetry").slice(0, 500);
        const route = String(req.body?.route || "").slice(0, 200);
        const durationMs = Number(req.body?.durationMs);
        const details = req.body?.details && typeof req.body.details === "object" ? req.body.details : undefined;

        await createActivityLog({
            userId: authUser.id,
            action: `Client ${kind}: ${message}`,
            entityType: kind === "error" ? "client_error" : "client_performance",
            newValue: {
                route,
                ...(Number.isFinite(durationMs) ? { durationMs } : {}),
                ...(details ? { details } : {}),
            },
        });
        return res.status(202).json({ accepted: true });
    } catch (error) {
        console.error("[execution] telemetry failed", error);
        return res.status(202).json({ accepted: false });
    }
};
