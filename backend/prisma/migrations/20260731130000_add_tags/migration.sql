-- Replaces the free-text Task.labels string array (never had UI, no reuse,
-- no color, no way to rename/delete a "tag" everywhere at once) with a
-- proper workspace-scoped Tag entity and a Task<->Tag many-to-many join.

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "labels";

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TaskTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "_TaskTags_B_index" ON "_TaskTags"("B");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
