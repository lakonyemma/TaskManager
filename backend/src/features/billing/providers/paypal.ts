import type { BillingCycle, PlanKey } from "../../../../generated/prisma/client.js";

const API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn("[paypal] PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET are not set — PayPal routes will 503 until they are.");
}

// PayPal's recurring Subscriptions API needs a billing plan pre-created per
// (product, price) pair in the PayPal dashboard. To keep this workable with
// no PayPal account setup beyond sandbox app keys, we instead charge a
// single Order per billing cycle (Orders v2 API) and extend
// currentPeriodEnd by one cycle on capture — the app, not PayPal, drives
// renewal. The user re-approves at the next cycle boundary (billing page
// will prompt them), same as Flutterwave below.
const getAccessToken = async (): Promise<string> => {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("PayPal is not configured");
    const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error(`PayPal auth failed: ${response.status}`);
    const data = (await response.json()) as { access_token: string };
    return data.access_token;
};

export const createOrder = async (params: {
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
    amountCents: number;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
}): Promise<{ orderId: string; approveUrl: string }> => {
    const accessToken = await getAccessToken();
    const customId = JSON.stringify({ workspaceId: params.workspaceId, userId: params.userId, planKey: params.planKey, billingCycle: params.billingCycle });

    const response = await fetch(`${API_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    custom_id: customId,
                    amount: { currency_code: params.currency, value: (params.amountCents / 100).toFixed(2) },
                    description: `Taskly ${params.planKey} plan (${params.billingCycle.toLowerCase()})`,
                },
            ],
            application_context: {
                return_url: params.returnUrl,
                cancel_url: params.cancelUrl,
                user_action: "PAY_NOW",
            },
        }),
    });
    if (!response.ok) throw new Error(`PayPal order creation failed: ${response.status}`);
    const order = (await response.json()) as { id: string; links: { rel: string; href: string }[] };
    const approveUrl = order.links.find((l) => l.rel === "approve")?.href;
    if (!approveUrl) throw new Error("PayPal did not return an approval link");
    return { orderId: order.id, approveUrl };
};

export type PayPalCaptureResult = {
    status: string;
    amountCents: number;
    currency: string;
    workspaceId: string;
    userId: string;
    planKey: Exclude<PlanKey, "FREE">;
    billingCycle: BillingCycle;
};

export const captureOrder = async (orderId: string): Promise<PayPalCaptureResult> => {
    const accessToken = await getAccessToken();
    const response = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`PayPal capture failed: ${response.status}`);
    const data = await response.json();
    const purchaseUnit = data.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const meta = JSON.parse(purchaseUnit?.custom_id || "{}");

    return {
        status: capture?.status || data.status,
        amountCents: Math.round(parseFloat(capture?.amount?.value || "0") * 100),
        currency: capture?.amount?.currency_code || "USD",
        workspaceId: meta.workspaceId,
        userId: meta.userId,
        planKey: meta.planKey,
        billingCycle: meta.billingCycle,
    };
};

// PayPal's documented webhook-verification endpoint — avoids needing a
// certificate-parsing library to validate the signature ourselves.
export const verifyWebhookSignature = async (headers: Record<string, string | string[] | undefined>, body: unknown): Promise<boolean> => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return false;
    const accessToken = await getAccessToken();

    const response = await fetch(`${API_BASE}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            auth_algo: headers["paypal-auth-algo"],
            cert_url: headers["paypal-cert-url"],
            transmission_id: headers["paypal-transmission-id"],
            transmission_sig: headers["paypal-transmission-sig"],
            transmission_time: headers["paypal-transmission-time"],
            webhook_id: webhookId,
            webhook_event: body,
        }),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { verification_status: string };
    return result.verification_status === "SUCCESS";
};
