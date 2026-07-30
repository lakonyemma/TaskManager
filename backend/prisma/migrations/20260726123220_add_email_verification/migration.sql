-- AlterTable
-- emailVerified defaults to true on creation so pre-existing rows are
-- backfilled as already-verified (they predate this feature and should not
-- be retroactively locked out), then the default flips to false so newly
-- registered users require verification going forward.
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verificationToken" TEXT,
ADD COLUMN     "verificationTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");
