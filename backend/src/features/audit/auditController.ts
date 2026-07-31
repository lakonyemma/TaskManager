import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const escapeCsv = (value: unknown) => {
    let str = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Same CSV-formula-injection guard used in the export feature — audit
    // fields (action text, previous/new values) are partly user-controlled.
    if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Personal security events (login/logout/password/account changes) are
// visible only to the user they belong to; workspace-scoped entries
// (task/project/member/role changes) are additionally visible to any
// OWNER/ADMIN of that workspace, for oversight — mirrors how the
// notification/activity features already scope workspace data.
const buildAuditWhere = async (authUser: { id: string }, filters: { workspaceId?: string; entityType?: string; userId?: string; from?: Date; to?: Date }) => {
    const adminMemberships = await prisma.workspaceMember.findMany({
        where: { userId: authUser.id, role: { in: ["OWNER", "ADMIN"] } },
        select: { workspaceId: true },
    });
    const adminWorkspaceIds = adminMemberships.map((m) => m.workspaceId);

    const where: Record<string, unknown> = {
        OR: [{ userId: authUser.id }, ...(adminWorkspaceIds.length ? [{ workspaceId: { in: adminWorkspaceIds } }] : [])],
    };
    if (filters.workspaceId) {
        if (!adminWorkspaceIds.includes(filters.workspaceId) && filters.workspaceId !== undefined) {
            // Non-admins filtering by a specific workspace still only see their own entries in it.
            where.AND = [{ workspaceId: filters.workspaceId }, { userId: authUser.id }];
            delete where.OR;
        } else {
            where.workspaceId = filters.workspaceId;
            delete where.OR;
        }
    }
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
        where.createdAt = {
            ...(filters.from && !Number.isNaN(filters.from.getTime()) ? { gte: filters.from } : {}),
            ...(filters.to && !Number.isNaN(filters.to.getTime()) ? { lte: filters.to } : {}),
        };
    }
    return where;
};

export const listAuditLogs = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = req.query.workspaceId as string | undefined;
        const entityType = req.query.entityType as string | undefined;
        const userId = req.query.userId as string | undefined;
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const where = await buildAuditWhere(authUser, { workspaceId, entityType, userId, from, to });

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, firstname: true, lastName: true, email: true } },
                    workspace: { select: { id: true, name: true } },
                    task: { select: { id: true, title: true } },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.activityLog.count({ where }),
        ]);

        return res.status(200).json({ logs, total, page, limit });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const exportAuditLogs = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = req.query.workspaceId as string | undefined;
        const entityType = req.query.entityType as string | undefined;
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;
        const format = req.query.format === "json" ? "json" : "csv";

        const where = await buildAuditWhere(authUser, { workspaceId, entityType, from, to });

        const logs = await prisma.activityLog.findMany({
            where,
            include: {
                user: { select: { firstname: true, lastName: true, email: true } },
                workspace: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5000,
        });

        const rows = logs.map((l) => ({
            timestamp: l.createdAt.toISOString(),
            user: `${l.user.firstname} ${l.user.lastName} (${l.user.email})`,
            action: l.action,
            resource: l.workspace?.name || l.taskId || "",
            entityType: l.entityType || "",
            previousValue: l.previousValue ?? "",
            newValue: l.newValue ?? "",
            ipAddress: l.ipAddress || "",
        }));

        if (format === "json") return res.status(200).json({ logs: rows });

        const headers = rows.length > 0 ? Object.keys(rows[0]) : ["timestamp", "user", "action", "resource", "entityType", "previousValue", "newValue", "ipAddress"];
        const csvLines = [headers.join(","), ...rows.map((row) => headers.map((h) => escapeCsv(row[h as keyof typeof row])).join(","))];

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="audit-log.csv"`);
        return res.status(200).send(csvLines.join("\n"));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
