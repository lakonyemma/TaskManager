-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Backfill: best-effort completedAt for tasks that were already COMPLETED
-- before this column existed. updatedAt is the closest available signal
-- (it's whatever the last write to the row was, which for most completed
-- tasks is the completion itself).
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;

