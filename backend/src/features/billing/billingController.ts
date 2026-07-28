import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/plan.js";
import { cancelSubscription as cancelSubscriptionService } from "./subscriptionService.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

export const listPlans = async (_req: Request, res: Response) => {
    try {
        const plans = await prisma.plan.findMany({ orderBy: { priceMonthlyCents: "asc" } });
        return res.status(200).json({ plans });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const getSubscription = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const subscription = await prisma.subscription.findUnique({
            where: { workspaceId },
            include: { plan: true },
        });

        // Billing management (payment history) is an Owner/Admin concern —
        // everyone else just sees the current plan via the workspace list.
        const canSeeBilling = ["OWNER", "ADMIN"].includes(membership.role);
        const payments = canSeeBilling && subscription
            ? await prisma.payment.findMany({ where: { subscriptionId: subscription.id }, orderBy: { createdAt: "desc" } })
            : [];

        return res.status(200).json({ subscription, payments, canManageBilling: canSeeBilling });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const cancelSubscription = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || membership.role !== "OWNER") {
            return res.status(403).json({ message: "Only the workspace owner can manage billing" });
        }

        const subscription = await cancelSubscriptionService(workspaceId, authUser.id);
        return res.status(200).json({ subscription, message: "Subscription will end at the current period's close." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
