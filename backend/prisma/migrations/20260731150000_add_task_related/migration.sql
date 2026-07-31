-- Purely informational "Related To" cross-link between tasks (no blocking
-- semantics, unlike TaskDependencies).

-- CreateTable
CREATE TABLE "_TaskRelated" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskRelated_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TaskRelated_B_index" ON "_TaskRelated"("B");

-- AddForeignKey
ALTER TABLE "_TaskRelated" ADD CONSTRAINT "_TaskRelated_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskRelated" ADD CONSTRAINT "_TaskRelated_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
