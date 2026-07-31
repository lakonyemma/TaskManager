-- Adds structured before/after value capture and request IP to ActivityLog
-- so it can also serve as the audit-log source (login, logout, password
-- changes, role changes, etc.) alongside the existing collaboration feed.

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "previousValue" JSONB;
