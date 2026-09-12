export const DAILY_CAPACITY_MINUTES = 6 * 60;

export type ExecutionTask = {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    completedAt: Date | null;
    estimatedMinutes: number | null;
    updatedAt: Date;
    isWaiting?: boolean;
};

export type PlannedTask = ExecutionTask & {
    effortMinutes: number;
    urgencyScore: number;
    overflow: boolean;
};

export type RiskItem = ExecutionTask & {
    effortMinutes: number;
    level: "CRITICAL" | "HIGH" | "MEDIUM";
    reason: string;
    daysUntilDue: number;
};

const PRIORITY_MINUTES: Record<string, number> = {
    LOW: 30,
    MEDIUM: 60,
    HIGH: 120,
    CRITICAL: 240,
};

const PRIORITY_SCORE: Record<string, number> = {
    LOW: 20,
    MEDIUM: 80,
    HIGH: 180,
    CRITICAL: 300,
};

const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

export const taskEffortMinutes = (task: Pick<ExecutionTask, "estimatedMinutes" | "priority">) =>
    task.estimatedMinutes ?? PRIORITY_MINUTES[task.priority] ?? 60;

export const daysBetween = (from: Date, to: Date) => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / oneDay);
};

const urgencyScore = (task: ExecutionTask, now: Date) => {
    let score = PRIORITY_SCORE[task.priority] ?? 80;
    if (task.status === "IN_PROGRESS") score += 100;

    if (!task.dueDate) return score + 80;

    const days = daysBetween(now, task.dueDate);
    if (days < 0) score += 1000 + Math.min(Math.abs(days) * 25, 250);
    else if (days === 0) score += 800;
    else if (days <= 2) score += 600;
    else if (days <= 7) score += 400;
    else score += 100;

    return score;
};

export const buildTodayPlan = (
    tasks: ExecutionTask[],
    now = new Date(),
    capacityMinutes = DAILY_CAPACITY_MINUTES,
) => {
    const candidates = tasks
        .filter((task) => task.status !== "COMPLETED" && !task.isWaiting)
        .map((task) => ({
            ...task,
            effortMinutes: taskEffortMinutes(task),
            urgencyScore: urgencyScore(task, now),
        }))
        .sort((a, b) => b.urgencyScore - a.urgencyScore || a.title.localeCompare(b.title));

    const plan: PlannedTask[] = [];
    let plannedMinutes = 0;

    for (const task of candidates) {
        const days = task.dueDate ? daysBetween(now, task.dueDate) : null;
        const mustSurface = days !== null && days <= 0;
        const fits = plannedMinutes + task.effortMinutes <= capacityMinutes;

        if (!mustSurface && !fits) continue;

        const overflow = plannedMinutes + task.effortMinutes > capacityMinutes;
        plan.push({ ...task, overflow });
        plannedMinutes += task.effortMinutes;
    }

    return {
        tasks: plan,
        plannedMinutes,
        capacityMinutes,
        overloaded: plannedMinutes > capacityMinutes,
    };
};

export const buildDeadlineRisks = (tasks: ExecutionTask[], now = new Date()): RiskItem[] => {
    const risks: RiskItem[] = [];

    for (const task of tasks) {
        if (task.status === "COMPLETED" || task.isWaiting || !task.dueDate) continue;

        const daysUntilDue = daysBetween(now, task.dueDate);
        const effortMinutes = taskEffortMinutes(task);
        let level: RiskItem["level"] | null = null;
        let reason = "";

        if (daysUntilDue < 0) {
            level = "CRITICAL";
            const daysLate = Math.abs(daysUntilDue);
            reason = `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`;
        } else {
            const availableMinutes = Math.max(1, daysUntilDue + 1) * DAILY_CAPACITY_MINUTES;
            const pressure = effortMinutes / availableMinutes;

            if (daysUntilDue === 0 && effortMinutes >= 180) {
                level = "CRITICAL";
                reason = `${effortMinutes} minutes of work due today`;
            } else if (pressure >= 0.75 || (daysUntilDue <= 1 && effortMinutes >= 120)) {
                level = "HIGH";
                reason = `${effortMinutes} minutes of work with ${daysUntilDue === 0 ? "less than a day" : `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`} left`;
            } else if (daysUntilDue <= 3 && (task.priority === "HIGH" || task.priority === "CRITICAL")) {
                level = "MEDIUM";
                reason = `${task.priority.toLowerCase()} priority task due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
            }
        }

        if (level) risks.push({ ...task, effortMinutes, level, reason, daysUntilDue });
    }

    const rank = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
    return risks.sort((a, b) => rank[b.level] - rank[a.level] || a.daysUntilDue - b.daysUntilDue);
};

export const computeExecutionScore = (tasks: ExecutionTask[], now = new Date()) => {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentCompleted = tasks.filter(
        (task) => task.status === "COMPLETED" && task.completedAt && task.completedAt >= weekAgo,
    );
    const overdueOpen = tasks.filter(
        (task) => task.status !== "COMPLETED" && !task.isWaiting && task.dueDate && task.dueDate < startOfDay(now),
    ).length;

    if (recentCompleted.length === 0) {
        return {
            score: Math.max(0, 50 - Math.min(overdueOpen * 5, 30)),
            hasHistory: false,
            completedLast7Days: 0,
            onTimeRate: 0,
            consistencyDays: 0,
            overdueOpen,
        };
    }

    const onTime = recentCompleted.filter(
        (task) => !task.dueDate || (task.completedAt && task.completedAt <= task.dueDate),
    ).length;
    const onTimeRate = onTime / recentCompleted.length;
    const activeDays = new Set(recentCompleted.map((task) => task.completedAt!.toISOString().slice(0, 10))).size;
    const consistency = activeDays / 7;
    const score = Math.max(
        0,
        Math.min(100, Math.round(onTimeRate * 70 + consistency * 30 - Math.min(overdueOpen * 5, 30))),
    );

    return {
        score,
        hasHistory: true,
        completedLast7Days: recentCompleted.length,
        onTimeRate: Math.round(onTimeRate * 100),
        consistencyDays: activeDays,
        overdueOpen,
    };
};
