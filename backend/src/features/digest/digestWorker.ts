import prisma from "../../lib/prisma.js";
import { sendDigestEmail } from "../../utils/email.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const isDue = (frequency: "DAILY" | "WEEKLY", lastSentAt: Date | null): boolean => {
    if (!lastSentAt) return true;
    const elapsed = Date.now() - lastSentAt.getTime();
    return elapsed >= (frequency === "DAILY" ? DAY_MS : WEEK_MS);
};

// Same polling approach as reminderWorker.ts — no cron/queue infra in this
// deployment, so a periodic scan of {digestFrequency, lastDigestSentAt} is
// the established pattern rather than introducing a new dependency for it.
export const dispatchDueDigests = async (): Promise<{ sent: number }> => {
    let sent = 0;
    try {
        const prefs = await prisma.notificationPreference.findMany({
            where: { digestFrequency: { in: ["DAILY", "WEEKLY"] } },
            include: { user: { select: { id: true, email: true, firstname: true, isActive: true, emailNotificationsEnabled: true } } },
        });

        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday.getTime() + DAY_MS);
        const weekAhead = new Date(startOfToday.getTime() + WEEK_MS);

        for (const pref of prefs) {
            try {
                if (!pref.user.isActive || !pref.user.emailNotificationsEnabled) continue;
                const frequency = pref.digestFrequency as "DAILY" | "WEEKLY";
                if (!isDue(frequency, pref.lastDigestSentAt)) continue;

                const taskSelect = { title: true, dueDate: true } as const;
                const [overdue, dueToday, dueSoon, completedCount] = await Promise.all([
                    prisma.task.findMany({
                        where: { assignedToId: pref.userId, status: { not: "COMPLETED" }, dueDate: { lt: startOfToday } },
                        select: taskSelect, orderBy: { dueDate: "asc" }, take: 8,
                    }),
                    prisma.task.findMany({
                        where: { assignedToId: pref.userId, status: { not: "COMPLETED" }, dueDate: { gte: startOfToday, lt: endOfToday } },
                        select: taskSelect, orderBy: { dueDate: "asc" }, take: 8,
                    }),
                    prisma.task.findMany({
                        where: { assignedToId: pref.userId, status: { not: "COMPLETED" }, dueDate: { gte: endOfToday, lte: weekAhead } },
                        select: taskSelect, orderBy: { dueDate: "asc" }, take: 8,
                    }),
                    prisma.task.count({
                        where: { completedById: pref.userId, completedAt: { gte: pref.lastDigestSentAt || new Date(now.getTime() - DAY_MS) } },
                    }),
                ]);

                // Nothing worth reporting — bump the timestamp so the next
                // check waits a full period instead of retrying every poll,
                // but skip sending an empty email.
                if (!overdue.length && !dueToday.length && !dueSoon.length && !completedCount) {
                    await prisma.notificationPreference.update({ where: { id: pref.id }, data: { lastDigestSentAt: now } });
                    continue;
                }

                await sendDigestEmail(pref.user.email, pref.user.firstname, frequency, { overdue, dueToday, dueSoon, completedCount });
                await prisma.notificationPreference.update({ where: { id: pref.id }, data: { lastDigestSentAt: now } });
                sent += 1;
            } catch (error) {
                console.error(`[digest] Failed to process digest for user ${pref.userId}:`, error);
            }
        }
    } catch (error) {
        console.error("[digest] Failed to dispatch digests:", error);
    }
    return { sent };
};

let timer: ReturnType<typeof setInterval> | null = null;

export const startDigestWorker = (): void => {
    if (timer) return;
    const intervalMs = Number(process.env.DIGEST_POLL_INTERVAL_MS) || 15 * 60 * 1000;

    timer = setInterval(() => {
        dispatchDueDigests().catch((error) => console.error("[digest] dispatch tick failed:", error));
    }, intervalMs);

    setTimeout(() => {
        dispatchDueDigests().catch((error) => console.error("[digest] initial dispatch failed:", error));
    }, 5000);

    console.log(`[digest] Digest worker started (polling every ${intervalMs}ms)`);
};

export const stopDigestWorker = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
};
