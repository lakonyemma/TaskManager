import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { cancelTaskReminders, syncTaskReminders } from "../reminders/reminderService.js";
import {
    buildDeadlineRisks,
    buildTodayPlan,
    computeExecutionScore,
    daysBetween,
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

export const getExecutionOverview = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = req.query.workspaceId as string | undefined;
        if (!workspaceId) return res.status(400).json({ message: "workspaceId is required" });

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

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
        const todayPlan = buildTodayPlan(executionTasks, now);
        const risks = buildDeadlineRisks(executionTasks, now);
        const score = computeExecutionScore(executionTasks, now);
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
            attention: {
                dueToday,
                overdue,
                atRisk: risks.length,
                followUpsDue,
                total: dueToday + overdue + followUpsDue,
            },
            todayPlan: {
                ...todayPlan,
                tasks: todayPlan.tasks.map(serializeTask),
            },
            risks: risks.map((risk) => ({ ...serializeTask(risk), level: risk.level, reason: risk.reason, daysUntilDue: risk.daysUntilDue })),
            waiting: waiting.map((task) => ({ ...serializeTask(task), followUpAt: task.dueDate?.toISOString() ?? null })),
            score,
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
        const parsedFollowUpAt = followUpAt ? new Date(followUpAt) : null;
        if (parsedFollowUpAt && Number.isNaN(parsedFollowUpAt.getTime())) {
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
