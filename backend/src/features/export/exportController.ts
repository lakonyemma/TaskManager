import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";
import { buildWorkbook, type Sheet } from "./xlsxWriter.js";
import { buildReportPdf, type ReportData } from "./pdfWriter.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };
type ExportFormat = "csv" | "json" | "xlsx" | "pdf";

const toCsv = (rows: Record<string, unknown>[]): string => {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
        let str = value === null || value === undefined ? "" : String(value);
        // Excel/Sheets treat a leading =, +, -, @ (or tab/CR) as the start of
        // a formula when a CSV is opened — task titles, labels, and names
        // here are attacker-controllable (any workspace member), so a
        // literal-looking prefix must be forced before quoting. This isn't
        // needed for the xlsx export: exceljs writes these as explicit
        // String-typed cells, which Excel never evaluates as a formula.
        if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers.join(",")];
    for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
    return lines.join("\n");
};

const parseFormat = (raw: unknown): ExportFormat => {
    const f = String(raw ?? "csv");
    return f === "json" || f === "xlsx" || f === "pdf" ? f : "csv";
};

const sendRows = async (res: Response, filenameBase: string, rows: Record<string, unknown>[], format: ExportFormat, jsonKey: string) => {
    if (format === "json") return res.status(200).json({ [jsonKey]: rows });

    if (format === "xlsx") {
        const columns = rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ header: key, key })) : [];
        const buffer = await buildWorkbook([{ name: jsonKey.slice(0, 31), columns, rows }]);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
        return res.status(200).send(buffer);
    }

    // PDF isn't a great fit for a raw row dump — callers wanting a
    // presentable document should use type=report instead. Still supported
    // here as a plain tabular fallback so format=pdf never 400s.
    if (format === "pdf") {
        const buffer = await buildReportPdf({
            title: filenameBase.replace(/[-_]/g, " "),
            range: { from: null, to: null },
            summary: { total: rows.length, completed: 0, inProgress: 0, overdue: 0, completionRate: 0 },
            byAssignee: [],
            byWorkspace: [],
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
        return res.status(200).send(buffer);
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
    return res.status(200).send(toCsv(rows));
};

// Exports either the task list for a workspace, a summary of every
// workspace the user belongs to, or an aggregated productivity report
// (user/team/workspace/task-completion — the "advanced reporting" export).
export const exportData = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const type = (req.query.type as string) || "tasks";
        const format = parseFormat(req.query.format);
        const workspaceId = req.query.workspaceId as string | undefined;

        if (type === "tasks") {
            if (!workspaceId) return res.status(400).json({ message: "workspaceId is required" });

            const membership = await getMembership(authUser.id, workspaceId);
            if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

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
                completedAt: t.completedAt ? t.completedAt.toISOString() : "",
                labels: t.labels.join("; "),
                createdAt: t.createdAt.toISOString(),
            }));

            return sendRows(res, `tasks-${workspaceId}`, rows, format, "tasks");
        }

        if (type === "workspaces") {
            const memberships = await prisma.workspaceMember.findMany({
                where: { userId: authUser.id },
                include: { workspace: { include: { _count: { select: { tasks: true, members: true } } } } },
            });

            const rows = memberships.map((m) => ({
                workspaceId: m.workspace.id,
                name: m.workspace.name,
                type: m.workspace.type,
                yourRole: m.role,
                totalTasks: m.workspace._count.tasks,
                memberCount: m.workspace._count.members,
            }));

            return sendRows(res, "workspaces", rows, format, "workspaces");
        }

        if (type === "report") {
            const from = req.query.from ? new Date(req.query.from as string) : null;
            const to = req.query.to ? new Date(req.query.to as string) : null;

            let scopeWorkspaceIds: string[];
            if (workspaceId) {
                const membership = await getMembership(authUser.id, workspaceId);
                if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
                scopeWorkspaceIds = [workspaceId];
            } else {
                const memberships = await prisma.workspaceMember.findMany({ where: { userId: authUser.id }, select: { workspaceId: true } });
                scopeWorkspaceIds = memberships.map((m) => m.workspaceId);
            }

            const dateWhere: Record<string, unknown> = {};
            if (from && !Number.isNaN(from.getTime())) dateWhere.gte = from;
            if (to && !Number.isNaN(to.getTime())) dateWhere.lte = to;

            const tasks = await prisma.task.findMany({
                where: {
                    workspaceId: { in: scopeWorkspaceIds },
                    ...(Object.keys(dateWhere).length ? { createdAt: dateWhere } : {}),
                },
                include: {
                    assignedTo: { select: { id: true, firstname: true, lastName: true } },
                    workspace: { select: { id: true, name: true } },
                },
            });

            const total = tasks.length;
            const completed = tasks.filter((t) => t.status === "COMPLETED").length;
            const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
            const overdue = tasks.filter((t) => t.dueDate && t.dueDate < new Date() && t.status !== "COMPLETED").length;

            const byAssigneeMap = new Map<string, { name: string; total: number; completed: number }>();
            const byWorkspaceMap = new Map<string, { name: string; total: number; completed: number }>();
            const byPriorityMap = new Map<string, number>();

            for (const t of tasks) {
                if (t.assignedTo) {
                    const key = t.assignedTo.id;
                    const entry = byAssigneeMap.get(key) ?? { name: `${t.assignedTo.firstname} ${t.assignedTo.lastName}`, total: 0, completed: 0 };
                    entry.total += 1;
                    if (t.status === "COMPLETED") entry.completed += 1;
                    byAssigneeMap.set(key, entry);
                }
                const wsEntry = byWorkspaceMap.get(t.workspaceId) ?? { name: t.workspace.name, total: 0, completed: 0 };
                wsEntry.total += 1;
                if (t.status === "COMPLETED") wsEntry.completed += 1;
                byWorkspaceMap.set(t.workspaceId, wsEntry);

                byPriorityMap.set(t.priority, (byPriorityMap.get(t.priority) || 0) + 1);
            }

            const withRate = <T extends { total: number; completed: number }>(m: Map<string, T>) =>
                Array.from(m.values()).map((v) => ({ ...v, completionRate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0 }));

            const report = {
                generatedAt: new Date().toISOString(),
                range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
                summary: { total, completed, inProgress, overdue, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 },
                byAssignee: withRate(byAssigneeMap),
                byWorkspace: withRate(byWorkspaceMap),
                byPriority: Array.from(byPriorityMap.entries()).map(([priority, count]) => ({ priority, count })),
            };

            if (format === "json") return res.status(200).json(report);

            if (format === "xlsx") {
                const sheets: Sheet[] = [
                    { name: "Summary", columns: [{ header: "Metric", key: "metric" }, { header: "Value", key: "value" }], rows: [
                        { metric: "Total tasks", value: report.summary.total },
                        { metric: "Completed", value: report.summary.completed },
                        { metric: "In progress", value: report.summary.inProgress },
                        { metric: "Overdue", value: report.summary.overdue },
                        { metric: "Completion rate", value: `${report.summary.completionRate}%` },
                    ] },
                    { name: "By Assignee", columns: [{ header: "Name", key: "name" }, { header: "Total", key: "total" }, { header: "Completed", key: "completed" }, { header: "Rate", key: "completionRate", width: 12 }], rows: report.byAssignee },
                    { name: "By Workspace", columns: [{ header: "Workspace", key: "name" }, { header: "Total", key: "total" }, { header: "Completed", key: "completed" }, { header: "Rate", key: "completionRate", width: 12 }], rows: report.byWorkspace },
                    { name: "By Priority", columns: [{ header: "Priority", key: "priority" }, { header: "Count", key: "count" }], rows: report.byPriority },
                ];
                const buffer = await buildWorkbook(sheets);
                res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                res.setHeader("Content-Disposition", `attachment; filename="productivity-report.xlsx"`);
                return res.status(200).send(buffer);
            }

            if (format === "pdf") {
                const pdfData: ReportData = {
                    title: "Productivity Report",
                    range: report.range,
                    summary: report.summary,
                    byAssignee: report.byAssignee,
                    byWorkspace: report.byWorkspace,
                };
                const buffer = await buildReportPdf(pdfData);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader("Content-Disposition", `attachment; filename="productivity-report.pdf"`);
                return res.status(200).send(buffer);
            }

            // CSV: flatten the by-assignee breakdown as the primary table.
            return sendRows(res, "productivity-report", report.byAssignee.map((a) => ({ ...a, completionRate: `${a.completionRate}%` })), "csv", "report");
        }

        return res.status(400).json({ message: "type must be 'tasks', 'workspaces', or 'report'" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
