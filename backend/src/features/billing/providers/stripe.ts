import Stripe from "stripe";
import type { BillingCycle, PlanKey } from "../../../../generated/prisma/client.js";

const secretKey = process.env.STRIPE_SECRET_KEY;
export const stripe = secretKey ? new Stripe(secretKey) : null;

if (!stripe) {
    console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe checkout/webhook routes will 503 until it is.");
}

// Requires a Stripe Price object to already exist for each (plan, cycle)
// pair — created once in the Stripe dashboard/CLI, referenced here by id so
// no product/price management logic has to live in this app.
const PRICE_ENV_VAR: Record<Exclude<PlanKey, "FREE">, Record<BillingCycle, string>> = {
    PREMIUM: { MONTHLY: "STRIPE_PRICE_PREMIUM_MONTHLY", ANNUAL: "STRIPE_PRICE_PREMIUM_ANNUAL" },
    TEAM: { MONTHLY: "STRIPE_PRICE_TEAM_MONTHLY", ANNUAL: "STRIPE_PRICE_TEAM_ANNUAL" },
};

export const resolvePriceId = (planKey: Exclude<PlanKey, "FREE">, billingCycle: BillingCycle): string => {
    const envVar = PRICE_ENV_VAR[planKey][billingCycle];
    const priceId = process.env[envVar];
    if (!priceId) throw new Error(`Missing env var ${envVar} — create the corresponding Price in Stripe and set it.`);
    return priceId;
};

export const createCheckoutSession = async (params: {
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
}): Promise<string> => {
    if (!stripe) throw new Error("Stripe is not configured");

    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: resolvePriceId(params.planKey, params.billingCycle), quantity: 1 }],
        customer_email: params.customerEmail,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
            workspaceId: params.workspaceId,
            userId: params.userId,
            planKey: params.planKey,
            billingCycle: params.billingCycle,
        },
        subscription_data: {
            metadata: {
                workspaceId: params.workspaceId,
                userId: params.userId,
                planKey: params.planKey,
                billingCycle: params.billingCycle,
            },
        },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return session.url;
};

export const constructWebhookEvent = (rawBody: Buffer, signature: string): Stripe.Event => {
    if (!stripe) throw new Error("Stripe is not configured");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};
