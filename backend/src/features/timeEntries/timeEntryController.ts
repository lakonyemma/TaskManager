import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const TIME_ENTRY_INCLUDE = {
    user: { select: { id: true, firstname: true, lastName: true } },
} as const;

// Manually logged time (or a stopped timer's elapsed minutes) against a
// task — distinct from FocusSession, which only covers Focus Mode/Pomodoro
// sessions specifically.
export const createTimeEntry = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const taskId = String(req.params.taskId);
        const { minutes, note, loggedAt } = req.body as { minutes?: number; note?: string; loggedAt?: string };
        if (!minutes || minutes < 1) return res.status(400).json({ message: "A positive number of minutes is required" });

        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true } });
        if (!task) return res.status(404).json({ message: "Task not found" });

        const membership = await getMembership(authUser.id, task.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        // Same rationale as FocusSession's 4-hour cap — guards against a
        // fat-fingered or stale-timer entry skewing totals/reports.
        const cappedMinutes = Math.min(Math.round(minutes), 24 * 60);
        const parsedLoggedAt = loggedAt ? new Date(loggedAt) : new Date();

        const entry = await prisma.timeEntry.create({
            data: {
                taskId,
                userId: authUser.id,
                minutes: cappedMinutes,
                note: note?.trim() || null,
                loggedAt: Number.isNaN(parsedLoggedAt.getTime()) ? new Date() : parsedLoggedAt,
            },
            include: TIME_ENTRY_INCLUDE,
        });

        return res.status(201).json({ entry });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listTimeEntries = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const taskId = String(req.params.taskId);
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true } });
        if (!task) return res.status(404).json({ message: "Task not found" });

        const membership = await getMembership(authUser.id, task.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const entries = await prisma.timeEntry.findMany({
            where: { taskId },
            include: TIME_ENTRY_INCLUDE,
            orderBy: { loggedAt: "desc" },
        });
        const totalMinutes = await prisma.timeEntry.aggregate({ where: { taskId }, _sum: { minutes: true } });

        return res.status(200).json({ entries, totalMinutes: totalMinutes._sum.minutes || 0 });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteTimeEntry = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const entry = await prisma.timeEntry.findUnique({ where: { id } });
        if (!entry) return res.status(404).json({ message: "Time entry not found" });

        const task = await prisma.task.findUniqueOrThrow({ where: { id: entry.taskId } });
        const membership = await getMembership(authUser.id, task.workspaceId);
        const canModerate = membership && ["OWNER", "ADMIN", "MANAGER"].includes(membership.role);
        if (entry.userId !== authUser.id && !canModerate) {
            return res.status(403).json({ message: "You can only delete your own time entries" });
        }

        await prisma.timeEntry.delete({ where: { id } });
        return res.status(200).json({ message: "Time entry deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
