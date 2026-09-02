import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getEntitlements, getSubscription, ensureSubscription, startTrial, activatePaidSubscription, cancelSubscription, markPastDue, enforceExpiredSubscriptions } from "./billingService.js";
import { cancelProviderSubscription, collectPayment, createSubscription, isValidWebhook, normalizeUgandaPhone, verifyTransaction } from "./dgateway.js";

const auth = (req: Request) => (req as Request & { user?: { id: string; email: string } }).user;
const rawBody = (req: Request) => String((req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") || JSON.stringify(req.body || {}));

const providerFor = (paymentMethod: string) => paymentMethod === "card" ? "stripe" : "iotec";
const planIdFor = (currency: string) => Number(currency === "UGX" ? process.env.DGATEWAY_PREMIUM_UGX_PLAN_ID || 0 : process.env.DGATEWAY_PREMIUM_USD_PLAN_ID || 0);

const attachProviderSubscription = async (params: { userId: string; email: string; name: string; phone?: string | null; currency: string; paymentProvider: "iotec" | "relworx" | "stripe" }) => {
  const planId = planIdFor(params.currency);
  if (!planId) return null;
  const result = await createSubscription({ planId, email: params.email, name: params.name, phone: params.phone, provider: params.paymentProvider, userId: params.userId });
  const providerSubscriptionId = result?.data?.id ? String(result.data.id) : null;
  if (providerSubscriptionId) {
    await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "providerSubscriptionId"=$2, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1`, params.userId, providerSubscriptionId);
  }
  return providerSubscriptionId;
};

export const getBilling = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  return res.json({ subscription: await getSubscription(user.id), entitlements: await getEntitlements(user.id) });
};

export const beginTrial = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try { return res.status(201).json({ subscription: await startTrial(user.id) }); }
  catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Trial unavailable" }); }
};

export const beginCheckout = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    const { country = "UG", paymentMethod = "mobile_money", phone } = req.body as { country?: string; paymentMethod?: "mobile_money" | "card"; phone?: string };
    const isCard = paymentMethod === "card";
    const normalizedCountry = country.toUpperCase();
    const currency = isCard ? "USD" : normalizedCountry === "UG" ? "UGX" : "USD";
    if (!isCard && normalizedCountry !== "UG") return res.status(400).json({ message: "Mobile Money checkout is currently available for Uganda only" });
    const configuredAmount = currency === "UGX" ? Number(process.env.TASKLY_PREMIUM_MONTHLY_UGX || 0) : Number(process.env.TASKLY_PREMIUM_MONTHLY_USD || 5);
    if (!Number.isFinite(configuredAmount) || configuredAmount <= 0) return res.status(500).json({ message: "Premium price is not configured" });
    if (!isCard && !phone) return res.status(400).json({ message: "A Uganda mobile money phone number is required" });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { firstname: true, lastName: true, email: true } });
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    await ensureSubscription(user.id);

    const txRef = `TASKLY-PREMIUM-${user.id}-${Date.now()}`;
    const amountMinor = Math.round(configuredAmount * (currency === "USD" ? 100 : 1));
    const provider = providerFor(paymentMethod || "mobile_money");
    await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "provider"='DGATEWAY', "paymentMethod"=$2, "currency"=$3, "amountMinor"=$4, "providerTxRef"=$5, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1`, user.id, paymentMethod, currency, amountMinor, txRef);

    const result = await collectPayment({ amount: configuredAmount, currency, provider, phone: !isCard ? normalizeUgandaPhone(phone!) : null, description: "Taskly Premium monthly subscription", metadata: { product: "taskly_premium", txRef, userId: user.id } });
    const data = result?.data;
    if (!data?.reference) throw new Error("DGateway did not return a payment reference");
    return res.json({ reference: String(data.reference), status: data.status, provider, clientSecret: data.client_secret || null, stripePublishableKey: data.stripe_publishable_key || null, amount: configuredAmount, currency, txRef });
  } catch (error) {
    console.error("[billing checkout]", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to start payment" });
  }
};

export const completeCheckout = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    const reference = String(req.body?.reference || req.body?.transactionId || req.query.reference || "");
    if (!reference) return res.status(400).json({ message: "Payment reference is required" });
    const transaction = await verifyTransaction(reference);
    if (!transaction || !["completed", "successful"].includes(String(transaction.status).toLowerCase())) {
      if (transaction?.status === "failed" || transaction?.status === "expired") await markPastDue(user.id);
      return res.status(402).json({ status: transaction?.status || "pending", message: "Payment is not completed" });
    }

    const expected = await getSubscription(user.id);
    const metadataUserId = transaction?.metadata?.userId ? String(transaction.metadata.userId) : user.id;
    if (metadataUserId !== user.id) return res.status(400).json({ message: "Payment ownership mismatch" });
    if (!expected?.providerTxRef?.startsWith("TASKLY-PREMIUM-")) return res.status(400).json({ message: "No pending Taskly Premium payment" });

    const expectedAmount = Number(expected.amountMinor || 0);
    const actualMinor = String(transaction.currency).toUpperCase() === "USD" ? Math.round(Number(transaction.amount) * 100) : Math.round(Number(transaction.amount));
    if (expectedAmount !== actualMinor || String(transaction.currency).toUpperCase() !== String(expected.currency).toUpperCase()) return res.status(400).json({ message: "Payment amount or currency mismatch" });

    const subscription = await activatePaidSubscription({ userId: user.id, provider: "DGATEWAY", paymentMethod: String(transaction.provider || expected.paymentMethod || "checkout"), currency: String(transaction.currency).toUpperCase(), amountMinor: actualMinor, txRef: String(expected.providerTxRef), providerPaymentId: String(transaction.id || transaction.reference || reference), rawData: transaction });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { firstname: true, lastName: true, email: true } });
    if (dbUser && !subscription?.providerSubscriptionId) {
      try {
        await attachProviderSubscription({ userId: user.id, email: dbUser.email, name: `${dbUser.firstname} ${dbUser.lastName}`.trim(), phone: transaction.phone_number || null, currency: String(transaction.currency).toUpperCase(), paymentProvider: transaction.provider === "stripe" ? "stripe" : "iotec" });
      } catch (error) { console.error("[billing subscription attach]", error); }
    }
    return res.json({ subscription: await getSubscription(user.id), entitlements: await getEntitlements(user.id), status: "completed" });
  } catch (error) {
    console.error("[billing verify]", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to verify payment" });
  }
};

