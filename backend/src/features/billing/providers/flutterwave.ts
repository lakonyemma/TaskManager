import crypto from "node:crypto";
import type { BillingCycle, PlanKey } from "../../../../generated/prisma/client.js";

const API_BASE = "https://api.flutterwave.com/v3";
const SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

if (!SECRET_KEY) {
    console.warn("[flutterwave] FLUTTERWAVE_SECRET_KEY is not set — Flutterwave routes will 503 until it is.");
}

// Same "charge once per billing cycle" approach as PayPal (see paypal.ts) —
// Flutterwave's true recurring-subscription product requires payment-plan
// setup in their dashboard, which is out of scope for a $0, keys-only setup.
export const initiatePayment = async (params: {
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
    amountCents: number;
    currency: string;
    customerEmail: string;
    redirectUrl: string;
}): Promise<{ txRef: string; paymentLink: string }> => {
    if (!SECRET_KEY) throw new Error("Flutterwave is not configured");

    const txRef = `taskly-${crypto.randomUUID()}`;
    const response = await fetch(`${API_BASE}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            tx_ref: txRef,
            amount: (params.amountCents / 100).toFixed(2),
            currency: params.currency,
            redirect_url: params.redirectUrl,
            customer: { email: params.customerEmail },
            customizations: { title: "Taskly", description: `${params.planKey} plan (${params.billingCycle.toLowerCase()})` },
            meta: {
                workspaceId: params.workspaceId,
                userId: params.userId,
                planKey: params.planKey,
                billingCycle: params.billingCycle,
            },
        }),
    });
    if (!response.ok) throw new Error(`Flutterwave payment initiation failed: ${response.status}`);
    const data = await response.json();
    if (data.status !== "success") throw new Error(`Flutterwave: ${data.message || "initiation failed"}`);
    return { txRef, paymentLink: data.data.link };
};

export type FlutterwaveVerifyResult = {
    status: string;
    amountCents: number;
    currency: string;
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
    transactionId: string;
};

// Never trust a webhook payload's amount/status directly — always re-verify
// server-side against Flutterwave's own record of the transaction.
export const verifyTransaction = async (transactionId: string): Promise<FlutterwaveVerifyResult> => {
    if (!SECRET_KEY) throw new Error("Flutterwave is not configured");
    const response = await fetch(`${API_BASE}/transactions/${transactionId}/verify`, {
        headers: { Authorization: `Bearer ${SECRET_KEY}` },
    });
    if (!response.ok) throw new Error(`Flutterwave verification failed: ${response.status}`);
    const data = await response.json();
    const tx = data.data;
    const meta = tx.meta || {};

    return {
        status: tx.status,
        amountCents: Math.round(tx.amount * 100),
        currency: tx.currency,
        workspaceId: meta.workspaceId,
        userId: meta.userId,
        planKey: meta.planKey,
        billingCycle: meta.billingCycle,
        transactionId: String(tx.id),
    };
};

// Flutterwave webhooks are authenticated with a shared secret compared
// against the `verif-hash` header — no signature crypto involved.
export const isValidWebhookSignature = (headerHash: string | undefined): boolean => {
    const expected = process.env.FLUTTERWAVE_SECRET_HASH;
    if (!expected || !headerHash) return false;
    const a = Buffer.from(headerHash);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};
