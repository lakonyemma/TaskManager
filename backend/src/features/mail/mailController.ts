import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { syncTaskReminders } from "../reminders/reminderService.js";
import { buildGoogleAuthorizationUrl, connectGmailUser, gmailConfiguration } from "./gmailService.js";
import { createMailOAuthState, verifyMailOAuthState } from "./mailOAuthState.js";
import { syncGmailForUser } from "./mailMonitor.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const frontendBase = () => (process.env.TASKLY_FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
const gmailWebUrl = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;

const requireUser = (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: "Authentication required" });
        return null;
    }
    return req.user;
};

export const getMailStatus = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const [connection, grouped] = await Promise.all([
        prisma.gmailConnection.findUnique({ where: { userId: user.id } }),
        prisma.mailActionItem.groupBy({ by: ["kind"], where: { userId: user.id, status: "OPEN" }, _count: { _all: true } }),
    ]);
    const counts = { ACTION_REQUIRED: 0, DEADLINE: 0, WAITING_REPLY: 0 } as Record<string, number>;
    for (const row of grouped) counts[row.kind] = row._count._all;
    return res.json({
        configured: gmailConfiguration(),
        connected: Boolean(connection),
        connection: connection ? {
            email: connection.email,
            monitoringEnabled: connection.monitoringEnabled,
            digestEnabled: connection.digestEnabled,
            digestHour: connection.digestHour,
            followUpDays: connection.followUpDays,
            timezone: connection.timezone,
            lastSyncedAt: connection.lastSyncedAt?.toISOString() || null,
        } : null,
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
        await connectGmailUser(payload.userId, code);
        try { await syncGmailForUser(payload.userId, false); } catch (error) { console.warn("[mail] Initial sync deferred:", error); }
        return res.redirect(`${frontendBase()}${returnTo}${returnTo.includes("?") ? "&" : "?"}gmail=connected`);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google authorization failed";
        const params = new URLSearchParams({ gmail: "error", message: message.slice(0, 180) });
        return res.redirect(`${frontendBase()}${returnTo}?${params.toString()}`);
    }
};

export const disconnectGmail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    await prisma.$transaction([
        prisma.mailActionItem.deleteMany({ where: { userId: user.id } }),
        prisma.gmailConnection.deleteMany({ where: { userId: user.id } }),
    ]);
    await createActivityLog({ userId: user.id, action: "Disconnected Gmail from Taskly", entityType: "gmail_disconnected", entityId: user.id });
    return res.json({ disconnected: true, purgedMailMetadata: true });
};

export const syncMailNow = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    try {
        const result = await syncGmailForUser(user.id, false);
        return res.json(result);
    } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to sync Gmail" });
    }
};

export const listMailActions = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const requested = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "OPEN";
    const allowed = ["OPEN", "TASK_CREATED", "WAITING_CREATED", "DONE", "DISMISSED"];
    const where = requested === "ALL" ? { userId: user.id } : { userId: user.id, status: allowed.includes(requested) ? requested as any : "OPEN" as const };
    const items = await prisma.mailActionItem.findMany({
        where,
        orderBy: [{ detectedDueAt: "asc" }, { receivedAt: "desc" }],
        take: 100,
        select: {
            id: true, threadId: true, counterparty: true, subject: true, snippet: true, receivedAt: true, unread: true,
            kind: true, confidence: true, detectedDueAt: true, status: true, taskId: true,
        },
    });
    return res.json({
        items: items.map((item) => ({
            ...item,
            receivedAt: item.receivedAt.toISOString(),
            detectedDueAt: item.detectedDueAt?.toISOString() || null,
            gmailUrl: gmailWebUrl(item.threadId),
        })),
    });
};

export const updateMailSettings = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const existing = await prisma.gmailConnection.findUnique({ where: { userId: user.id } });
    if (!existing) return res.status(404).json({ message: "Connect Gmail first" });

    const data: Record<string, unknown> = {};
    if (typeof req.body.monitoringEnabled === "boolean") data.monitoringEnabled = req.body.monitoringEnabled;
    if (typeof req.body.digestEnabled === "boolean") data.digestEnabled = req.body.digestEnabled;
    if (Number.isInteger(req.body.digestHour) && req.body.digestHour >= 0 && req.body.digestHour <= 23) data.digestHour = req.body.digestHour;
    if (Number.isInteger(req.body.followUpDays) && req.body.followUpDays >= 1 && req.body.followUpDays <= 30) data.followUpDays = req.body.followUpDays;
    if (typeof req.body.timezone === "string" && req.body.timezone.length <= 80) {
        try { new Intl.DateTimeFormat("en-US", { timeZone: req.body.timezone }).format(new Date()); data.timezone = req.body.timezone; } catch { /* ignore invalid timezone */ }
    }
    const connection = await prisma.gmailConnection.update({ where: { userId: user.id }, data });
    return res.json({
        monitoringEnabled: connection.monitoringEnabled,
        digestEnabled: connection.digestEnabled,
        digestHour: connection.digestHour,
        followUpDays: connection.followUpDays,
        timezone: connection.timezone,
    });
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
    const item = await prisma.mailActionItem.findFirst({ where: { id, userId: user.id } });
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
            description: [`Email from: ${item.counterparty || "Unknown sender"}`, item.snippet, `Open Gmail: ${gmailWebUrl(item.threadId)}`].filter(Boolean).join("\n\n"),
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
    const [item, connection] = await Promise.all([
        prisma.mailActionItem.findFirst({ where: { id, userId: user.id } }),
        prisma.gmailConnection.findUnique({ where: { userId: user.id } }),
    ]);
    if (!item) return res.status(404).json({ message: "Mail item not found" });
    const [waitingTag, emailTag, todoColumn] = await Promise.all([
        ensureTag(workspaceId, "Waiting", "#0ea5e9"),
        ensureTag(workspaceId, "Email", "#2563eb"),
        prisma.boardColumn.findFirst({ where: { workspaceId, mapsToStatus: "TODO" }, orderBy: { order: "asc" } }),
    ]);
    const followUpAt = req.body.followUpAt ? new Date(req.body.followUpAt) : new Date(Date.now() + Math.max(1, connection?.followUpDays || 3) * 24 * 60 * 60 * 1000);
    const task = await prisma.task.create({
        data: {
            workspaceId,
            title: `Follow up: ${item.subject}`.slice(0, 240),
            description: [`Waiting for: ${item.counterparty || "Email reply"}`, item.snippet, `Open Gmail: ${gmailWebUrl(item.threadId)}`].filter(Boolean).join("\n\n"),
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
