// One-off backfill: workspaces created before custom board columns existed
// have no BoardColumn rows, so their tasks' columnId is null and the Boards
// page would have nothing to group by. Idempotent — safe to re-run; skips
// any workspace that already has columns (e.g. from createWorkspace's
// automatic seeding, which covers every workspace created after this
// shipped). Run once, then delete.
import prisma from "../src/lib/prisma.js";
import { DEFAULT_BOARD_COLUMNS } from "../src/features/boardColumns/defaultColumns.js";

async function main() {
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    console.log(`Found ${workspaces.length} workspace(s).`);

    let seeded = 0;
    let skipped = 0;

    for (const workspace of workspaces) {
        const existingCount = await prisma.boardColumn.count({ where: { workspaceId: workspace.id } });
        if (existingCount > 0) {
            skipped++;
            continue;
        }

        const columns = [];
        for (const def of DEFAULT_BOARD_COLUMNS) {
            columns.push(await prisma.boardColumn.create({ data: { workspaceId: workspace.id, ...def } }));
        }

        let tasksUpdated = 0;
        for (const column of columns) {
            const result = await prisma.task.updateMany({
                where: { workspaceId: workspace.id, status: column.mapsToStatus, columnId: null },
                data: { columnId: column.id },
            });
            tasksUpdated += result.count;
        }

        console.log(`  SEEDED "${workspace.name}" (${workspace.id}) — 4 columns, ${tasksUpdated} task(s) assigned.`);
        seeded++;
    }

    console.log(`Done. Seeded ${seeded}, skipped ${skipped} (already had columns).`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
