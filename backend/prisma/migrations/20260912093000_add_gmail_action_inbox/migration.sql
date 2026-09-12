-- CreateEnum
CREATE TYPE "MailActionKind" AS ENUM ('ACTION_REQUIRED', 'DEADLINE', 'WAITING_REPLY');

-- CreateEnum
CREATE TYPE "MailActionStatus" AS ENUM ('OPEN', 'TASK_CREATED', 'WAITING_CREATED', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "historyId" TEXT,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestHour" INTEGER NOT NULL DEFAULT 8,
    "followUpDays" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastSyncedAt" TIMESTAMP(3),
    "lastDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailActionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "counterparty" TEXT,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "kind" "MailActionKind" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "detectedDueAt" TIMESTAMP(3),
    "status" "MailActionStatus" NOT NULL DEFAULT 'OPEN',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MailActionItem_userId_gmailMessageId_key" ON "MailActionItem"("userId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "MailActionItem_userId_status_receivedAt_idx" ON "MailActionItem"("userId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "MailActionItem_userId_threadId_idx" ON "MailActionItem"("userId", "threadId");

-- CreateIndex
CREATE INDEX "MailActionItem_taskId_idx" ON "MailActionItem"("taskId");

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailActionItem" ADD CONSTRAINT "MailActionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailActionItem" ADD CONSTRAINT "MailActionItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
