-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedById" TEXT;

-- CreateIndex
CREATE INDEX "Task_completedById_status_idx" ON "Task"("completedById", "status");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: for tasks already completed before this column existed, the
-- assignee is the best available guess for who completed them (matches the
-- achievement-crediting behavior this replaces). Tasks completed with no
-- assignee can't be inferred and are left null.
UPDATE "Task" SET "completedById" = "assignedToId" WHERE "status" = 'COMPLETED' AND "completedById" IS NULL AND "assignedToId" IS NOT NULL;
