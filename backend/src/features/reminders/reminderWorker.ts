import prisma from "../../lib/prisma.js";
import { sendPushToUser } from "../../utils/push.js";
import { humanizeMinutes } from "./reminderService.js";

const buildMessage = (task: { title: string; dueDate: Date | null }, offsetMinutes: number | null): string => {
    const minutes = offsetMinutes != null
        ? offsetMinutes
        : task.dueDate
            ? Math.max(1, Math.round((task.dueDate.getTime() - Date.now()) / 60000))
            : 1;
    return `"${task.title}" is due in ${humanizeMinutes(minutes)}.`;
};

// Polled rather than event-driven, matching the rest of this deployment's
// lack of background-job infra (see utils/plan.ts) — a table scan on a
// {status, remindAt} index every REMINDER_POLL_INTERVAL_MS is cheap enough
// at this scale and needs no extra services (Redis, a queue) to operate.
export const dispatchDueReminders = async (): Promise<{ dispatched: number }> => {
    const due = await prisma.reminderSchedule.findMany({
        where: { status: "PENDING", remindAt: { lte: new Date() } },
        include: {
            task: { select: { id: true, title: true, status: true, dueDate: true, workspaceId: true } },
            user: { select: { id: true, taskNotificationsEnabled: true } },
        },
        orderBy: { remindAt: "asc" },
        take: 200,
    });

    let dispatched = 0;

    for (const reminder of due) {
        try {
            if (!reminder.task || reminder.task.status === "COMPLETED" || !reminder.task.dueDate) {
                await prisma.reminderSchedule.update({ where: { id: reminder.id }, data: { status: "CANCELLED" } });
                continue;
            }

            const message = buildMessage(reminder.task, reminder.offsetMinutes);
            let notificationId: string | undefined;

            if (reminder.user.taskNotificationsEnabled) {
                const notification = await prisma.notification.create({
                    data: {
                        userId: reminder.userId,
                        workspaceId: reminder.task.workspaceId,
                        taskId: reminder.task.id,
                        reminderScheduleId: reminder.id,
                        type: "DUE_DATE_REMINDER",
                        message,
                    },
                });
                notificationId = notification.id;
            }

            const prefs = await prisma.notificationPreference.findUnique({ where: { userId: reminder.userId } });
            if (!prefs || prefs.pushEnabled) {
                await sendPushToUser(reminder.userId, {
                    title: "Task Reminder",
                    body: message,
                    tag: `reminder-${reminder.id}`,
                    url: `/app/tasks?taskId=${reminder.task.id}`,
                    taskId: reminder.task.id,
                    reminderId: reminder.id,
                    notificationId,
                    sound: prefs?.soundEnabled ?? true,
                    vibrate: prefs?.vibrationEnabled ?? true,
                    actions: [
                        { action: "view", title: "View Task" },
                        { action: "complete", title: "Mark Complete" },
                        { action: "snooze", title: "Snooze" },
                    ],
                });
            }

            await prisma.reminderSchedule.update({ where: { id: reminder.id }, data: { status: "SENT" } });
            dispatched += 1;
        } catch (error) {
            console.error(`[reminders] Failed to dispatch reminder ${reminder.id}:`, error);
        }
    }

    return { dispatched };
};

let timer: ReturnType<typeof setInterval> | null = null;

export const startReminderWorker = (): void => {
    if (timer) return;
    const intervalMs = Number(process.env.REMINDER_POLL_INTERVAL_MS) || 30000;

    timer = setInterval(() => {
        dispatchDueReminders().catch((error) => console.error("[reminders] dispatch tick failed:", error));
    }, intervalMs);

    // Run once shortly after boot so reminders don't wait a full interval
    // after a fresh server restart.
    setTimeout(() => {
        dispatchDueReminders().catch((error) => console.error("[reminders] initial dispatch failed:", error));
    }, 2000);

    console.log(`[reminders] Reminder worker started (polling every ${intervalMs}ms)`);
};

export const stopReminderWorker = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
};
