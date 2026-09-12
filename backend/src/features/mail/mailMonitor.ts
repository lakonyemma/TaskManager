import prisma from "../../lib/prisma.js";
import { sendPushToUser } from "../../utils/push.js";
import { classifyIncomingMail, waitingReplyConfidence } from "./mailClassifier.js";
import {
    fetchGmailProfile,
    getGmailMessage,
    getGmailThread,
    headerValue,
    listGmailMessages,
    messageReceivedAt,
} from "./gmailService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const INBOX_QUERY = "in:inbox newer_than:14d -category:promotions -category:social -in:spam -in:trash";
const SENT_QUERY = "in:sent newer_than:30d -in:trash";

const isFromSelf = (from: string, email: string) => from.toLowerCase().includes(email.toLowerCase());
const cleanCounterparty = (value: string) => value.replace(/<[^>]+>/g, "").replace(/[\"']/g, "").trim().slice(0, 240);

const upsertIncomingAction = async (userId: string, messageId: string) => {
    const message = await getGmailMessage(userId, messageId);
    const subject = headerValue(message, "Subject") || "(No subject)";
    const sender = headerValue(message, "From") || "Unknown sender";
    const receivedAt = messageReceivedAt(message);
    const classification = classifyIncomingMail(subject, message.snippet || "", receivedAt);
    if (!classification.actionable || !classification.kind) return { created: false };

    const key = { userId_gmailMessageId: { userId, gmailMessageId: message.id } };
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

const syncWaitingReplies = async (userId: string, email: string, followUpDays: number) => {
    const sent = await listGmailMessages(userId, SENT_QUERY, 25);
    const threadIds = [...new Set((sent.messages || []).map((item) => item.threadId))];
    let created = 0;

    for (const threadId of threadIds) {
        const thread = await getGmailThread(userId, threadId);
        const messages = [...(thread.messages || [])].sort(
            (a, b) => messageReceivedAt(a).getTime() - messageReceivedAt(b).getTime(),
        );
        const latest = messages[messages.length - 1];
        if (!latest) continue;

        const waitingKey = `waiting:${threadId}`;
        const existing = await prisma.mailActionItem.findUnique({
            where: { userId_gmailMessageId: { userId, gmailMessageId: waitingKey } },
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

const dispatchMailBriefIfDue = async (userId: string) => {
    const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
    if (!connection?.digestEnabled) return;
    const now = new Date();
    if (localHour(now, connection.timezone) < connection.digestHour) return;
    if (connection.lastDigestAt && localDateKey(connection.lastDigestAt, connection.timezone) === localDateKey(now, connection.timezone)) return;

    const grouped = await prisma.mailActionItem.groupBy({
        by: ["kind"],
        where: { userId, status: "OPEN" },
        _count: { _all: true },
    });
    const counts = Object.fromEntries(grouped.map((row) => [row.kind, row._count._all])) as Record<string, number>;
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    await prisma.gmailConnection.update({ where: { userId }, data: { lastDigestAt: now } });
    if (!total) return;

    const parts = [
        counts.ACTION_REQUIRED ? `${counts.ACTION_REQUIRED} action${counts.ACTION_REQUIRED === 1 ? "" : "s"}` : "",
        counts.DEADLINE ? `${counts.DEADLINE} deadline${counts.DEADLINE === 1 ? "" : "s"}` : "",
        counts.WAITING_REPLY ? `${counts.WAITING_REPLY} follow-up${counts.WAITING_REPLY === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    await sendPushToUser(userId, {
        title: "Taskly Mail Brief",
        body: parts.join(" · "),
        tag: `mail-brief-${localDateKey(now, connection.timezone)}`,
        url: "/app/mail",
        sound: true,
        vibrate: true,
    });
};

export const syncGmailForUser = async (userId: string, notify = true) => {
    const connection = await prisma.gmailConnection.findUnique({ where: { userId } });
    if (!connection) throw new Error("Gmail is not connected.");

    const inbox = await listGmailMessages(userId, INBOX_QUERY, 30);
    let newItems = 0;
    for (const item of inbox.messages || []) {
        const result = await upsertIncomingAction(userId, item.id);
        if (result.created) newItems += 1;
    }

    const waitingCreated = await syncWaitingReplies(userId, connection.email, Math.max(1, connection.followUpDays));
    newItems += waitingCreated;
    const profile = await fetchGmailProfile(userId);
    await prisma.gmailConnection.update({
        where: { userId },
        data: { lastSyncedAt: new Date(), historyId: profile.historyId || connection.historyId },
    });

    if (notify && newItems > 0) {
        await sendPushToUser(userId, {
            title: "Taskly Mail",
            body: `${newItems} new email item${newItems === 1 ? " needs" : "s need"} your attention.`,
            tag: `mail-attention-${Date.now()}`,
            url: "/app/mail",
            sound: true,
            vibrate: true,
        });
    }
    await dispatchMailBriefIfDue(userId);
    return { newItems, scanned: inbox.messages?.length || 0 };
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
            select: { userId: true },
            take: 100,
        });
        for (const connection of connections) {
            try {
                await syncGmailForUser(connection.userId, true);
                synced += 1;
            } catch (error) {
                console.error(`[mail] Sync failed for user ${connection.userId}:`, error);
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
