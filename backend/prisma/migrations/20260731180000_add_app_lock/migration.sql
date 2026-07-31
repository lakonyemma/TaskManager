-- App Lock: a local PIN re-authentication gate, separate from the account
-- password. appLockPinHash is bcrypt-hashed, never stored in plain text.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appLockEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appLockPinHash" TEXT,
ADD COLUMN     "appLockTimeoutMinutes" INTEGER NOT NULL DEFAULT 5;
