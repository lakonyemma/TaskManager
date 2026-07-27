import prisma from "../../lib/prisma.js";

// The six preset intervals from the spec. Any other positive minute count is
// still accepted (covers "custom reminder minutes"); presets just get a
// friendlier label.
export const REMINDER_OFFSET_OPTIONS = [
    { minutes: 5, label: "5 minutes before" },
    { minutes: 10, label: "10 minutes before" },
    { minutes: 15, label: "15 minutes before" },
    { minutes: 30, label: "30 minutes before" },
    { minutes: 60, label: "1 hour before" },
    { minutes: 1440, label: "1 day before" },
] as const;

const OFFSET_LABELS = new Map<number, string>(REMINDER_OFFSET_OPTIONS.map((o) => [o.minutes, o.label]));

export const offsetLabel = (minutes: number) => OFFSET_LABELS.get(minutes) || `${minutes} minutes before`;

export const humanizeMinutes = (minutes: number): string => {
    if (minutes <= 1) return "1 minute";
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) {
        const hours = Math.round(minutes / 60);
        return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    const days = Math.round(minutes / 1440);
    return `${days} day${days === 1 ? "" : "s"}`;
};

const getDefaultOffsets = async (userId: string): Promise<number[]> => {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
    return pref?.defaultReminderMinutes?.length ? pref.defaultReminderMinutes : [15];
};

// Cancels every still-pending reminder for a task (offset-based, custom, and
// snoozed alike) — used when a task is completed, deleted*, or resynced.
// (*deletion also cascades at the DB level; this covers the "cancel without
// deleting the task" cases like completion.)
export const cancelTaskReminders = async (taskId: string) => {
    await prisma.reminderSchedule.updateMany({
        where: { taskId, status: { in: ["PENDING", "SNOOZED"] } },
        data: { status: "CANCELLED" },
    });
};

export type ReminderSyncOptions = {
    offsets?: number[];
    customTimes?: string[];
};

// Rebuilds a task's pending reminders for its current assignee. Call this
// whenever the due date, assignee, or reminder selection changes so
// schedules stay in sync with the task instead of firing against stale data.
//
// When `offsets` isn't explicitly passed (e.g. a due-date-only edit), the
// assignee's existing offset selection is preserved rather than reset to
// their defaults; custom absolute times are only touched when explicitly
// provided since a due-date shift shouldn't silently move a fixed reminder.
export const syncTaskReminders = async (
    task: { id: string; dueDate: Date | null; assignedToId: string | null },
    options: ReminderSyncOptions = {},
): Promise<void> => {
    let offsets = options.offsets;

    if (offsets === undefined && task.assignedToId) {
        const existing = await prisma.reminderSchedule.findMany({
            where: {
                taskId: task.id,
                userId: task.assignedToId,
                status: { in: ["PENDING", "SNOOZED"] },
                offsetMinutes: { not: null },
            },
            select: { offsetMinutes: true },
        });
        offsets = existing.length ? existing.map((e) => e.offsetMinutes as number) : await getDefaultOffsets(task.assignedToId);
    }

    await cancelTaskReminders(task.id);

    if (!task.dueDate || !task.assignedToId) return;

    const userId = task.assignedToId;
    const dueDate = task.dueDate;
    const now = Date.now();
    const rows: { taskId: string; userId: string; offsetMinutes: number | null; remindAt: Date; label: string; status: "PENDING" }[] = [];

    for (const minutes of offsets || []) {
        if (!Number.isFinite(minutes) || minutes <= 0) continue;
        const remindAt = new Date(dueDate.getTime() - minutes * 60000);
        if (remindAt.getTime() <= now) continue;
        rows.push({ taskId: task.id, userId, offsetMinutes: minutes, remindAt, label: offsetLabel(minutes), status: "PENDING" });
    }

    for (const iso of options.customTimes || []) {
        const remindAt = new Date(iso);
        if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= now) continue;
        rows.push({ taskId: task.id, userId, offsetMinutes: null, remindAt, label: "Custom reminder", status: "PENDING" });
    }

    if (rows.length === 0) return;
    await prisma.reminderSchedule.createMany({ data: rows });
};

// Marks the original reminder resolved and schedules a fresh one `minutes`
// from now. Used both by the in-app "Snooze" action and the push
// notification action button handled in the service worker.
export const snoozeReminder = async (reminderId: string, userId: string, minutes = 10) => {
    const reminder = await prisma.reminderSchedule.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.userId !== userId) return null;

    await prisma.reminderSchedule.update({
        where: { id: reminderId },
        data: { status: reminder.status === "SENT" ? "SENT" : "CANCELLED" },
    });

    return prisma.reminderSchedule.create({
        data: {
            taskId: reminder.taskId,
            userId,
            offsetMinutes: null,
            remindAt: new Date(Date.now() + minutes * 60000),
            label: `Snoozed ${minutes}m`,
            status: "PENDING",
        },
    });
};
