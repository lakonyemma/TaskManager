import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/plan.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// Priority is used as a fallback effort weight (in "estimated minutes") for
// tasks nobody has explicitly estimated — LOW=30m, MEDIUM=1h, HIGH=2h,
// CRITICAL=4h — so workload charts are still meaningful before users adopt
// the estimatedMinutes field.
const PRIORITY_MINUTES: Record<string, number> = { LOW: 30, MEDIUM: 60, HIGH: 120, CRITICAL: 240 };
const effortMinutes = (task: { estimatedMinutes: number | null; priority: string }) =>
    task.estimatedMinutes ?? PRIORITY_MINUTES[task.priority] ?? 60;

const bucketKey = (date: Date, granularity: "daily" | "weekly" | "monthly"): string => {
    if (granularity === "monthly") return date.toISOString().slice(0, 7); // YYYY-MM
    if (granularity === "weekly") {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() - day); // start of week (Sunday)
        d.setHours(0, 0, 0, 0);
        return d.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
};

const RANGE_DAYS: Record<string, number> = { daily: 14, weekly: 12 * 7, monthly: 6 * 30 };

export const getWorkload = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = req.query.workspaceId as string | undefined;
        const granularity = (["daily", "weekly", "monthly"].includes(req.query.granularity as string) ? req.query.granularity : "daily") as "daily" | "weekly" | "monthly";
        const scope = req.query.scope === "team" ? "team" : "individual";

        if (!workspaceId) {
            return res.status(400).json({ message: "workspaceId is required" });
        }
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const rangeStart = new Date();
        rangeStart.setHours(0, 0, 0, 0);
        rangeStart.setDate(rangeStart.getDate() - Math.floor(RANGE_DAYS[granularity] / 2));
        const rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeEnd.getDate() + RANGE_DAYS[granularity]);

        const where: Record<string, unknown> = {
            workspaceId,
            dueDate: { gte: rangeStart, lte: rangeEnd },
        };
        if (scope === "individual") where.assignedToId = authUser.id;

        const tasks = await prisma.task.findMany({
            where,
            select: { id: true, dueDate: true, status: true, priority: true, estimatedMinutes: true, assignedToId: true, assignedTo: { select: { id: true, firstname: true, lastName: true } } },
        });

        const buckets = new Map<string, { date: string; taskCount: number; estimatedMinutes: number; completedCount: number }>();
        for (const t of tasks) {
            if (!t.dueDate) continue;
            const key = bucketKey(t.dueDate, granularity);
            const bucket = buckets.get(key) ?? { date: key, taskCount: 0, estimatedMinutes: 0, completedCount: 0 };
            bucket.taskCount += 1;
            bucket.estimatedMinutes += effortMinutes(t);
            if (t.status === "COMPLETED") bucket.completedCount += 1;
            buckets.set(key, bucket);
        }
        const series = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));

        // Bottleneck: buckets in the near future (today onward) where
        // estimated workload meaningfully exceeds a healthy daily/weekly pace.
        const HEALTHY_MINUTES: Record<string, number> = { daily: 6 * 60, weekly: 30 * 60, monthly: 120 * 60 };
        const todayKey = bucketKey(new Date(), granularity);
        const bottlenecks = series.filter((b) => b.date >= todayKey && b.estimatedMinutes > HEALTHY_MINUTES[granularity]);

        let byAssignee: { userId: string; name: string; taskCount: number; estimatedMinutes: number }[] = [];
        if (scope === "team") {
            const map = new Map<string, { userId: string; name: string; taskCount: number; estimatedMinutes: number }>();
            for (const t of tasks) {
                if (!t.assignedToId || !t.assignedTo) continue;
                const entry = map.get(t.assignedToId) ?? { userId: t.assignedToId, name: `${t.assignedTo.firstname} ${t.assignedTo.lastName}`, taskCount: 0, estimatedMinutes: 0 };
                entry.taskCount += 1;
                entry.estimatedMinutes += effortMinutes(t);
                map.set(t.assignedToId, entry);
            }
            byAssignee = Array.from(map.values()).sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
        }

        return res.status(200).json({ granularity, scope, series, bottlenecks, byAssignee });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
