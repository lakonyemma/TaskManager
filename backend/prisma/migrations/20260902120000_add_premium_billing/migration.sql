CREATE TABLE "BillingSubscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'FREE',
  "status" TEXT NOT NULL DEFAULT 'FREE',
  "provider" TEXT,
  "paymentMethod" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "amountMinor" INTEGER NOT NULL DEFAULT 0,
  "trialStartAt" TIMESTAMP(3),
  "trialEndAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "gracePeriodEnd" TIMESTAMP(3),
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerTxRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscription_userId_key" ON "BillingSubscription"("userId");
CREATE UNIQUE INDEX "BillingSubscription_providerSubscriptionId_key" ON "BillingSubscription"("providerSubscriptionId");
CREATE UNIQUE INDEX "BillingSubscription_providerTxRef_key" ON "BillingSubscription"("providerTxRef");
CREATE INDEX "BillingSubscription_status_idx" ON "BillingSubscription"("status");
CREATE INDEX "BillingSubscription_currentPeriodEnd_idx" ON "BillingSubscription"("currentPeriodEnd");

CREATE TABLE "BillingPayment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT NOT NULL,
  "txRef" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentMethod" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayment_providerPaymentId_key" ON "BillingPayment"("providerPaymentId");
CREATE UNIQUE INDEX "BillingPayment_txRef_key" ON "BillingPayment"("txRef");
CREATE INDEX "BillingPayment_userId_createdAt_idx" ON "BillingPayment"("userId", "createdAt");
CREATE INDEX "BillingPayment_subscriptionId_idx" ON "BillingPayment"("subscriptionId");

CREATE TABLE "BillingWebhookEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingWebhookEvent_provider_eventId_key" ON "BillingWebhookEvent"("provider", "eventId");

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
