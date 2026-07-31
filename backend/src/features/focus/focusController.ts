import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// Logged once per Focus Mode exit (or Pomodoro focus interval completion) —
// see FocusMode.tsx. durationSeconds only ever covers active focus time,
// never break time.
export const logFocusSession = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { taskId, durationSeconds, pomodoroCount, startedAt } = req.body as {
            taskId?: string; durationSeconds?: number; pomodoroCount?: number; startedAt?: string;
        };
        if (!taskId || !durationSeconds || durationSeconds < 1) {
            return res.status(400).json({ message: "taskId and a positive durationSeconds are required" });
        }

        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true } });
        if (!task) return res.status(404).json({ message: "Task not found" });
        const membership = await getMembership(authUser.id, task.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        // Cap at 4 hours — guards against a stale client tab reporting a
        // bogus multi-day duration (e.g. laptop slept mid-session).
        const cappedDuration = Math.min(durationSeconds, 4 * 60 * 60);
        const parsedStart = startedAt ? new Date(startedAt) : new Date(Date.now() - cappedDuration * 1000);

        const session = await prisma.focusSession.create({
            data: {
                userId: authUser.id,
                taskId,
                durationSeconds: cappedDuration,
                pomodoroCount: pomodoroCount || 0,
                startedAt: Number.isNaN(parsedStart.getTime()) ? new Date(Date.now() - cappedDuration * 1000) : parsedStart,
            },
        });

        return res.status(201).json({ session });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listFocusSessions = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;
        const limit = Math.min(Number(req.query.limit) || 20, 200);

        const where: Record<string, unknown> = { userId: authUser.id };
        if (from || to) {
            where.endedAt = { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) };
        }

        const sessions = await prisma.focusSession.findMany({
            where,
            include: { task: { select: { id: true, title: true } } },
            orderBy: { endedAt: "desc" },
            take: limit,
        });

        const totalSeconds = await prisma.focusSession.aggregate({ where: { userId: authUser.id }, _sum: { durationSeconds: true } });

        return res.status(200).json({ sessions, totalFocusSeconds: totalSeconds._sum.durationSeconds || 0 });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
