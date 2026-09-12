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
    workloadPressurePercent: number;
    recommendedStartAt: Date;
};

export type NextAction = PlannedTask & {
    reason: string;
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

export const clampCapacityMinutes = (value: number | undefined | null) => {
    if (!Number.isFinite(value)) return DAILY_CAPACITY_MINUTES;
    return Math.max(60, Math.min(16 * 60, Math.round(value!)));
};

const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const endOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
};

const addDays = (date: Date, days: number) => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
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
    const capacity = clampCapacityMinutes(capacityMinutes);
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
        const fits = plannedMinutes + task.effortMinutes <= capacity;

        if (!mustSurface && !fits) continue;

        const overflow = plannedMinutes + task.effortMinutes > capacity;
        plan.push({ ...task, overflow });
        plannedMinutes += task.effortMinutes;
    }

    return {
        tasks: plan,
        plannedMinutes,
        capacityMinutes: capacity,
        overloaded: plannedMinutes > capacity,
    };
};

export const selectNextAction = (plan: ReturnType<typeof buildTodayPlan>, now = new Date()): NextAction | null => {
    const task = plan.tasks[0];
    if (!task) return null;

    let reason = "Highest-value task that fits your available time.";
    if (task.dueDate) {
        const days = daysBetween(now, task.dueDate);
        if (days < 0) reason = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}; clear this first.`;
        else if (days === 0) reason = "Due today and currently the most urgent item.";
        else if (days <= 2) reason = `Due in ${days} day${days === 1 ? "" : "s"} with high deadline pressure.`;
    } else if (task.status === "IN_PROGRESS") {
        reason = "Already in progress, so finishing it reduces context switching.";
    } else if (task.priority === "CRITICAL" || task.priority === "HIGH") {
        reason = `${task.priority.toLowerCase()} priority and the strongest next use of your time.`;
    }

    return { ...task, reason };
};

const recommendedStart = (task: ExecutionTask, now: Date, capacityMinutes: number) => {
    if (!task.dueDate) return startOfDay(now);
    const effortDays = Math.max(1, Math.ceil(taskEffortMinutes(task) / Math.max(1, capacityMinutes)));
    const suggested = startOfDay(addDays(task.dueDate, -(effortDays - 1)));
    return suggested < startOfDay(now) ? startOfDay(now) : suggested;
};

export const buildDeadlineRisks = (
    tasks: ExecutionTask[],
    now = new Date(),
    capacityMinutes = DAILY_CAPACITY_MINUTES,
): RiskItem[] => {
    const capacity = clampCapacityMinutes(capacityMinutes);
    const risks: RiskItem[] = [];
    const active = tasks.filter((task) => task.status !== "COMPLETED" && !task.isWaiting);

    for (const task of active) {
        if (!task.dueDate) continue;

        const daysUntilDue = daysBetween(now, task.dueDate);
        const effortMinutes = taskEffortMinutes(task);
        let level: RiskItem["level"] | null = null;
        let reason = "";

        const competingMinutes = active
            .filter((candidate) => candidate.dueDate && candidate.dueDate <= task.dueDate!)
            .reduce((total, candidate) => total + taskEffortMinutes(candidate), 0);
        const availableMinutes = Math.max(1, daysUntilDue + 1) * capacity;
        const pressure = competingMinutes / Math.max(1, availableMinutes);
        const workloadPressurePercent = Math.max(0, Math.round(pressure * 100));

        if (daysUntilDue < 0) {
            level = "CRITICAL";
            const daysLate = Math.abs(daysUntilDue);
            reason = `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`;
        } else if (pressure >= 1) {
            level = daysUntilDue <= 1 ? "CRITICAL" : "HIGH";
            const dailyNeed = Math.ceil(competingMinutes / Math.max(1, daysUntilDue + 1));
            reason = `Current workload needs about ${dailyNeed} minutes per day before this deadline, above your ${capacity}-minute capacity`;
        } else if (daysUntilDue === 0 && effortMinutes >= Math.min(180, capacity)) {
            level = "CRITICAL";
            reason = `${effortMinutes} minutes of work due today`;
        } else if (pressure >= 0.75 || (daysUntilDue <= 1 && effortMinutes >= 120)) {
            level = "HIGH";
            reason = `${workloadPressurePercent}% of available capacity is already committed before this deadline`;
        } else if (daysUntilDue <= 3 && (task.priority === "HIGH" || task.priority === "CRITICAL")) {
            level = "MEDIUM";
            reason = `${task.priority.toLowerCase()} priority task due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`;
        }

        if (level) {
            risks.push({
                ...task,
                effortMinutes,
                level,
                reason,
                daysUntilDue,
                workloadPressurePercent,
                recommendedStartAt: recommendedStart(task, now, capacity),
            });
        }
    }

    const rank = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
    return risks.sort((a, b) => rank[b.level] - rank[a.level] || a.daysUntilDue - b.daysUntilDue);
};

export const buildWeeklyReview = (
    tasks: ExecutionTask[],
    now = new Date(),
    capacityMinutes = DAILY_CAPACITY_MINUTES,
) => {
    const capacity = clampCapacityMinutes(capacityMinutes);
    const weekAgo = addDays(now, -7);
    const nextWeek = endOfDay(addDays(now, 7));
    const completed = tasks.filter((task) => task.status === "COMPLETED" && task.completedAt && task.completedAt >= weekAgo);
    const onTimeCompleted = completed.filter((task) => !task.dueDate || (task.completedAt && task.completedAt <= task.dueDate)).length;
    const open = tasks.filter((task) => task.status !== "COMPLETED" && !task.isWaiting);
    const overdueOpen = open.filter((task) => task.dueDate && task.dueDate < startOfDay(now));
    const dueNext7Days = open.filter((task) => task.dueDate && task.dueDate >= startOfDay(now) && task.dueDate <= nextWeek);
    const next7DaysMinutes = dueNext7Days.reduce((total, task) => total + taskEffortMinutes(task), 0);
    const weekCapacity = capacity * 7;

    return {
        completed: completed.length,
        onTimeRate: completed.length ? Math.round((onTimeCompleted / completed.length) * 100) : 0,
        overdueCarried: overdueOpen.length,
        dueNext7Days: dueNext7Days.length,
        next7DaysMinutes,
        weekCapacityMinutes: weekCapacity,
        pressurePercent: Math.round((next7DaysMinutes / Math.max(1, weekCapacity)) * 100),
        recentWins: completed
            .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
            .slice(0, 3)
            .map((task) => ({ id: task.id, title: task.title, completedAt: task.completedAt })),
    };
};

export const suggestSmartReschedule = (
    task: ExecutionTask,
    tasks: ExecutionTask[],
    now = new Date(),
    capacityMinutes = DAILY_CAPACITY_MINUTES,
) => {
    const capacity = clampCapacityMinutes(capacityMinutes);
    const effort = taskEffortMinutes(task);
    const active = tasks.filter((candidate) => candidate.id !== task.id && candidate.status !== "COMPLETED" && !candidate.isWaiting);
    const originalHour = task.dueDate?.getHours() ?? 17;
    const originalMinute = task.dueDate?.getMinutes() ?? 0;

    for (let offset = 1; offset <= 14; offset += 1) {
        const day = addDays(now, offset);
        const load = active
            .filter((candidate) => candidate.dueDate && daysBetween(day, candidate.dueDate) === 0)
            .reduce((total, candidate) => total + taskEffortMinutes(candidate), 0);
        if (load + effort <= capacity) {
            const dueDate = new Date(day);
            dueDate.setHours(originalHour, originalMinute, 0, 0);
            return {
                dueDate,
                reason: load === 0
                    ? "This is the next day with enough free capacity."
                    : `This day has ${capacity - load} minutes free before adding this task.`,
                dayLoadMinutes: load,
                capacityMinutes: capacity,
            };
        }
    }

    const fallback = addDays(now, 14);
    fallback.setHours(originalHour, originalMinute, 0, 0);
    return {
        dueDate: fallback,
        reason: "The next two weeks are heavily loaded, so Taskly moved it to the furthest planning day.",
        dayLoadMinutes: capacity,
        capacityMinutes: capacity,
    };
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
