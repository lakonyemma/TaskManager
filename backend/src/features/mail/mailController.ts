import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership } from "../../utils/membership.js";
import { syncTaskReminders } from "../reminders/reminderService.js";
import {
    buildGoogleAuthorizationUrl,
    connectGmailUser,
    getGmailAccounts,
    getGmailPrimaryEmail,
    gmailConfiguration,
    gmailWebUrl,
    parseGmailStorageKey,
    removeGmailAccount,
    updateGmailAccount,
    type GmailAccountSummary,
} from "./gmailService.js";
import { createMailOAuthState, verifyMailOAuthState } from "./mailOAuthState.js";
import { mailItemBelongsToAccount, syncGmailAccount, syncGmailForUser } from "./mailMonitor.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const frontendBase = () => (process.env.TASKLY_FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
const lower = (value: string) => value.trim().toLowerCase();

const requireUser = (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: "Authentication required" });
        return null;
    }
    return req.user;
};

const resolveItemAccount = (gmailMessageId: string, accounts: GmailAccountSummary[], primaryEmail: string | null) => {
    const parsed = parseGmailStorageKey(gmailMessageId);
    const email = parsed?.email || primaryEmail || accounts[0]?.email || "";
    return accounts.find((account) => lower(account.email) === lower(email)) || accounts[0] || null;
};

export const getMailStatus = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const [accounts, grouped] = await Promise.all([
        getGmailAccounts(user.id),
        prisma.mailActionItem.groupBy({ by: ["kind"], where: { userId: user.id, status: "OPEN" }, _count: { _all: true } }),
    ]);
    const counts = { ACTION_REQUIRED: 0, DEADLINE: 0, WAITING_REPLY: 0 } as Record<string, number>;
    for (const row of grouped) counts[row.kind] = row._count._all;
    const unreadTotal = accounts.reduce((sum, account) => sum + account.unreadCount, 0);
    return res.json({
        configured: gmailConfiguration(),
        connected: accounts.length > 0,
        accounts,
        connection: accounts[0] || null,
        unreadTotal,
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
        const account = await connectGmailUser(payload.userId, code);
        try { await syncGmailAccount(payload.userId, account.id, false); } catch (error) { console.warn(`[mail] Initial sync deferred for ${account.email}:`, error); }
        const params = new URLSearchParams({ gmail: "connected", account: account.email });
        return res.redirect(`${frontendBase()}${returnTo}${returnTo.includes("?") ? "&" : "?"}${params.toString()}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google authorization failed";
        const params = new URLSearchParams({ gmail: "error", message: message.slice(0, 180) });
        return res.redirect(`${frontendBase()}${returnTo}?${params.toString()}`);
    }
};

export const disconnectGmail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
    if (!accountId) {
        await prisma.$transaction([
            prisma.mailActionItem.deleteMany({ where: { userId: user.id } }),
            prisma.gmailConnection.deleteMany({ where: { userId: user.id } }),
        ]);
        await createActivityLog({ userId: user.id, action: "Disconnected all Gmail accounts from Taskly", entityType: "gmail_disconnected", entityId: user.id });
        return res.json({ disconnected: true, purgedMailMetadata: true, remainingAccounts: 0 });
    }

    const [accounts, primaryEmail, items] = await Promise.all([
        getGmailAccounts(user.id),
        getGmailPrimaryEmail(user.id),
        prisma.mailActionItem.findMany({ where: { userId: user.id }, select: { id: true, gmailMessageId: true } }),
    ]);
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (!account) return res.status(404).json({ message: "Connected Gmail account not found" });
    const itemIds = items
        .filter((item) => mailItemBelongsToAccount(item.gmailMessageId, account.email, primaryEmail))
        .map((item) => item.id);
    if (itemIds.length) await prisma.mailActionItem.deleteMany({ where: { id: { in: itemIds } } });
    const result = await removeGmailAccount(user.id, account.id);
    await createActivityLog({ userId: user.id, action: `Disconnected Gmail ${account.email} from Taskly`, entityType: "gmail_disconnected", entityId: account.id });
    return res.json({ disconnected: true, account: account.email, purgedMailMetadata: true, remainingAccounts: result.remaining.length });
};

export const syncMailNow = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    try {
        const result = accountId ? await syncGmailAccount(user.id, accountId, false) : await syncGmailForUser(user.id, false);
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
    const [items, accounts, primaryEmail] = await Promise.all([
        prisma.mailActionItem.findMany({
            where,
            orderBy: [{ detectedDueAt: "asc" }, { receivedAt: "desc" }],
            take: 150,
            select: {
                id: true, gmailMessageId: true, threadId: true, counterparty: true, subject: true, snippet: true, receivedAt: true, unread: true,
                kind: true, confidence: true, detectedDueAt: true, status: true, taskId: true,
            },
        }),
        getGmailAccounts(user.id),
        getGmailPrimaryEmail(user.id),
    ]);
    return res.json({
        items: items.map((item) => {
            const account = resolveItemAccount(item.gmailMessageId, accounts, primaryEmail);
            return {
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
                account: account ? { id: account.id, email: account.email } : null,
                gmailUrl: account ? gmailWebUrl(account.email, item.threadId) : `https://mail.google.com/mail/#all/${encodeURIComponent(item.threadId)}`,
            };
        }),
    });
};

