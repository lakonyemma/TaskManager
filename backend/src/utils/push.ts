import webpush from "web-push";
import prisma from "../lib/prisma.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@example.com";

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
    console.warn("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — web push notifications are disabled (in-app notifications still work).");
}

export const isPushConfigured = () => configured;
export const getVapidPublicKey = () => VAPID_PUBLIC_KEY;

export type PushNotificationAction = { action: string; title: string };

export type PushPayload = {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    taskId?: string;
    reminderId?: string;
    notificationId?: string;
    sound?: boolean;
    vibrate?: boolean;
    actions?: PushNotificationAction[];
    data?: Record<string, unknown>;
};

// Fans a payload out to every device the user has subscribed on. Expired or
// unregistered subscriptions (410 Gone / 404 Not Found, per the Push API
// spec) are pruned so we stop paying the cost of a doomed request next time.
export const sendPushToUser = async (userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number; attempted: number }> => {
    if (!configured) return { sent: 0, pruned: 0, attempted: 0 };

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return { sent: 0, pruned: 0, attempted: 0 };

    let sent = 0;
    let pruned = 0;
    const body = JSON.stringify(payload);

    await Promise.all(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    body,
                );
                sent += 1;
                await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
            } catch (error) {
                const statusCode = (error as { statusCode?: number }).statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                    pruned += 1;
                } else {
                    console.error(`[push] Failed to deliver push to subscription ${sub.id}:`, error);
                }
            }
        }),
    );

    return { sent, pruned, attempted: subscriptions.length };
};