export const billingWebhook = async (req: Request, res: Response) => {
  try {
    const signature = typeof req.headers["x-dgateway-signature"] === "string" ? req.headers["x-dgateway-signature"] : undefined;
    const body = rawBody(req);
    if (!isValidWebhook(body, signature)) return res.status(401).json({ message: "Invalid webhook signature" });
    const payload = req.body as { event?: string; data?: any };
    const event = String(payload?.event || "");
    const data = payload?.data || {};
    const userId = data?.metadata?.userId ? String(data.metadata.userId) : null;
    const successful = ["collection.completed", "subscription.renewed", "subscription.payment_completed"].includes(event) && ["successful", "completed"].includes(String(data.status || "successful").toLowerCase());
    if (successful && userId) {
      const current = await getSubscription(userId);
      const actualMinor = String(data.currency || current?.currency).toUpperCase() === "USD" ? Math.round(Number(data.amount) * 100) : Math.round(Number(data.amount));
      if (current?.plan === "PREMIUM" || current?.providerTxRef?.startsWith("TASKLY-PREMIUM-")) {
        await activatePaidSubscription({ userId, provider: "DGATEWAY", paymentMethod: String(data.provider || current.paymentMethod || "checkout"), currency: String(data.currency || current.currency).toUpperCase(), amountMinor: actualMinor, txRef: String(data.reference || data.id || current.providerTxRef), providerPaymentId: String(data.id || data.reference), providerSubscriptionId: data.subscription_id ? String(data.subscription_id) : current.providerSubscriptionId, rawData: data });
      }
    }
    if (["collection.failed", "collection.expired"].includes(event) && userId) await markPastDue(userId);
    return res.json({ received: true });
  } catch (error) {
    console.error("[billing webhook]", error);
    return res.status(200).json({ received: true });
  }
};

export const cancelBilling = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  const current = await getSubscription(user.id);
  if (current?.providerSubscriptionId) {
    try { await cancelProviderSubscription(String(current.providerSubscriptionId)); }
    catch (error) { console.error("[billing provider cancel]", error); }
  }
  return res.json({ subscription: await cancelSubscription(user.id) });
};

export const expireBilling = async (_req: Request, res: Response) => { await enforceExpiredSubscriptions(); return res.json({ success: true }); };

export const adminBillingSummary = async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "plan", "status", COUNT(*)::int AS count FROM "BillingSubscription" GROUP BY "plan", "status" ORDER BY "plan", "status"`);
  const revenue = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM("amountMinor"),0)::bigint AS total, "currency" FROM "BillingPayment" WHERE "status"='SUCCEEDED' GROUP BY "currency" ORDER BY "currency"`);
  return res.json({ subscriptions: rows, revenue });
};
