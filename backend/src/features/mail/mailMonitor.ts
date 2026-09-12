import prisma from "../../lib/prisma.js";
import { sendPushToUser } from "../../utils/push.js";
import { classifyIncomingMail, waitingReplyConfidence } from "./mailClassifier.js";
import {
    fetchGmailProfile,
    getGmailMessage,
    getGmailThread,
    getUnreadGmailCount,
    headerValue,
    listGmailMessages,
    messageReceivedAt,
} from "./gmailService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const INBOX_QUERY = "in:inbox newer_than:14d -category:promotions -category:social -in:spam -in:trash";
const SENT_QUERY = "in:sent newer_than:30d -in:trash";

const isFromSelf = (from: string, email: string) => from.toLowerCase().includes(email.toLowerCase());
const cleanCounterparty = (value: string) => value.replace(/<[^>]+>/g, "").replace(/[\"']/g, "").trim().slice(0, 240);

const upsertIncomingAction = async (userId: string, connectionId: string, messageId: string) => {
    const message = await getGmailMessage(connectionId, messageId, userId);
    const subject = headerValue(message, "Subject") || "(No subject)";
    const sender = headerValue(message, "From") || "Unknown sender";
    const receivedAt = messageReceivedAt(message);
    const classification = classifyIncomingMail(subject, message.snippet || "", receivedAt);
    if (!classification.actionable || !classification.kind) return { created: false };

    const key = { gmailConnectionId_gmailMessageId: { gmailConnectionId: connectionId, gmailMessageId: message.id } };
    const existing = await prisma.mailActionItem.findUnique({ where: key, select: { id: true } });
    if (existing) {
        await prisma.mailActionItem.update({
            where: key,
            data: {
                threadId: message.threadId,
                counterparty: cleanCounterparty(sender),
                subject,
                snippet: message.snippet || "",
                receivedAt,
                unread: message.labelIds?.includes("UNREAD") ?? false,
                kind: classification.kind,
                confidence: classification.confidence,
                detectedDueAt: classification.detectedDueAt,
            },
        });
        return { created: false };
    }

    await prisma.mailActionItem.create({
        data: {
            userId,
            gmailConnectionId: connectionId,
            gmailMessageId: message.id,
            threadId: message.threadId,
            counterparty: cleanCounterparty(sender),
            subject,
            snippet: message.snippet || "",
            receivedAt,
            unread: message.labelIds?.includes("UNREAD") ?? false,
            kind: classification.kind,
            confidence: classification.confidence,
            detectedDueAt: classification.detectedDueAt,
        },
    });
    return { created: true };
};

const syncWaitingReplies = async (userId: string, connectionId: string, email: string, followUpDays: number) => {
    const sent = await listGmailMessages(connectionId, SENT_QUERY, 25, userId);
    const threadIds = [...new Set((sent.messages || []).map((item) => item.threadId))];
    let created = 0;

    for (const threadId of threadIds) {
        const thread = await getGmailThread(connectionId, threadId, userId);
        const messages = [...(thread.messages || [])].sort((a, b) => messageReceivedAt(a).getTime() - messageReceivedAt(b).getTime());
        const latest = messages[messages.length - 1];
        if (!latest) continue;

        const waitingKey = `waiting:${threadId}`;
        const existing = await prisma.mailActionItem.findUnique({
            where: { gmailConnectionId_gmailMessageId: { gmailConnectionId: connectionId, gmailMessageId: waitingKey } },
        });

        const from = headerValue(latest, "From");
        const latestWasMine = isFromSelf(from, email) || latest.labelIds?.includes("SENT");
        if (!latestWasMine) {
            if (existing?.status === "OPEN") {
                await prisma.mailActionItem.update({ where: { id: existing.id }, data: { status: "DONE" } });
            }
            continue;
        }

        const ageDays = Math.floor((Date.now() - messageReceivedAt(latest).getTime()) / DAY_MS);
        if (ageDays < followUpDays) continue;

        const subject = headerValue(latest, "Subject") || "Follow up on email";
        const recipient = cleanCounterparty(headerValue(latest, "To") || "Recipient");
        if (existing) {
            await prisma.mailActionItem.update({
                where: { id: existing.id },
                data: {
                    counterparty: recipient,
                    subject,
                    snippet: latest.snippet || "",
                    receivedAt: messageReceivedAt(latest),
                    confidence: waitingReplyConfidence(ageDays),
                },
            });
            continue;
        }

        await prisma.mailActionItem.create({
            data: {
                userId,
                gmailConnectionId: connectionId,
                gmailMessageId: waitingKey,
                threadId,
                counterparty: recipient,
                subject,
                snippet: latest.snippet || "",
                receivedAt: messageReceivedAt(latest),
                unread: false,
                kind: "WAITING_REPLY",
                confidence: waitingReplyConfidence(ageDays),
            },
        });
        created += 1;
    }
    return created;
};

const localDateKey = (date: Date, timezone: string) => {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
};

const localHour = (date: Date, timezone: string) => {
    try {
        return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(date));
    } catch {
        return date.getUTCHours();
    }
};

const dispatchMailBriefIfDue = async (connectionId: string) => {
    const connection = await prisma.gmailConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.digestEnabled) return;
    const now = new Date();
    if (localHour(now, connection.timezone) < connection.digestHour) return;
    if (connection.lastDigestAt && localDateKey(connection.lastDigestAt, connection.timezone) === localDateKey(now, connection.timezone)) return;

    const grouped = await prisma.mailActionItem.groupBy({
        by: ["kind"],
        where: { gmailConnectionId: connection.id, status: "OPEN" },
        _count: { _all: true },
    });
    const counts = Object.fromEntries(grouped.map((row) => [row.kind, row._count._all])) as Record<string, number>;
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    await prisma.gmailConnection.update({ where: { id: connection.id }, data: { lastDigestAt: now } });
    if (!total) return;

    const parts = [
        counts.ACTION_REQUIRED ? `${counts.ACTION_REQUIRED} action${counts.ACTION_REQUIRED === 1 ? "" : "s"}` : "",
        counts.DEADLINE ? `${counts.DEADLINE} deadline${counts.DEADLINE === 1 ? "" : "s"}` : "",
        counts.WAITING_REPLY ? `${counts.WAITING_REPLY} follow-up${counts.WAITING_REPLY === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    await sendPushToUser(connection.userId, {
        title: `Taskly Mail · ${connection.email}`,
        body: parts.join(" · "),
        tag: `mail-brief-${connection.id}-${localDateKey(now, connection.timezone)}`,
        url: "/app/mail",
        sound: true,
        vibrate: true,
    });
};

export const syncGmailConnection = async (connectionId: string, notify = true) => {
    const connection = await prisma.gmailConnection.findUnique({ where: { id: connectionId } });
    if (!connection) throw new Error("Gmail account is not connected.");

    const inbox = await listGmailMessages(connection.id, INBOX_QUERY, 30, connection.userId);
    let newItems = 0;
    for (const item of inbox.messages || []) {
        const result = await upsertIncomingAction(connection.userId, connection.id, item.id);
        if (result.created) newItems += 1;
    }

    newItems += await syncWaitingReplies(connection.userId, connection.id, connection.email, Math.max(1, connection.followUpDays));
    const [profile, unreadCount] = await Promise.all([
        fetchGmailProfile(connection.id, connection.userId),
        getUnreadGmailCount(connection.id, connection.userId),
    ]);
    await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
            lastSyncedAt: new Date(),
            historyId: profile.historyId || connection.historyId,
            unreadCount,
        },
    });

    if (notify && newItems > 0) {
        await sendPushToUser(connection.userId, {
            title: `Taskly Mail · ${connection.email}`,
            body: `${newItems} new email item${newItems === 1 ? " needs" : "s need"} your attention.`,
            tag: `mail-attention-${connection.id}-${Date.now()}`,
            url: "/app/mail",
            sound: true,
            vibrate: true,
        });
    }
    await dispatchMailBriefIfDue(connection.id);
    return { connectionId: connection.id, email: connection.email, newItems, scanned: inbox.messages?.length || 0, unreadCount };
};

export const syncGmailForUser = async (userId: string, notify = true) => {
    const connections = await prisma.gmailConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (!connections.length) throw new Error("Gmail is not connected.");
    const results = [];
    for (const connection of connections) results.push(await syncGmailConnection(connection.id, notify));
    return {
        accounts: results,
        newItems: results.reduce((sum, result) => sum + result.newItems, 0),
        scanned: results.reduce((sum, result) => sum + result.scanned, 0),
        unreadTotal: results.reduce((sum, result) => sum + result.unreadCount, 0),
    };
};

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export const runMailMonitorTick = async () => {
    if (running) return { synced: 0 };
    running = true;
    let synced = 0;
    try {
        const connections = await prisma.gmailConnection.findMany({
            where: { monitoringEnabled: true },
            select: { id: true, email: true },
            take: 250,
        });
        for (const connection of connections) {
            try {
                await syncGmailConnection(connection.id, true);
                synced += 1;
            } catch (error) {
                console.error(`[mail] Sync failed for ${connection.email}:`, error);
            }
        }
    } finally {
        running = false;
    }
    return { synced };
};

export const startMailMonitor = () => {
    if (timer) return;
    const intervalMs = Number(process.env.GMAIL_MONITOR_POLL_INTERVAL_MS) || 10 * 60 * 1000;
    timer = setInterval(() => {
        runMailMonitorTick().catch((error) => console.error("[mail] Monitor tick failed:", error));
    }, intervalMs);
    setTimeout(() => {
        runMailMonitorTick().catch((error) => console.error("[mail] Initial monitor tick failed:", error));
    }, 8000);
    console.log(`[mail] Gmail monitor started (polling every ${intervalMs}ms)`);
};
