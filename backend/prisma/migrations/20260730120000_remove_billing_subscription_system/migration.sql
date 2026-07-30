-- Taskly is now fully free: drop the entire Plan/Subscription/Payment
-- subsystem and the feature-gate columns it backed. WebhookEvent was a
-- Stripe-webhook-idempotency table that existed in the database without a
-- corresponding Prisma model (never captured in schema.prisma or a tracked
-- migration) — dropped here too since nothing reads or writes it anymore.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_subscriptionId_fkey";

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";

ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_planId_fkey";

ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_workspaceId_fkey";

DROP TABLE "Payment";

DROP TABLE "Plan";

DROP TABLE "Subscription";

DROP TABLE "WebhookEvent";

DROP TYPE "BillingCycle";

DROP TYPE "PaymentProvider";

DROP TYPE "PaymentStatus";

DROP TYPE "PlanKey";

DROP TYPE "SubscriptionStatus";
