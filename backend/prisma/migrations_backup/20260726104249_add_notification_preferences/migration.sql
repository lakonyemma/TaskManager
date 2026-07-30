-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

