import prisma from "../../lib/prisma.js";
import type { Task } from "../../../generated/prisma/client.js";
import { syncTaskReminders } from "../reminders/reminderService.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const addInterval = (date: Date, rule: string, interval: number): Date => {
    const d = new Date(date);
    switch (rule) {
        case "DAILY": d.setDate(d.getDate() + interval); break;
        case "WEEKLY": d.setDate(d.getDate() + interval * 7); break;
        case "MONTHLY": d.setMonth(d.getMonth() + interval); break;
        case "YEARLY": d.setFullYear(d.getFullYear() + interval); break;
    }
    return d;
};

const isBusinessDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

const nextBusinessDay = (d: Date): Date => {
    const next = new Date(d);
    while (!isBusinessDay(next)) next.setDate(next.getDate() + 1);
    return next;
};

// Walks forward day-by-day from `from` until landing on one of the selected
// weekdays (0=Sun..6=Sat) — used for WEEKLY rules with specific days picked
// (e.g. "every Mon/Wed/Fri").
const nextSelectedWeekday = (from: Date, daysOfWeek: number[]): Date => {
    const d = new Date(from);
    for (let i = 0; i < 8; i++) {
        if (daysOfWeek.includes(d.getDay())) return d;
        d.setDate(d.getDate() + 1);
    }
    return from;
};

type RecurrenceConfig = {
    dueDate: Date | null;
    recurrenceRule: string | null;
    recurrenceInterval: number | null;
    recurrenceDaysOfWeek: number[];
    recurrenceBusinessDaysOnly: boolean;
};

export const computeNextOccurrenceDate = (task: RecurrenceConfig): Date | null => {
    if (!task.dueDate || !task.recurrenceRule) return null;
    const interval = task.recurrenceInterval && task.recurrenceInterval > 0 ? task.recurrenceInterval : 1;

    let next: Date;
    if (task.recurrenceRule === "WEEKLY" && task.recurrenceDaysOfWeek.length > 0) {
        const dayAfter = new Date(task.dueDate.getTime() + DAY_MS);
        next = nextSelectedWeekday(dayAfter, task.recurrenceDaysOfWeek);
        if (interval > 1) next.setDate(next.getDate() + (interval - 1) * 7);
    } else {
        next = addInterval(task.dueDate, task.recurrenceRule, interval);
    }

    if (task.recurrenceBusinessDaysOnly) next = nextBusinessDay(next);
    return next;
};

// Spawns the next occurrence of a recurring task once the current one is
// completed. Occurrences form a flat chain — every generated task's
// `recurrenceParentId` points back to the original template task, not the
// immediately preceding occurrence, so "all occurrences of this series" is a
// single `WHERE recurrenceParentId = <root> OR id = <root>` query.
export const generateNextOccurrence = async (completedTask: Task): Promise<Task | null> => {
    if (!completedTask.isRecurring || !completedTask.recurrenceRule || !completedTask.dueDate) return null;

    if (completedTask.recurrenceCount && completedTask.recurrenceOccurrenceNumber >= completedTask.recurrenceCount) {
        return null;
    }

    const nextDueDate = computeNextOccurrenceDate(completedTask);
    if (!nextDueDate) return null;
    if (completedTask.recurrenceEndDate && nextDueDate.getTime() > completedTask.recurrenceEndDate.getTime()) {
        return null;
    }

    const nextTask = await prisma.task.create({
        data: {
            title: completedTask.title,
            description: completedTask.description,
            priority: completedTask.priority,
            status: "TODO",
            dueDate: nextDueDate,
            workspaceId: completedTask.workspaceId,
            assignedToId: completedTask.assignedToId,
            labels: completedTask.labels,
            isRecurring: true,
            recurrenceRule: completedTask.recurrenceRule,
            recurrenceInterval: completedTask.recurrenceInterval,
            recurrenceDaysOfWeek: completedTask.recurrenceDaysOfWeek,
            recurrenceBusinessDaysOnly: completedTask.recurrenceBusinessDaysOnly,
            recurrenceEndDate: completedTask.recurrenceEndDate,
            recurrenceCount: completedTask.recurrenceCount,
            recurrenceOccurrenceNumber: completedTask.recurrenceOccurrenceNumber + 1,
            recurrenceParentId: completedTask.recurrenceParentId ?? completedTask.id,
        },
    });

    if (nextTask.dueDate && nextTask.assignedToId) {
        await syncTaskReminders(nextTask, {});
    }

    return nextTask;
};
