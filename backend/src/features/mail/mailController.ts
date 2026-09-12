import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { syncTaskReminders } from "../reminders/reminderService.js";
import { buildGoogleAuthorizationUrl, connectGmailUser, gmailConfiguration, gmailWebUrl } from "./gmailService.js";
import { createMailOAuthState, verifyMailOAuthState } from "./mailOAuthState.js";
import { syncGmailConnection, syncGmailForUser } from "./mailMonitor.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const frontendBase = () => (process.env.TASKLY_FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, "");

const requireUser = (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: "Authentication required" });
        return null;
    }
    return req.user;
};

const accountSummary = (connection: {
    id: string;
    email: string;
    monitoringEnabled: boolean;
    digestEnabled: boolean;
    digestHour: number;
    followUpDays: number;
    timezone: string;
    lastSyncedAt: Date | null;
    lastDigestAt?: Date | null;
    unreadCount: number;
}) => ({
    id: connection.id,
    email: connection.email,
    monitoringEnabled: connection.monitoringEnabled,
    digestEnabled: connection.digestEnabled,
    digestHour: connection.digestHour,
    followUpDays: connection.followUpDays,
    timezone: connection.timezone,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() || null,
    lastDigestAt: connection.lastDigestAt?.toISOString() || null,
    unreadCount: connection.unreadCount,
});

export const getMailStatus = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const [connections, grouped] = await Promise.all([
        prisma.gmailConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
        prisma.mailActionItem.groupBy({ by: ["kind"], where: { userId: user.id, status: "OPEN" }, _count: { _all: true } }),
    ]);
    const counts = { ACTION_REQUIRED: 0, DEADLINE: 0, WAITING_REPLY: 0 } as Record<string, number>;
    for (const row of grouped) counts[row.kind] = row._count._all;
    const summaries = connections.map(accountSummary);
    return res.json({
        configured: gmailConfiguration(),
        connected: summaries.length > 0,
        connections: summaries,
        accounts: summaries,
        connection: summaries[0] || null,
        unreadTotal: summaries.reduce((sum, connection) => sum + connection.unreadCount, 0),
        counts: { ...counts, total: counts.ACTION_REQUIRED + counts.DEADLINE + counts.WAITING_REPLY },
    });
};

export const startGoogleConnect = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const config = gmailConfiguration();
    if (!config.ready) return res.status(503).json({ message: "Gmail connection is not configured on the Taskly server yet.", configured: config });
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/app/mail";
    const state = createMailOAuthState(user.id, returnTo);
    return res.json({ authorizationUrl: buildGoogleAuthorizationUrl(state) });
};

