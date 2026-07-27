import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getWorkspacePlan } from "../../utils/plan.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const getInsights = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const memberships = await prisma.workspaceMember.findMany({ where: { userId: authUser.id }, select: { workspaceId: true } });
        const plans = await Promise.all(memberships.map((m) => getWorkspacePlan(m.workspaceId)));
        if (!plans.some((p) => p.canUseAnalytics)) {
            return res.status(403).json({ message: "Smart insights require a plan upgrade.", upgradeRequired: true, feature: "canUseAnalytics" });
        }
        const workspaceIds = memberships.map((m) => m.workspaceId);

        const completed = await prisma.task.findMany({
            where: { assignedToId: authUser.id, status: "COMPLETED", completedAt: { not: null } },
            select: { completedAt: true, createdAt: true, dueDate: true, workspaceId: true },
        });

        const hourCounts = new Array(24).fill(0);
        const dayCounts = new Array(7).fill(0);
        let onTime = 0;
        let totalWithDueDate = 0;
        let totalLeadTimeMs = 0;

        for (const t of completed) {
            const completedAt = t.completedAt!;
            hourCounts[completedAt.getHours()] += 1;
            dayCounts[completedAt.getDay()] += 1;
            totalLeadTimeMs += completedAt.getTime() - t.createdAt.getTime();
            if (t.dueDate) {
                totalWithDueDate += 1;
                if (completedAt.getTime() <= t.dueDate.getTime()) onTime += 1;
            }
        }

        const mostProductiveHours = hourCounts
            .map((count, hour) => ({ hour, count }))
            .filter((h) => h.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const mostProductiveDays = dayCounts
            .map((count, day) => ({ day: DAY_NAMES[day], count }))
            .filter((d) => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        // 30-day completion trend
        const trendStart = new Date();
        trendStart.setHours(0, 0, 0, 0);
        trendStart.setDate(trendStart.getDate() - 29);
        const trendBuckets = new Map<string, number>();
        for (let i = 0; i < 30; i++) {
            const d = new Date(trendStart);
            d.setDate(d.getDate() + i);
            trendBuckets.set(d.toISOString().slice(0, 10), 0);
        }
        for (const t of completed) {
            const key = t.completedAt!.toISOString().slice(0, 10);
            if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) || 0) + 1);
        }
        const completionTrend = Array.from(trendBuckets.entries()).map(([date, count]) => ({ date, completed: count }));

        const onTimeRate = totalWithDueDate > 0 ? Math.round((onTime / totalWithDueDate) * 100) : null;
        const avgCompletionTimeHours = completed.length > 0 ? Math.round((totalLeadTimeMs / completed.length / 3600000) * 10) / 10 : null;

        const projectHealth = await Promise.all(
            workspaceIds.map(async (workspaceId) => {
                const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
                const [total, done, overdue] = await Promise.all([
                    prisma.task.count({ where: { workspaceId } }),
                    prisma.task.count({ where: { workspaceId, status: "COMPLETED" } }),
                    prisma.task.count({ where: { workspaceId, status: { not: "COMPLETED" }, dueDate: { lt: new Date() } } }),
                ]);
                return {
                    workspaceId,
                    workspaceName: workspace?.name ?? "Unknown",
                    total,
                    completed: done,
                    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
                    overdueCount: overdue,
                };
            }),
        );

        const recommendations: string[] = [];
        if (mostProductiveHours.length > 0) {
            const top = mostProductiveHours[0];
            const label = top.hour === 0 ? "12 AM" : top.hour < 12 ? `${top.hour} AM` : top.hour === 12 ? "12 PM" : `${top.hour - 12} PM`;
            recommendations.push(`You complete the most tasks around ${label} — try scheduling your hardest work in that window.`);
        }
        if (onTimeRate !== null && onTimeRate < 70) {
            recommendations.push(`Only ${onTimeRate}% of your tasks finish by their due date — consider shorter due-date buffers or breaking large tasks down.`);
        }
        const worstProject = projectHealth.filter((p) => p.total >= 3).sort((a, b) => a.completionRate - b.completionRate)[0];
        if (worstProject && worstProject.completionRate < 50) {
            recommendations.push(`"${worstProject.workspaceName}" is at ${worstProject.completionRate}% completion with ${worstProject.overdueCount} overdue task(s) — it may need attention.`);
        }
        if (recommendations.length === 0) {
            recommendations.push("Keep it up — your task completion patterns look healthy.");
        }

        return res.status(200).json({
            mostProductiveHours,
            mostProductiveDays,
            completionTrend,
            onTimeRate,
            avgCompletionTimeHours,
            projectHealth,
            recommendations,
            totalCompleted: completed.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
