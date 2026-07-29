import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// Adds completion percentage, a 7-day daily completion trend, and a
// per-workspace breakdown on top of the basic total/completed/inProgress/
// overdue summary — the "productivity analytics" / "weekly reports".
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

        const completionRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

        const trend: { date: string; completed: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date();
            day.setHours(0, 0, 0, 0);
            day.setDate(day.getDate() - i);
            const nextDay = new Date(day);
            nextDay.setDate(day.getDate() + 1);
            const completedThatDay = tasks.filter((task) => {
                if (task.status !== "COMPLETED") return false;
                const completedOn = task.completedAt ?? task.updatedAt;
                return completedOn >= day && completedOn < nextDay;
            }).length;
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