export const updateMailSettings = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const accounts = await getGmailAccounts(user.id);
    if (!accounts.length) return res.status(404).json({ message: "Connect Gmail first" });
    const accountId = typeof req.body.accountId === "string" ? req.body.accountId : accounts[0].id;
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (!account) return res.status(404).json({ message: "Connected Gmail account not found" });

    const data: Partial<GmailAccountSummary> = {};
    if (typeof req.body.monitoringEnabled === "boolean") data.monitoringEnabled = req.body.monitoringEnabled;
    if (typeof req.body.digestEnabled === "boolean") data.digestEnabled = req.body.digestEnabled;
    if (Number.isInteger(req.body.digestHour) && req.body.digestHour >= 0 && req.body.digestHour <= 23) data.digestHour = req.body.digestHour;
    if (Number.isInteger(req.body.followUpDays) && req.body.followUpDays >= 1 && req.body.followUpDays <= 30) data.followUpDays = req.body.followUpDays;
    if (typeof req.body.timezone === "string" && req.body.timezone.length <= 80) {
        try { new Intl.DateTimeFormat("en-US", { timeZone: req.body.timezone }).format(new Date()); data.timezone = req.body.timezone; } catch { /* ignore invalid timezone */ }
    }
    const updated = await updateGmailAccount(user.id, account.id, data);
    return res.json(updated);
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

const getMailItemContext = async (userId: string, id: string) => {
    const [item, accounts, primaryEmail] = await Promise.all([
        prisma.mailActionItem.findFirst({ where: { id, userId } }),
        getGmailAccounts(userId),
        getGmailPrimaryEmail(userId),
    ]);
    if (!item) return { item: null, account: null };
    return { item, account: resolveItemAccount(item.gmailMessageId, accounts, primaryEmail) };
};

export const createTaskFromMail = async (req: AuthedRequest, res: Response) => {
    const user = requireUser(req, res); if (!user) return;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const workspaceId = req.body.workspaceId as string | undefined;
    if (!id || !workspaceId) return res.status(400).json({ message: "workspaceId is required" });
    if (!await ensureWorkspaceAccess(user.id, workspaceId, res)) return;
    const { item, account } = await getMailItemContext(user.id, id);
    if (!item) return res.status(404).json({ message: "Mail item not found" });

    const [emailTag, todoColumn] = await Promise.all([
        ensureTag(workspaceId, "Email", "#2563eb"),
        prisma.boardColumn.findFirst({ where: { workspaceId, mapsToStatus: "TODO" }, orderBy: { order: "asc" } }),
    ]);
    const dueDate = item.detectedDueAt || (req.body.dueDate ? new Date(req.body.dueDate) : null);
    const sourceUrl = account ? gmailWebUrl(account.email, item.threadId) : `https://mail.google.com/mail/#all/${encodeURIComponent(item.threadId)}`;
    const task = await prisma.task.create({
        data: {
            workspaceId,
            title: item.subject.slice(0, 240),
            description: [`Email account: ${account?.email || "Gmail"}`, `Email from: ${item.counterparty || "Unknown sender"}`, item.snippet, `Open Gmail: ${sourceUrl}`].filter(Boolean).join("\n\n"),
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
    const { item, account } = await getMailItemContext(user.id, id);
    if (!item) return res.status(404).json({ message: "Mail item not found" });
    const [waitingTag, emailTag, todoColumn] = await Promise.all([
        ensureTag(workspaceId, "Waiting", "#0ea5e9"),
        ensureTag(workspaceId, "Email", "#2563eb"),
        prisma.boardColumn.findFirst({ where: { workspaceId, mapsToStatus: "TODO" }, orderBy: { order: "asc" } }),
    ]);
    const followUpAt = req.body.followUpAt ? new Date(req.body.followUpAt) : new Date(Date.now() + Math.max(1, account?.followUpDays || 3) * 24 * 60 * 60 * 1000);
    const sourceUrl = account ? gmailWebUrl(account.email, item.threadId) : `https://mail.google.com/mail/#all/${encodeURIComponent(item.threadId)}`;
    const task = await prisma.task.create({
        data: {
            workspaceId,
            title: `Follow up: ${item.subject}`.slice(0, 240),
            description: [`Email account: ${account?.email || "Gmail"}`, `Waiting for: ${item.counterparty || "Email reply"}`, item.snippet, `Open Gmail: ${sourceUrl}`].filter(Boolean).join("\n\n"),
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
