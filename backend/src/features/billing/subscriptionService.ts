import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import type { BillingCycle, PaymentProvider, PaymentStatus, PlanKey } from "../../../generated/prisma/client.js";

const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

export const periodEndFor = (billingCycle: BillingCycle, from: Date = new Date()): Date =>
    new Date(from.getTime() + (billingCycle === "ANNUAL" ? MS_PER_YEAR : MS_PER_MONTH));

export const priceForPlan = (plan: { priceMonthlyCents: number; priceAnnualCents: number }, billingCycle: BillingCycle) =>
    billingCycle === "ANNUAL" ? plan.priceAnnualCents : plan.priceMonthlyCents;

// Activates (or renews) a workspace's subscription once a provider confirms
// payment. Idempotent per (workspaceId, periodStart) is not enforced here —
// callers should only invoke this once per confirmed payment event; the
// Payment row's unique providerPaymentId is what actually protects against
// duplicate webhook delivery (see recordPayment).
export const activateSubscription = async (params: {
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
    provider: PaymentProvider;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
}) => {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: params.planKey } });
    const now = new Date();

    const subscription = await prisma.subscription.upsert({
        where: { workspaceId: params.workspaceId },
        create: {
            workspaceId: params.workspaceId,
            planId: plan.id,
            status: "ACTIVE",
            billingCycle: params.billingCycle,
            provider: params.provider,
            providerCustomerId: params.providerCustomerId,
            providerSubscriptionId: params.providerSubscriptionId,
            currentPeriodStart: now,
            currentPeriodEnd: periodEndFor(params.billingCycle, now),
        },
        update: {
            planId: plan.id,
            status: "ACTIVE",
            billingCycle: params.billingCycle,
            provider: params.provider,
            providerCustomerId: params.providerCustomerId,
            providerSubscriptionId: params.providerSubscriptionId,
            currentPeriodStart: now,
            currentPeriodEnd: periodEndFor(params.billingCycle, now),
            cancelAtPeriodEnd: false,
            canceledAt: null,
        },
        include: { plan: true },
    });

    await createActivityLog({
        userId: params.userId,
        action: `Subscription activated on the ${plan.name} plan (${params.billingCycle.toLowerCase()}) via ${params.provider}`,
        workspaceId: params.workspaceId,
    });

    return subscription;
};

// Records a payment, tolerating webhook redelivery: providerPaymentId is
// unique, so a retried webhook just no-ops instead of double-billing the
// activity log / creating a duplicate row.
export const recordPayment = async (params: {
    subscriptionId: string;
    userId: string;
    provider: PaymentProvider;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
    billingCycle: BillingCycle;
    status: PaymentStatus;
}) => {
    const existing = await prisma.payment.findUnique({ where: { providerPaymentId: params.providerPaymentId } });
    if (existing) return existing;

    return prisma.payment.create({ data: params });
};

export const cancelSubscription = async (workspaceId: string, userId: string) => {
    const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!subscription) throw new Error("Subscription not found");

    const updated = await prisma.subscription.update({
        where: { workspaceId },
        data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
        include: { plan: true },
    });

    await createActivityLog({
        userId,
        action: `Cancelled the ${updated.plan.name} subscription (access continues until the current period ends)`,
        workspaceId,
    });

    return updated;
};
