-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('OFF', 'DAILY', 'WEEKLY');

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "lastDigestSentAt" TIMESTAMP(3);
