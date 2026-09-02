import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getEntitlements, getSubscription, ensureSubscription, startTrial, activatePaidSubscription, cancelSubscription, markPastDue, enforceExpiredSubscriptions } from "./billingService.js";
import { createCheckout, verifyTransaction, isValidWebhook } from "./flutterwave.js";

const auth = (req: Request) => (req as Request & { user?: { id: string; email: string } }).user;
const frontendUrl = () => process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

export const getBilling = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  return res.json({ subscription: await getSubscription(user.id), entitlements: await getEntitlements(user.id) });
};

export const beginTrial = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    return res.status(201).json({ subscription: await startTrial(user.id) });
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : "Trial unavailable" });
  }
};

export const beginCheckout = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    const { country = "UG", currency = country === "UG" ? "UGX" : "USD", phone } = req.body as {
      country?: string; currency?: string; phone?: string;
    };

    const configuredAmount = country === "UG"
      ? Number(process.env.TASKLY_PREMIUM_MONTHLY_UGX || 0)
      : Number(process.env.TASKLY_PREMIUM_MONTHLY_USD || 5);
    if (!Number.isFinite(configuredAmount) || configuredAmount <= 0) return res.status(500).json({ message: "Premium price is not configured" });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { firstname: true, lastName: true, email: true } });
    if (!dbUser) return res.status(404).json({ message: "User not found" });
    await ensureSubscription(user.id);

    const txRef = `TASKLY-PREMIUM-${user.id}-${Date.now()}`;
    const amountMinor = Math.round(configuredAmount * (currency.toUpperCase() === "USD" ? 100 : 1));
    await prisma.$executeRawUnsafe(
      `UPDATE "BillingSubscription" SET "provider"='FLUTTERWAVE', "paymentMethod"='checkout', "currency"=$2, "amountMinor"=$3, "providerTxRef"=$4, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1`,
      user.id, currency.toUpperCase(), amountMinor, txRef,
    );

    const link = await createCheckout({
      txRef,
      amount: configuredAmount,
      currency: currency.toUpperCase(),
      country: country.toUpperCase(),
      email: dbUser.email,
      name: `${dbUser.firstname} ${dbUser.lastName}`,
      phone: phone || null,
      userId: user.id,
      redirectUrl: `${frontendUrl()}/billing?status=callback&tx_ref=${encodeURIComponent(txRef)}`,
    });

    return res.json({ url: link, txRef, amount: configuredAmount, currency: currency.toUpperCase() });
  } catch (error) {
    console.error("[billing checkout]", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to start checkout" });
  }
};

export const completeCheckout = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  try {
    const transactionId = String(req.body?.transactionId || req.query.transaction_id || "");
    if (!transactionId) return res.status(400).json({ message: "transactionId is required" });

    const transaction = await verifyTransaction(transactionId);
    if (!transaction || transaction.status !== "successful") {
      await markPastDue(user.id);
      return res.status(402).json({ message: "Payment was not successful" });
    }

    const txRef = String(transaction.tx_ref || "");
    const expected = await getSubscription(user.id);
    if (!expected?.providerTxRef || expected.providerTxRef !== txRef) return res.status(400).json({ message: "Transaction reference mismatch" });

    const expectedAmount = Number(expected.amountMinor || 0);
    const actualMinor = String(transaction.currency).toUpperCase() === "USD" ? Math.round(Number(transaction.amount) * 100) : Math.round(Number(transaction.amount));
    if (expectedAmount !== actualMinor || String(transaction.currency).toUpperCase() !== String(expected.currency).toUpperCase()) return res.status(400).json({ message: "Payment amount or currency mismatch" });

    const subscription = await activatePaidSubscription({
      userId: user.id,
      provider: "FLUTTERWAVE",
      paymentMethod: String(transaction.payment_type || "checkout"),
      currency: String(transaction.currency).toUpperCase(),
      amountMinor: actualMinor,
      txRef,
      providerPaymentId: String(transaction.id),
      providerCustomerId: transaction.customer?.id ? String(transaction.customer.id) : null,
      rawData: transaction,
    });

    return res.json({ subscription, entitlements: await getEntitlements(user.id) });
  } catch (error) {
    console.error("[billing verify]", error);
    return res.status(502).json({ message: error instanceof Error ? error.message : "Unable to verify payment" });
  }
};

export const billingWebhook = async (req: Request, res: Response) => {
  try {
    const hash = req.headers["verif-hash"];
    if (!isValidWebhook(typeof hash === "string" ? hash : undefined)) return res.status(401).json({ message: "Invalid webhook signature" });
    const data = req.body?.data;
    const transactionId = data?.id ? String(data.id) : null;
    if (!transactionId) return res.json({ received: true });

    const transaction = await verifyTransaction(transactionId);
    const userId = transaction?.meta?.userId ? String(transaction.meta.userId) : null;
    if (!userId || transaction.status !== "successful") return res.json({ received: true });

    const current = await getSubscription(userId);
    if (!current?.providerTxRef || current.providerTxRef !== String(transaction.tx_ref)) return res.json({ received: true });
    const actualMinor = String(transaction.currency).toUpperCase() === "USD" ? Math.round(Number(transaction.amount) * 100) : Math.round(Number(transaction.amount));
    if (actualMinor !== Number(current.amountMinor) || String(transaction.currency).toUpperCase() !== String(current.currency).toUpperCase()) return res.json({ received: true });

    await activatePaidSubscription({
      userId,
      provider: "FLUTTERWAVE",
      paymentMethod: String(transaction.payment_type || "checkout"),
      currency: String(transaction.currency).toUpperCase(),
      amountMinor: actualMinor,
      txRef: String(transaction.tx_ref),
      providerPaymentId: transactionId,
      providerCustomerId: transaction.customer?.id ? String(transaction.customer.id) : null,
      rawData: transaction,
    });
    return res.json({ received: true });
  } catch (error) {
    console.error("[billing webhook]", error);
    return res.status(200).json({ received: true });
  }
};

export const cancelBilling = async (req: Request, res: Response) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  return res.json({ subscription: await cancelSubscription(user.id) });
};

export const expireBilling = async (_req: Request, res: Response) => {
  await enforceExpiredSubscriptions();
  return res.json({ success: true });
};

export const adminBillingSummary = async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "plan", "status", COUNT(*)::int AS count FROM "BillingSubscription" GROUP BY "plan", "status" ORDER BY "plan", "status"`);
  const revenue = await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM("amountMinor"),0)::bigint AS total, "currency" FROM "BillingPayment" WHERE "status"='SUCCEEDED' GROUP BY "currency" ORDER BY "currency"`);
  return res.json({ subscriptions: rows, revenue });
};
