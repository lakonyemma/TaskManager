import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { REMINDER_OFFSET_OPTIONS, snoozeReminder } from "./reminderService.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

export const listReminderOptions = async (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
    }
    return res.status(200).json({ options: REMINDER_OFFSET_OPTIONS });
};

export const listTaskReminders = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const taskIdParam = req.params.taskId;
        const taskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
        if (!taskId) {
            return res.status(400).json({ message: "Task id is required" });
        }

        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, workspaceId: true } });
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: authUser.id, workspaceId: task.workspaceId } },
        });
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const reminders = await prisma.reminderSchedule.findMany({
            where: { taskId, userId: authUser.id, status: { in: ["PENDING", "SNOOZED"] } },
            orderBy: { remindAt: "asc" },
        });

        return res.status(200).json({ reminders });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const snoozeReminderEndpoint = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Reminder id is required" });
        }

        const minutesRaw = Number((req.body as { minutes?: number })?.minutes);
        const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(minutesRaw, 1440) : 10;

        const reminder = await snoozeReminder(id, authUser.id, minutes);
        if (!reminder) {
            return res.status(404).json({ message: "Reminder not found" });
        }

        return res.status(200).json({ reminder });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const cancelReminderEndpoint = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Reminder id is required" });
        }

        const reminder = await prisma.reminderSchedule.findUnique({ where: { id } });
        if (!reminder || reminder.userId !== authUser.id) {
            return res.status(404).json({ message: "Reminder not found" });
        }

        await prisma.reminderSchedule.update({ where: { id }, data: { status: "CANCELLED" } });
        return res.status(200).json({ message: "Reminder cancelled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
