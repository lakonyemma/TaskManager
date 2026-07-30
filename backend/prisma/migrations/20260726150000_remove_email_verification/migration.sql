-- Email verification has been removed: accounts are now usable immediately
-- after registration, so the token/flag columns that gated sign-in are gone.
DROP INDEX "User_verificationToken_key";

ALTER TABLE "User" DROP COLUMN "emailVerified",
DROP COLUMN "emailVerifiedAt",
DROP COLUMN "verificationToken",
DROP COLUMN "verificationTokenExpiresAt";
