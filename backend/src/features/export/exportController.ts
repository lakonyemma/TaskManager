import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership, getWorkspacePlan } from "../../utils/plan.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const toCsv = (rows: Record<string, unknown>[]): string => {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
        const str = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers.join(",")];
    for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
    return lines.join("\n");
};

// Exports either the task list for a workspace, or a summary of every
// workspace the user belongs to (the closest analog to "export projects" —
// this codebase organizes tasks directly under workspaces, with no
// separate Project entity).
export const exportData = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const type = (req.query.type as string) || "tasks";
        const format = (req.query.format as string) === "json" ? "json" : "csv";
        const workspaceId = req.query.workspaceId as string | undefined;

        if (type === "tasks") {
            if (!workspaceId) return res.status(400).json({ message: "workspaceId is required" });

            const membership = await getMembership(authUser.id, workspaceId);
            if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

            const plan = await getWorkspacePlan(workspaceId);
            if (!plan.canUseExport) {
                return res.status(403).json({ message: "Exporting requires a plan upgrade.", upgradeRequired: true, feature: "canUseExport" });
            }

            const tasks = await prisma.task.findMany({
                where: { workspaceId },
                include: { assignedTo: { select: { firstname: true, lastName: true, email: true } } },
                orderBy: { createdAt: "desc" },
            });

            const rows = tasks.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignedTo: t.assignedTo ? `${t.assignedTo.firstname} ${t.assignedTo.lastName}` : "",
                dueDate: t.dueDate ? t.dueDate.toISOString() : "",
                labels: t.labels.join("; "),
                createdAt: t.createdAt.toISOString(),
            }));

            if (format === "json") return res.status(200).json({ tasks: rows });

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="tasks-${workspaceId}.csv"`);
            return res.status(200).send(toCsv(rows));
        }

        if (type === "workspaces") {
            const memberships = await prisma.workspaceMember.findMany({
                where: { userId: authUser.id },
                include: { workspace: { include: { _count: { select: { tasks: true, members: true } } } } },
            });

            const plans = await Promise.all(memberships.map((m) => getWorkspacePlan(m.workspaceId)));
            if (!plans.some((p) => p.canUseExport)) {
                return res.status(403).json({ message: "Exporting requires a plan upgrade.", upgradeRequired: true, feature: "canUseExport" });
            }

            const rows = memberships.map((m) => ({
                workspaceId: m.workspace.id,
                name: m.workspace.name,
                type: m.workspace.type,
                yourRole: m.role,
                totalTasks: m.workspace._count.tasks,
                memberCount: m.workspace._count.members,
            }));

            if (format === "json") return res.status(200).json({ workspaces: rows });

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="workspaces.csv"`);
            return res.status(200).send(toCsv(rows));
        }

        return res.status(400).json({ message: "type must be 'tasks' or 'workspaces'" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
