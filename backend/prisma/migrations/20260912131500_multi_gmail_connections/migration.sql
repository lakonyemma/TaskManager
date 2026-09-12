-- Allow more than one Gmail account per Taskly user while preserving the existing connection.
DROP INDEX IF EXISTS "GmailConnection_userId_key";

ALTER TABLE "GmailConnection"
ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "GmailConnection_userId_email_key" ON "GmailConnection"("userId", "email");
CREATE INDEX "GmailConnection_userId_idx" ON "GmailConnection"("userId");

-- Associate each existing mail action with the Gmail connection that produced it.
ALTER TABLE "MailActionItem"
ADD COLUMN "gmailConnectionId" TEXT;

UPDATE "MailActionItem" AS item
SET "gmailConnectionId" = connection."id"
FROM "GmailConnection" AS connection
WHERE item."userId" = connection."userId";

-- Orphaned metadata cannot be tied to a mailbox and is safe to remove; Gmail itself is untouched.
DELETE FROM "MailActionItem" WHERE "gmailConnectionId" IS NULL;

ALTER TABLE "MailActionItem"
ALTER COLUMN "gmailConnectionId" SET NOT NULL;

DROP INDEX IF EXISTS "MailActionItem_userId_gmailMessageId_key";
DROP INDEX IF EXISTS "MailActionItem_userId_threadId_idx";

CREATE UNIQUE INDEX "MailActionItem_gmailConnectionId_gmailMessageId_key"
ON "MailActionItem"("gmailConnectionId", "gmailMessageId");

CREATE INDEX "MailActionItem_gmailConnectionId_status_receivedAt_idx"
ON "MailActionItem"("gmailConnectionId", "status", "receivedAt");

CREATE INDEX "MailActionItem_gmailConnectionId_threadId_idx"
ON "MailActionItem"("gmailConnectionId", "threadId");

ALTER TABLE "MailActionItem"
ADD CONSTRAINT "MailActionItem_gmailConnectionId_fkey"
FOREIGN KEY ("gmailConnectionId") REFERENCES "GmailConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
