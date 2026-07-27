import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getWorkspacePlan } from "../../utils/plan.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// Free gets the basic total/completed/inProgress/overdue summary every plan
// sees today. Premium+ additionally gets the completion percentage, a
// 7-day daily completion trend, and a per-workspace breakdown — the
// "productivity analytics" / "weekly reports" the spec calls out.
export const getReports = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const userWorkspaceMemberships = await prisma.workspaceMember.findMany({
            where: { userId: authUser.id },
            select: { workspaceId: true },
        });
        const userWorkspaceIds = userWorkspaceMemberships.map((w) => w.workspaceId);

        const tasks = await prisma.task.findMany({
            where: { workspaceId: { in: userWorkspaceIds } },
            include: { workspace: true },
        });

        const completed = tasks.filter((task) => task.status === "COMPLETED").length;
        const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS").length;
        const overdue = tasks.filter((task) => task.dueDate && new Date(task.dueDate) < new Date()).length;

        const summary = {
            total: tasks.length,
            completed,
            inProgress,
            overdue,
        };

        // Analytics gating is per-workspace, but this endpoint spans every
        // workspace the user belongs to — so "advanced" unlocks as soon as
        // ANY of them is on a plan with canUseAnalytics.
        const plans = await Promise.all(userWorkspaceIds.map((id) => getWorkspacePlan(id)));
        const hasAnalytics = plans.some((plan) => plan.canUseAnalytics);

        if (!hasAnalytics) {
            return res.status(200).json({ summary, tasks, advanced: false });
        }

        const completionRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

        const trend: { date: string; completed: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date();
            day.setHours(0, 0, 0, 0);
            day.setDate(day.getDate() - i);
            const nextDay = new Date(day);
            nextDay.setDate(day.getDate() + 1);
            const completedThatDay = tasks.filter(
                (task) => task.status === "COMPLETED" && task.updatedAt >= day && task.updatedAt < nextDay,
            ).length;
            trend.push({ date: day.toISOString().slice(0, 10), completed: completedThatDay });
        }

        const byWorkspace = await Promise.all(
            userWorkspaceIds.map(async (workspaceId) => {
                const workspaceTasks = tasks.filter((t) => t.workspaceId === workspaceId);
                const workspace = workspaceTasks[0]?.workspace ?? (await prisma.workspace.findUnique({ where: { id: workspaceId } }));
                return {
                    workspaceId,
                    workspaceName: workspace?.name ?? "Unknown",
                    total: workspaceTasks.length,
                    completed: workspaceTasks.filter((t) => t.status === "COMPLETED").length,
                };
            }),
        );

        return res.status(200).json({
            summary,
            tasks,
            advanced: true,
            completionRate,
            weeklyTrend: trend,
            byWorkspace,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
