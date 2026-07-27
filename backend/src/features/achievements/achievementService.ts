import prisma from "../../lib/prisma.js";

// Deliberately small and outcome-based (no points/levels/badges-for-logging-in)
// — professional recognition for real productivity milestones, per spec.
const CATALOG = [
    { key: "FIRST_TASK", name: "First Step", description: "Completed your first task.", icon: "CheckCircle2" },
    { key: "TASKS_10", name: "Getting Things Done", description: "Completed 10 tasks.", icon: "ListChecks" },
    { key: "TASKS_100", name: "Centurion", description: "Completed 100 tasks.", icon: "Trophy" },
    { key: "TASKS_500", name: "Taskmaster", description: "Completed 500 tasks.", icon: "Crown" },
    { key: "STREAK_7", name: "Week Warrior", description: "Completed at least one task every day for 7 days straight.", icon: "Flame" },
    { key: "STREAK_30", name: "Momentum", description: "Completed at least one task every day for 30 days straight.", icon: "Flame" },
    { key: "EARLY_BIRD", name: "Early Bird", description: "Completed 10 tasks before 9 AM.", icon: "Sunrise" },
] as const;

export type AchievementKey = (typeof CATALOG)[number]["key"];

let seeded = false;

// Idempotent — safe to call on every server boot. Avoids requiring a manual
// `db:seed` run for the achievement catalog to exist (unlike Plans, which
// are seeded via prisma/seed.ts).
export const ensureAchievementsSeeded = async (): Promise<void> => {
    if (seeded) return;
    for (const a of CATALOG) {
        await prisma.achievement.upsert({
            where: { key: a.key },
            update: { name: a.name, description: a.description, icon: a.icon },
            create: a,
        });
    }
    seeded = true;
};

const grant = async (userId: string, key: AchievementKey) => {
    const achievement = await prisma.achievement.findUnique({ where: { key } });
    if (!achievement) return null;
    try {
        await prisma.userAchievement.create({ data: { userId, achievementId: achievement.id } });
        return achievement;
    } catch {
        return null; // already earned — unique(userId, achievementId) rejected it
    }
};

// Longest current run of consecutive calendar days containing at least one
// completion, anchored at today or yesterday (a streak "pauses" for a day
// still in progress but is broken by a full missed day).
const computeCurrentStreak = (distinctDaysDesc: Date[]): number => {
    if (distinctDaysDesc.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysSinceMostRecent = Math.round((today.getTime() - distinctDaysDesc[0].getTime()) / 86400000);
    if (daysSinceMostRecent > 1) return 0;

    let streak = 1;
    for (let i = 1; i < distinctDaysDesc.length; i++) {
        const gap = Math.round((distinctDaysDesc[i - 1].getTime() - distinctDaysDesc[i].getTime()) / 86400000);
        if (gap === 1) streak++;
        else break;
    }
    return streak;
};

export const checkAndGrantAchievements = async (userId: string): Promise<{ key: string; name: string; description: string; icon: string }[]> => {
    await ensureAchievementsSeeded();

    const completedTasks = await prisma.task.findMany({
        where: { completedById: userId, status: "COMPLETED", completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: "desc" },
    });

    const total = completedTasks.length;
    const newlyEarned: { key: string; name: string; description: string; icon: string }[] = [];

    const tryGrant = async (key: AchievementKey, condition: boolean) => {
        if (!condition) return;
        const achievement = await grant(userId, key);
        if (achievement) newlyEarned.push(achievement);
    };

    await tryGrant("FIRST_TASK", total >= 1);
    await tryGrant("TASKS_10", total >= 10);
    await tryGrant("TASKS_100", total >= 100);
    await tryGrant("TASKS_500", total >= 500);

    const distinctDays = Array.from(
        new Set(completedTasks.map((t) => { const d = new Date(t.completedAt!); d.setHours(0, 0, 0, 0); return d.getTime(); })),
    ).map((ms) => new Date(ms)).sort((a, b) => b.getTime() - a.getTime());

    const streak = computeCurrentStreak(distinctDays);
    await tryGrant("STREAK_7", streak >= 7);
    await tryGrant("STREAK_30", streak >= 30);

    const earlyBirdCount = completedTasks.filter((t) => t.completedAt && t.completedAt.getHours() < 9).length;
    await tryGrant("EARLY_BIRD", earlyBirdCount >= 10);

    return newlyEarned;
};

export const listUserAchievements = async (userId: string) => {
    await ensureAchievementsSeeded();
    const [earned, all] = await Promise.all([
        prisma.userAchievement.findMany({ where: { userId }, include: { achievement: true }, orderBy: { earnedAt: "desc" } }),
        prisma.achievement.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    const earnedKeys = new Set(earned.map((e) => e.achievement.key));
    return {
        earned: earned.map((e) => ({ key: e.achievement.key, name: e.achievement.name, description: e.achievement.description, icon: e.achievement.icon, earnedAt: e.earnedAt })),
        locked: all.filter((a) => !earnedKeys.has(a.key)).map((a) => ({ key: a.key, name: a.name, description: a.description, icon: a.icon })),
    };
};
