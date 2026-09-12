import prisma from "../../lib/prisma.js";
import { sendPushToUser } from "../../utils/push.js";
import { classifyIncomingMail, waitingReplyConfidence } from "./mailClassifier.js";
import {
    fetchGmailProfile,
    getGmailAccounts,
    getGmailMessage,
    getGmailPrimaryEmail,
    getGmailThread,
    getUnreadGmailCount,
    gmailStorageKey,
    headerValue,
    listGmailMessages,
    messageReceivedAt,
    parseGmailStorageKey,
    updateGmailAccount,
    type GmailAccountSummary,
} from "./gmailService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const INBOX_QUERY = "in:inbox newer_than:14d -category:promotions -category:social -in:spam -in:trash";
const SENT_QUERY = "in:sent newer_than:30d -in:trash";

const isFromSelf = (from: string, email: string) => from.toLowerCase().includes(email.toLowerCase());
const cleanCounterparty = (value: string) => value.replace(/<[^>]+>/g, "").replace(/[\"']/g, "").trim().slice(0, 240);
const lower = (value: string) => value.trim().toLowerCase();

export const mailItemBelongsToAccount = (gmailMessageId: string, accountEmail: string, primaryEmail: string | null): boolean => {
    const parsed = parseGmailStorageKey(gmailMessageId);
    if (parsed) return parsed.email === lower(accountEmail);
    return Boolean(primaryEmail && lower(primaryEmail) === lower(accountEmail));
};

const findExistingAction = async (userId: string, account: GmailAccountSummary, rawMessageId: string, primaryEmail: string | null) => {
    const storageId = gmailStorageKey(account.email, rawMessageId);
    const composite = await prisma.mailActionItem.findUnique({
        where: { userId_gmailMessageId: { userId, gmailMessageId: storageId } },
    });
    if (composite) return composite;
    if (primaryEmail && lower(primaryEmail) === lower(account.email)) {
        return prisma.mailActionItem.findUnique({
            where: { userId_gmailMessageId: { userId, gmailMessageId: rawMessageId } },
        });
    }
    return null;
};

const upsertIncomingAction = async (userId: string, account: GmailAccountSummary, messageId: string, primaryEmail: string | null) => {
    const message = await getGmailMessage(userId, account.id, messageId);
    const subject = headerValue(message, "Subject") || "(No subject)";
    const sender = headerValue(message, "From") || "Unknown sender";
    const receivedAt = messageReceivedAt(message);
    const classification = classifyIncomingMail(subject, message.snippet || "", receivedAt);
    if (!classification.actionable || !classification.kind) return { created: false };

    const existing = await findExistingAction(userId, account, message.id, primaryEmail);
    if (existing) {
        await prisma.mailActionItem.update({
            where: { id: existing.id },
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
            gmailMessageId: gmailStorageKey(account.email, message.id),
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

const syncWaitingReplies = async (userId: string, account: GmailAccountSummary, primaryEmail: string | null) => {
    const sent = await listGmailMessages(userId, account.id, SENT_QUERY, 25);
    const threadIds = [...new Set((sent.messages || []).map((item) => item.threadId))];
    let created = 0;

    for (const threadId of threadIds) {
        const thread = await getGmailThread(userId, account.id, threadId);
        const messages = [...(thread.messages || [])].sort((a, b) => messageReceivedAt(a).getTime() - messageReceivedAt(b).getTime());
        const latest = messages[messages.length - 1];
        if (!latest) continue;

        const rawWaitingKey = `waiting:${threadId}`;
        const existing = await findExistingAction(userId, account, rawWaitingKey, primaryEmail);
        const from = headerValue(latest, "From");
        const latestWasMine = isFromSelf(from, account.email) || latest.labelIds?.includes("SENT");
        if (!latestWasMine) {
            if (existing?.status === "OPEN") await prisma.mailActionItem.update({ where: { id: existing.id }, data: { status: "DONE" } });
            continue;
        }

        const ageDays = Math.floor((Date.now() - messageReceivedAt(latest).getTime()) / DAY_MS);
        if (ageDays < Math.max(1, account.followUpDays)) continue;

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
                gmailMessageId: gmailStorageKey(account.email, rawWaitingKey),
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

const dispatchMailBriefIfDue = async (userId: string, account: GmailAccountSummary, primaryEmail: string | null) => {
    if (!account.digestEnabled) return;
    const now = new Date();
    if (localHour(now, account.timezone) < account.digestHour) return;
    if (account.lastDigestAt && localDateKey(new Date(account.lastDigestAt), account.timezone) === localDateKey(now, account.timezone)) return;

    const openItems = await prisma.mailActionItem.findMany({
        where: { userId, status: "OPEN" },
        select: { gmailMessageId: true, kind: true },
    });
    const relevant = openItems.filter((item) => mailItemBelongsToAccount(item.gmailMessageId, account.email, primaryEmail));
    const counts = relevant.reduce<Record<string, number>>((acc, item) => {
        acc[item.kind] = (acc[item.kind] || 0) + 1;
        return acc;
    }, {});
    await updateGmailAccount(userId, account.id, { lastDigestAt: now.toISOString() });
    if (!relevant.length) return;

    const parts = [
        counts.ACTION_REQUIRED ? `${counts.ACTION_REQUIRED} action${counts.ACTION_REQUIRED === 1 ? "" : "s"}` : "",
        counts.DEADLINE ? `${counts.DEADLINE} deadline${counts.DEADLINE === 1 ? "" : "s"}` : "",
        counts.WAITING_REPLY ? `${counts.WAITING_REPLY} follow-up${counts.WAITING_REPLY === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    await sendPushToUser(userId, {
        title: `Taskly Mail · ${account.email}`,
        body: parts.join(" · "),
        tag: `mail-brief-${account.id}-${localDateKey(now, account.timezone)}`,
        url: "/app/mail",
        sound: true,
        vibrate: true,
    });
};

export const syncGmailAccount = async (userId: string, accountId: string, notify = true) => {
    const accounts = await getGmailAccounts(userId);
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (!account) throw new Error("Connected Gmail account was not found.");
    const primaryEmail = await getGmailPrimaryEmail(userId);

    const inbox = await listGmailMessages(userId, account.id, INBOX_QUERY, 30);
    let newItems = 0;
    for (const item of inbox.messages || []) {
        const result = await upsertIncomingAction(userId, account, item.id, primaryEmail);
        if (result.created) newItems += 1;
    }

    const waitingCreated = await syncWaitingReplies(userId, account, primaryEmail);
    newItems += waitingCreated;
    const [profile, unreadCount] = await Promise.all([
        fetchGmailProfile(userId, account.id),
        getUnreadGmailCount(userId, account.id),
    ]);
    const now = new Date();
    await updateGmailAccount(userId, account.id, {
        lastSyncedAt: now.toISOString(),
        historyId: profile.historyId || account.historyId,
        unreadCount,
    });

    if (notify && newItems > 0) {
        await sendPushToUser(userId, {
            title: `Taskly Mail · ${account.email}`,
            body: `${newItems} new email item${newItems === 1 ? " needs" : "s need"} your attention.`,
            tag: `mail-attention-${account.id}-${Date.now()}`,
            url: "/app/mail",
            sound: true,
            vibrate: true,
        });
    }
    const refreshed = (await getGmailAccounts(userId)).find((candidate) => candidate.id === account.id) || account;
    await dispatchMailBriefIfDue(userId, refreshed, primaryEmail);
    return { accountId: account.id, email: account.email, newItems, scanned: inbox.messages?.length || 0, unreadCount };
};

export const syncGmailForUser = async (userId: string, notify = true) => {
    const accounts = await getGmailAccounts(userId);
    if (!accounts.length) throw new Error("Gmail is not connected.");
    const results = [];
    for (const account of accounts) results.push(await syncGmailAccount(userId, account.id, notify));
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
            select: { userId: true },
            take: 100,
        });
        for (const connection of connections) {
            try {
                const accounts = await getGmailAccounts(connection.userId);
                for (const account of accounts.filter((candidate) => candidate.monitoringEnabled)) {
                    try {
                        await syncGmailAccount(connection.userId, account.id, true);
                        synced += 1;
                    } catch (error) {
                        console.error(`[mail] Sync failed for ${account.email}:`, error);
                    }
                }
            } catch (error) {
                console.error(`[mail] Account loading failed for user ${connection.userId}:`, error);
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
