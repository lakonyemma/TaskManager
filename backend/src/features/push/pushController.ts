import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from "../../utils/push.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

export const getPublicKey = async (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
    }
    return res.status(200).json({ publicKey: getVapidPublicKey(), configured: isPushConfigured() });
};

export const subscribe = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { endpoint, keys, userAgent } = req.body as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
            userAgent?: string;
        };

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ message: "A valid push subscription (endpoint, keys.p256dh, keys.auth) is required" });
        }

        const subscription = await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { userId: authUser.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent || null, lastUsedAt: new Date() },
            create: { userId: authUser.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent || null },
        });

        // Make sure the user has a preferences row so the settings page has
        // something to read immediately after subscribing for the first time.
        await prisma.notificationPreference.upsert({
            where: { userId: authUser.id },
            update: {},
            create: { userId: authUser.id },
        });

        return res.status(201).json({ subscription: { id: subscription.id, endpoint: subscription.endpoint } });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const unsubscribe = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { endpoint } = req.body as { endpoint?: string };
        if (!endpoint) {
            return res.status(400).json({ message: "endpoint is required" });
        }

        const subscription = await prisma.pushSubscription.findUnique({ where: { endpoint } });
        // Deleting an endpoint that isn't ours, or is already gone, is a no-op
        // from the client's perspective — both leave it in the desired state.
        if (subscription && subscription.userId === authUser.id) {
            await prisma.pushSubscription.delete({ where: { endpoint } });
        }

        return res.status(200).json({ message: "Unsubscribed" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const sendTestPush = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        if (!isPushConfigured()) {
            return res.status(503).json({ message: "Push notifications are not configured on this server" });
        }

        const result = await sendPushToUser(authUser.id, {
            title: "Taskly",
            body: "Push notifications are working — you'll be reminded before tasks are due.",
            tag: "taskly-test",
            sound: true,
            vibrate: true,
            actions: [{ action: "view", title: "Open Taskly" }],
        });

        if (result.attempted === 0) {
            return res.status(404).json({ message: "No active push subscriptions found for your account. Enable push notifications first." });
        }
        if (result.sent === 0) {
            return res.status(502).json({ message: "Push notification delivery failed for all of your subscribed devices. Check the server logs for details." });
        }

        return res.status(200).json({ message: "Test notification sent", ...result });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