export const googleCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    let returnTo = "/app/mail";
    try {
        if (!code || !state) throw new Error("Google did not return an authorization code.");
        const payload = verifyMailOAuthState(state);
        returnTo = payload.returnTo;
        const connection = await connectGmailUser(payload.userId, code);
        try { await syncGmailConnection(connection.id, false); } catch (error) { console.warn("[mail] Initial sync deferred:", error); }
        const params = new URLSearchParams({ gmail: "connected", account: connection.email });
        return res.redirect(`${frontendBase()}${returnTo}${returnTo.includes("?") ? "&" : "?"}${params.toString()}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google authorization failed";
        const params = new URLSearchParams({ gmail: "error", message: message.slice(0, 180) });
        return res.redirect(`${frontendBase()}${returnTo}?${params.toString()}`);
    }
};

export const disconnectGmailConnection = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const rawId = req.params.connectionId || req.params.accountId;
    const connectionId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!connectionId) return res.status(400).json({ message: "connectionId is required" });
    const connection = await prisma.gmailConnection.findFirst({ where: { id: connectionId, userId: user.id } });
    if (!connection) return res.status(404).json({ message: "Gmail account not found" });
    await prisma.gmailConnection.delete({ where: { id: connection.id } });
    await createActivityLog({ userId: user.id, action: `Disconnected Gmail from Taskly: ${connection.email}`, entityType: "gmail_disconnected", entityId: connection.id });
    return res.json({ disconnected: true, email: connection.email, purgedMailMetadata: true });
};

export const disconnectGmail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    await prisma.$transaction([
        prisma.mailActionItem.deleteMany({ where: { userId: user.id } }),
        prisma.gmailConnection.deleteMany({ where: { userId: user.id } }),
    ]);
    await createActivityLog({ userId: user.id, action: "Disconnected all Gmail accounts from Taskly", entityType: "gmail_disconnected", entityId: user.id });
    return res.json({ disconnected: true, allAccounts: true, purgedMailMetadata: true });
};

export const syncMailNow = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    try {
        if (accountId) {
            const owned = await prisma.gmailConnection.findFirst({ where: { id: accountId, userId: user.id } });
            if (!owned) return res.status(404).json({ message: "Gmail account not found" });
            return res.json(await syncGmailConnection(owned.id, false));
        }
        return res.json(await syncGmailForUser(user.id, false));
    } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to sync Gmail" });
    }
};

export const syncMailConnectionNow = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const rawId = req.params.connectionId || req.params.accountId;
    const connectionId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!connectionId) return res.status(400).json({ message: "connectionId is required" });
    const owned = await prisma.gmailConnection.findFirst({ where: { id: connectionId, userId: user.id } });
    if (!owned) return res.status(404).json({ message: "Gmail account not found" });
    try {
        return res.json(await syncGmailConnection(owned.id, false));
    } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to sync Gmail" });
    }
};

export const listMailActions = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const requested = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "OPEN";
    const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : "";
    const allowed = ["OPEN", "TASK_CREATED", "WAITING_CREATED", "DONE", "DISMISSED"];
    const where: Record<string, unknown> = { userId: user.id };
    if (requested !== "ALL") where.status = allowed.includes(requested) ? requested : "OPEN";
    if (connectionId) where.gmailConnectionId = connectionId;
    const items = await prisma.mailActionItem.findMany({
        where: where as any,
        orderBy: [{ detectedDueAt: "asc" }, { receivedAt: "desc" }],
        take: 150,
        select: {
            id: true, threadId: true, counterparty: true, subject: true, snippet: true, receivedAt: true, unread: true,
            kind: true, confidence: true, detectedDueAt: true, status: true, taskId: true, gmailConnectionId: true,
            gmailConnection: { select: { email: true } },
        },
    });
    return res.json({
        items: items.map((item) => ({
            id: item.id,
            threadId: item.threadId,
            counterparty: item.counterparty,
            subject: item.subject,
            snippet: item.snippet,
            receivedAt: item.receivedAt.toISOString(),
            unread: item.unread,
            kind: item.kind,
            confidence: item.confidence,
            detectedDueAt: item.detectedDueAt?.toISOString() || null,
            status: item.status,
            taskId: item.taskId,
            gmailConnectionId: item.gmailConnectionId,
            accountEmail: item.gmailConnection.email,
            account: { id: item.gmailConnectionId, email: item.gmailConnection.email },
            gmailUrl: gmailWebUrl(item.gmailConnection.email, item.threadId),
        })),
    });
};

const resolveConnectionForSettings = async (userId: string, connectionId?: string) => {
    if (connectionId) return prisma.gmailConnection.findFirst({ where: { id: connectionId, userId } });
    const connections = await prisma.gmailConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take: 2 });
    return connections.length === 1 ? connections[0] : null;
};

export const updateMailSettings = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const routeRaw = req.params.connectionId || req.params.accountId;
    const routeId = Array.isArray(routeRaw) ? routeRaw[0] : routeRaw;
    const bodyId = typeof req.body.connectionId === "string"
        ? req.body.connectionId
        : typeof req.body.accountId === "string" ? req.body.accountId : undefined;
    const existing = await resolveConnectionForSettings(user.id, routeId || bodyId);
    if (!existing) return res.status(404).json({ message: "Choose a connected Gmail account first" });

    const data: Record<string, unknown> = {};
    if (typeof req.body.monitoringEnabled === "boolean") data.monitoringEnabled = req.body.monitoringEnabled;
    if (typeof req.body.digestEnabled === "boolean") data.digestEnabled = req.body.digestEnabled;
    if (Number.isInteger(req.body.digestHour) && req.body.digestHour >= 0 && req.body.digestHour <= 23) data.digestHour = req.body.digestHour;
    if (Number.isInteger(req.body.followUpDays) && req.body.followUpDays >= 1 && req.body.followUpDays <= 30) data.followUpDays = req.body.followUpDays;
    if (typeof req.body.timezone === "string" && req.body.timezone.length <= 80) {
        try { new Intl.DateTimeFormat("en-US", { timeZone: req.body.timezone }).format(new Date()); data.timezone = req.body.timezone; } catch { /* ignore invalid timezone */ }
    }
    const connection = await prisma.gmailConnection.update({ where: { id: existing.id }, data });
    return res.json(accountSummary(connection));
};

export const setMailActionStatus = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const status = typeof req.body.status === "string" ? req.body.status.toUpperCase() : "";
    if (!id || !["OPEN", "DONE", "DISMISSED"].includes(status)) return res.status(400).json({ message: "Invalid mail action status" });
    const existing = await prisma.mailActionItem.findFirst({ where: { id, userId: user.id } });
    if (!existing) return res.status(404).json({ message: "Mail item not found" });
    const item = await prisma.mailActionItem.update({ where: { id }, data: { status: status as any } });
    return res.json({ id: item.id, status: item.status });
};

const ensureWorkspaceAccess = async (userId: string, workspaceId: string, res: Response) => {
    const membership = await getMembership(userId, workspaceId);
    if (!membership) { res.status(403).json({ message: "You are not a member of this workspace" }); return null; }
    if (membership.role === "GUEST") { res.status(403).json({ message: "Guests cannot create tasks from email" }); return null; }
    return membership;
};

const ensureTag = async (workspaceId: string, name: string, color: string) => {
    const existing = await prisma.tag.findFirst({ where: { workspaceId, name } });
    return existing || prisma.tag.create({ data: { workspaceId, name, color } });
};

export const createTaskFromMail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const workspaceId = req.body.workspaceId as string | undefined;
    if (!id || !workspaceId) return res.status(400).json({ message: "workspaceId is required" });
    if (!await ensureWorkspaceAccess(user.id, workspaceId, res)) return;
    const item = await prisma.mailActionItem.findFirst({
        where: { id, userId: user.id },
        include: { gmailConnection: { select: { email: true } } },
    });
    if (!item) return res.status(404).json({ message: "Mail item not found" });

    const [emailTag, todoColumn] = await Promise.all([
        ensureTag(workspaceId, "Email", "#2563eb"),
        prisma.boardColumn.findFirst({ where: { workspaceId, mapsToStatus: "TODO" }, orderBy: { order: "asc" } }),
    ]);
    const dueDate = item.detectedDueAt || (req.body.dueDate ? new Date(req.body.dueDate) : null);
    const task = await prisma.task.create({
        data: {
            workspaceId,
            title: item.subject.slice(0, 240),
            description: [
                `Email account: ${item.gmailConnection.email}`,
                `Email from: ${item.counterparty || "Unknown sender"}`,
                item.snippet,
                `Open Gmail: ${gmailWebUrl(item.gmailConnection.email, item.threadId)}`,
            ].filter(Boolean).join("\n\n"),
            priority: item.kind === "DEADLINE" ? "HIGH" : "MEDIUM",
            status: "TODO",
            columnId: todoColumn?.id || null,
            assignedToId: user.id,
            dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
            estimatedMinutes: 30,
            tags: { connect: [{ id: emailTag.id }] },
        },
    });
    if (task.dueDate && task.assignedToId) await syncTaskReminders(task);
    await prisma.mailActionItem.update({ where: { id: item.id }, data: { status: "TASK_CREATED", taskId: task.id } });
    await createActivityLog({ userId: user.id, workspaceId, taskId: task.id, action: `Created task from email: ${item.subject}`, entityType: "mail_to_task", entityId: item.id });
    return res.status(201).json({ task: { id: task.id, title: task.title, dueDate: task.dueDate?.toISOString() || null } });
};

export const createWaitingFromMail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const workspaceId = req.body.workspaceId as string | undefined;
    if (!id || !workspaceId) return res.status(400).json({ message: "workspaceId is required" });
    if (!await ensureWorkspaceAccess(user.id, workspaceId, res)) return;
    const item = await prisma.mailActionItem.findFirst({
        where: { id, userId: user.id },
        include: { gmailConnection: { select: { email: true, followUpDays: true } } },
    });
    if (!item) return res.status(404).json({ message: "Mail item not found" });
    const [waitingTag, emailTag, todoColumn] = await Promise.all([
        ensureTag(workspaceId, "Waiting", "#0ea5e9"),
        ensureTag(workspaceId, "Email", "#2563eb"),
        prisma.boardColumn.findFirst({ where: { workspaceId, mapsToStatus: "TODO" }, orderBy: { order: "asc" } }),
    ]);
    const followUpAt = req.body.followUpAt
        ? new Date(req.body.followUpAt)
        : new Date(Date.now() + Math.max(1, item.gmailConnection.followUpDays) * 24 * 60 * 60 * 1000);
    const task = await prisma.task.create({
        data: {
            workspaceId,
            title: `Follow up: ${item.subject}`.slice(0, 240),
            description: [
                `Email account: ${item.gmailConnection.email}`,
                `Waiting for: ${item.counterparty || "Email reply"}`,
                item.snippet,
                `Open Gmail: ${gmailWebUrl(item.gmailConnection.email, item.threadId)}`,
            ].filter(Boolean).join("\n\n"),
            priority: item.kind === "DEADLINE" ? "HIGH" : "MEDIUM",
            status: "TODO",
            columnId: todoColumn?.id || null,
            assignedToId: user.id,
            dueDate: Number.isNaN(followUpAt.getTime()) ? null : followUpAt,
            tags: { connect: [{ id: waitingTag.id }, { id: emailTag.id }] },
        },
    });
    if (task.dueDate && task.assignedToId) await syncTaskReminders(task);
    await prisma.mailActionItem.update({ where: { id: item.id }, data: { status: "WAITING_CREATED", taskId: task.id } });
    await createActivityLog({ userId: user.id, workspaceId, taskId: task.id, action: `Started email follow-up: ${item.subject}`, entityType: "mail_waiting", entityId: item.id });
    return res.status(201).json({ task: { id: task.id, title: task.title, followUpAt: task.dueDate?.toISOString() || null } });
};
