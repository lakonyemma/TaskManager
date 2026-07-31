import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// ── Users ──────────────────────────────────────────────────────────────

export const listUsers = async (req: AuthedRequest, res: Response) => {
    try {
        const search = ((req.query.search as string) || "").trim();
        const status = req.query.status as string | undefined; // "active" | "suspended"
        const limit = Math.min(Number(req.query.limit) || 25, 100);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const where: Record<string, unknown> = {};
        if (search) {
            where.OR = [
                { firstname: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];
        }
        if (status === "active") where.isActive = true;
        if (status === "suspended") where.isActive = false;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true, firstname: true, lastName: true, email: true, avatarUrl: true,
                    isActive: true, isSuperAdmin: true, emailVerified: true, createdAt: true,
                    _count: { select: { workspaceMembers: true, assignedTasks: true } },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.user.count({ where }),
        ]);

        return res.status(200).json({ users, total, page, limit });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const suspendUser = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user!;
        const id = String(req.params.id);
        if (id === authUser.id) return res.status(400).json({ message: "You cannot suspend your own account" });

        const target = await prisma.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ message: "User not found" });
        if (target.isSuperAdmin) return res.status(400).json({ message: "Cannot suspend another super admin" });

        await prisma.user.update({ where: { id }, data: { isActive: false } });
        // Cut off every existing session immediately — isActive alone only
        // gets enforced at login/refresh time otherwise.
        await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

        await createActivityLog({
            userId: authUser.id, action: `Suspended user ${target.firstname} ${target.lastName}`,
            entityType: "account_changed", ipAddress: req.ip || null,
        });

        return res.status(200).json({ message: "User suspended" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const reactivateUser = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user!;
        const id = String(req.params.id);

        const target = await prisma.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ message: "User not found" });

        await prisma.user.update({ where: { id }, data: { isActive: true } });

        await createActivityLog({
            userId: authUser.id, action: `Reactivated user ${target.firstname} ${target.lastName}`,
            entityType: "account_changed", ipAddress: req.ip || null,
        });

        return res.status(200).json({ message: "User reactivated" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// ── Workspaces ─────────────────────────────────────────────────────────

export const listWorkspaces = async (req: AuthedRequest, res: Response) => {
    try {
        const search = ((req.query.search as string) || "").trim();
        const limit = Math.min(Number(req.query.limit) || 25, 100);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const where: Record<string, unknown> = search ? { name: { contains: search, mode: "insensitive" } } : {};

        const [workspaces, total] = await Promise.all([
            prisma.workspace.findMany({
                where,
                select: {
                    id: true, name: true, type: true, isActive: true, createdAt: true,
                    _count: { select: { members: true, tasks: true } },
                },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: (page - 1) * limit,
            }),
            prisma.workspace.count({ where }),
        ]);

        return res.status(200).json({ workspaces, total, page, limit });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const disableWorkspace = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user!;
        const id = String(req.params.id);
        const workspace = await prisma.workspace.findUnique({ where: { id } });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });

        await prisma.workspace.update({ where: { id }, data: { isActive: false } });

        await createActivityLog({
            userId: authUser.id, action: `Disabled workspace ${workspace.name}`,
            entityType: "project_updated", workspaceId: id, ipAddress: req.ip || null,
        });

        return res.status(200).json({ message: "Workspace disabled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const enableWorkspace = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user!;
        const id = String(req.params.id);
        const workspace = await prisma.workspace.findUnique({ where: { id } });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });

        await prisma.workspace.update({ where: { id }, data: { isActive: true } });

        await createActivityLog({
            userId: authUser.id, action: `Re-enabled workspace ${workspace.name}`,
            entityType: "project_updated", workspaceId: id, ipAddress: req.ip || null,
        });

        return res.status(200).json({ message: "Workspace enabled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// ── Analytics / platform health ───────────────────────────────────────

export const getAnalytics = async (_req: AuthedRequest, res: Response) => {
    try {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
            totalUsers, activeUsers, suspendedUsers, newUsers30d,
            totalWorkspaces, activeWorkspaces,
            totalTasks, completedTasks, overdueTasks,
            tasksByStatus,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isActive: true } }),
            prisma.user.count({ where: { isActive: false } }),
            prisma.user.count({ where: { createdAt: { gte: since30d } } }),
            prisma.workspace.count(),
            prisma.workspace.count({ where: { isActive: true } }),
            prisma.task.count(),
            prisma.task.count({ where: { status: "COMPLETED" } }),
            prisma.task.count({ where: { dueDate: { lt: new Date() }, status: { not: "COMPLETED" } } }),
            prisma.task.groupBy({ by: ["status"], _count: true }),
        ]);

        const signupTrend: { date: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
            const next = new Date(day); next.setDate(day.getDate() + 1);
            const count = await prisma.user.count({ where: { createdAt: { gte: day, lt: next } } });
            signupTrend.push({ date: day.toISOString().slice(0, 10), count });
        }

        return res.status(200).json({
            users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, newLast30Days: newUsers30d, signupTrend },
            workspaces: { total: totalWorkspaces, active: activeWorkspaces, disabled: totalWorkspaces - activeWorkspaces },
            tasks: {
                total: totalTasks, completed: completedTasks, overdue: overdueTasks,
                completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                byStatus: tasksByStatus.map((s) => ({ status: s.status, count: s._count })),
            },
            activeLast7Days: await prisma.session.groupBy({ by: ["userId"], where: { lastUsedAt: { gte: since7d } } }).then((r) => r.length),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

const startedAt = Date.now();

export const getHealth = async (_req: AuthedRequest, res: Response) => {
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbLatencyMs = Date.now() - dbStart;

        const [pendingReminders, failedLoginsLastHour] = await Promise.all([
            prisma.reminderSchedule.count({ where: { status: "PENDING" } }),
            prisma.activityLog.count({ where: { entityType: "login_failed", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
        ]);

        return res.status(200).json({
            status: "ok",
            uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
            dbLatencyMs,
            memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            nodeVersion: process.version,
            pendingReminders,
            failedLoginsLastHour,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: "error", message: "Health check failed" });
    }
};

// ── Announcements ──────────────────────────────────────────────────────

export const createAnnouncement = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user!;
        const { title, message } = req.body as { title?: string; message?: string };
        if (!title?.trim() || !message?.trim()) return res.status(400).json({ message: "Title and message are required" });

        const userIds = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });

        await prisma.notification.createMany({
            data: userIds.map((u) => ({ userId: u.id, type: "SYSTEM_ANNOUNCEMENT" as const, message: `${title.trim()}: ${message.trim()}` })),
        });

        const announcement = await prisma.platformAnnouncement.create({
            data: { title: title.trim(), message: message.trim(), sentById: authUser.id, recipients: userIds.length },
        });

        await createActivityLog({ userId: authUser.id, action: `Sent platform announcement "${title.trim()}"`, entityType: "account_changed", ipAddress: req.ip || null });

        return res.status(201).json({ announcement });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listAnnouncements = async (_req: AuthedRequest, res: Response) => {
    try {
        const announcements = await prisma.platformAnnouncement.findMany({
            include: { sentBy: { select: { firstname: true, lastName: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        return res.status(200).json({ announcements });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// ── Platform-wide audit log ────────────────────────────────────────────

export const listAllAuditLogs = async (req: AuthedRequest, res: Response) => {
    try {
        const entityType = req.query.entityType as string | undefined;
        const userId = req.query.userId as string | undefined;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);

        const where: Record<string, unknown> = {};
        if (entityType) where.entityType = entityType;
        if (userId) where.userId = userId;

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: {
                    user: { select: { id: true, firstname: true, lastName: true, email: true } },
                    workspace: { select: { id: true, name: true } },
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
