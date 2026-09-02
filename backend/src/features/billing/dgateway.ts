import crypto from "node:crypto";

const API_URL = () => process.env.DGATEWAY_API_URL || "https://dgatewayapi.desispay.com";

const apiKey = () => {
  const value = process.env.DGATEWAY_API_KEY;
  if (!value) throw new Error("DGATEWAY_API_KEY is not configured");
  return value;
};

const request = async (path: string, body?: unknown, method = "POST") => {
  const response = await fetch(`${API_URL()}${path}`, {
    method,
    headers: { "X-Api-Key": apiKey(), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || data?.message || "DGateway request failed");
  }
  return data;
};

export const normalizeUgandaPhone = (phone: string) => {
  const value = phone.trim().replace(/[\s()-]/g, "");
  if (value.startsWith("+256")) return value.slice(1);
  if (value.startsWith("256")) return value;
  if (value.startsWith("0")) return `256${value.slice(1)}`;
  throw new Error("Use a valid Uganda phone number, for example 0771234567");
};

export const collectPayment = async (params: {
  amount: number;
  currency: string;
  provider: "iotec" | "relworx" | "stripe";
  phone?: string | null;
  description: string;
  metadata: Record<string, unknown>;
}) => request("/v1/payments/collect", {
  amount: params.amount,
  currency: params.currency,
  provider: params.provider,
  ...(params.phone ? { phone_number: params.phone } : {}),
  description: params.description,
  metadata: params.metadata,
});

export const verifyTransaction = async (reference: string) => {
  const result = await request("/v1/webhooks/verify", { reference });
  return result?.data;
};

export const createSubscription = async (params: {
  planId: number;
  email: string;
  name: string;
  phone?: string | null;
  provider: "iotec" | "relworx" | "stripe";
  userId: string;
}) => request("/v1/subscriptions", {
  plan_id: params.planId,
  customer_email: params.email,
  customer_name: params.name,
  ...(params.phone ? { customer_phone: params.phone } : {}),
  provider: params.provider,
  start_now: false,
  metadata: { product: "taskly_premium", userId: params.userId },
});

export const cancelProviderSubscription = async (subscriptionId: string) =>
  request(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`);

export const isValidWebhook = (rawBody: string, signature?: string) => {
  const secret = process.env.DGATEWAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
};
