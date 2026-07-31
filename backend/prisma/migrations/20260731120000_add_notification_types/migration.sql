-- Adds the notification types needed for distinct "task completed",
-- "mention", "project updated", and "system announcement" notifications
-- (previously folded into generic TASK_UPDATED/TASK_COMMENTED, or missing
-- entirely).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROJECT_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ANNOUNCEMENT';
