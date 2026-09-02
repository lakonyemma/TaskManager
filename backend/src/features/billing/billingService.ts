import prisma from "../../lib/prisma.js";

export type BillingPlan = "FREE" | "PREMIUM";
export type BillingStatus = "FREE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

const TRIAL_DAYS = 7;
const GRACE_DAYS = 3;
const row = (value: unknown) => (Array.isArray(value) ? value[0] : value) as Record<string, any> | undefined;

export const getSubscription = async (userId: string) => {
  const result = await prisma.$queryRawUnsafe<any[]>(`SELECT "id", "userId", "plan", "status", "provider", "paymentMethod", "currency", "amountMinor", "trialStartAt", "trialEndAt", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "canceledAt", "gracePeriodEnd", "providerCustomerId", "providerSubscriptionId", "providerTxRef", "createdAt", "updatedAt" FROM "BillingSubscription" WHERE "userId" = $1 LIMIT 1`, userId);
  return row(result) || null;
};

export const ensureSubscription = async (userId: string) => {
  const existing = await getSubscription(userId);
  if (existing) return existing;
  const result = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "BillingSubscription" ("userId", "plan", "status") VALUES ($1, 'FREE', 'FREE') ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP RETURNING *`, userId);
  return row(result)!;
};

export const startTrial = async (userId: string) => {
  const existing = await ensureSubscription(userId);
  if (existing.status === "TRIALING" || existing.status === "ACTIVE") return existing;
  if (existing.trialEndAt) throw new Error("Your trial has already been used");
  const start = new Date();
  const end = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.$queryRawUnsafe<any[]>(`UPDATE "BillingSubscription" SET "plan"='PREMIUM', "status"='TRIALING', "trialStartAt"=$2, "trialEndAt"=$3, "currentPeriodStart"=$2, "currentPeriodEnd"=$3, "amountMinor"=0, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1 RETURNING *`, userId, start, end);
  return row(result)!;
};

export const activatePaidSubscription = async (params: {
  userId: string;
  provider: string;
  paymentMethod: string;
  currency: string;
  amountMinor: number;
  txRef: string;
  providerPaymentId: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  rawData?: unknown;
}) => {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const subscription = await ensureSubscription(params.userId);
  await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "plan"='PREMIUM', "status"='ACTIVE', "provider"=$2, "paymentMethod"=$3, "currency"=$4, "amountMinor"=$5, "currentPeriodStart"=$6, "currentPeriodEnd"=$7, "gracePeriodEnd"=NULL, "cancelAtPeriodEnd"=false, "canceledAt"=NULL, "providerTxRef"=$8, "providerSubscriptionId"=COALESCE($9,"providerSubscriptionId"), "providerCustomerId"=COALESCE($10,"providerCustomerId"), "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`, subscription.id, params.provider, params.paymentMethod, params.currency, params.amountMinor, now, end, params.txRef, params.providerSubscriptionId ?? null, params.providerCustomerId ?? null);
  await prisma.$executeRawUnsafe(`INSERT INTO "BillingPayment" ("subscriptionId", "userId", "provider", "providerPaymentId", "txRef", "amountMinor", "currency", "paymentMethod", "status", "rawData") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SUCCEEDED',$9::jsonb) ON CONFLICT ("providerPaymentId") DO UPDATE SET "status"='SUCCEEDED', "rawData"=EXCLUDED."rawData"`, subscription.id, params.userId, params.provider, params.providerPaymentId, params.txRef, params.amountMinor, params.currency, params.paymentMethod, JSON.stringify(params.rawData ?? {}));
  return getSubscription(params.userId);
};

export const markPastDue = async (userId: string) => {
  const end = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "status"='PAST_DUE', "gracePeriodEnd"=$2, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1 AND "plan"='PREMIUM'`, userId, end);
};

export const cancelSubscription = async (userId: string) => {
  await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "cancelAtPeriodEnd"=true, "canceledAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=$1`, userId);
  return getSubscription(userId);
};

export const enforceExpiredSubscriptions = async () => {
  await prisma.$executeRawUnsafe(`UPDATE "BillingSubscription" SET "plan"='FREE', "status"='EXPIRED', "provider"=NULL, "paymentMethod"=NULL, "amountMinor"=0, "updatedAt"=CURRENT_TIMESTAMP WHERE "plan"='PREMIUM' AND (("status"='TRIALING' AND "trialEndAt" < CURRENT_TIMESTAMP) OR ("status"='ACTIVE' AND "cancelAtPeriodEnd"=true AND "currentPeriodEnd" < CURRENT_TIMESTAMP) OR ("status"='PAST_DUE' AND "gracePeriodEnd" < CURRENT_TIMESTAMP))`);
};

export const isPremium = (subscription: any) => {
  if (!subscription || subscription.plan !== "PREMIUM") return false;
  if (subscription.status === "TRIALING") return !subscription.trialEndAt || new Date(subscription.trialEndAt) > new Date();
  if (subscription.status === "PAST_DUE") return !subscription.gracePeriodEnd || new Date(subscription.gracePeriodEnd) > new Date();
  if (subscription.status !== "ACTIVE") return false;
  return !subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) > new Date();
};

export const getEntitlements = async (userId: string) => {
  const subscription = await ensureSubscription(userId);
  const premium = isPremium(subscription);
  const workspaceResult = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "WorkspaceMember" WHERE "userId"=$1 AND "role"='OWNER'`, userId);
  const ownedWorkspaces = Number(row(workspaceResult)?.count ?? 0);
  return {
    plan: premium ? "PREMIUM" : "FREE",
    status: premium ? subscription.status : "FREE",
    premium,
    maxWorkspaces: premium ? null : 2,
    ownedWorkspaces,
    trialEndsAt: subscription.trialEndAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    gracePeriodEnd: subscription.gracePeriodEnd,
    features: {
      unlimitedWorkspaces: premium,
      advancedAnalytics: premium,
      aiProductivityAssistant: premium,
      aiScheduling: premium,
      workloadAnalytics: premium,
      advancedReports: premium,
      exports: premium,
      recurringTasks: premium,
      customKanbanColumns: premium,
      advancedDependencies: premium,
      focusMode: premium,
      timeTracking: premium,
      fileAttachments: premium,
      emailDigests: premium,
      pushNotifications: premium,
      savedViews: premium,
    },
  };
};
