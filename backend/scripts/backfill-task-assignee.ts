// One-off backfill: tasks created before the "default assignedToId to creator"
// fix (see taskController.ts createTask) have assignedToId = null, so
// reminderService.syncTaskReminders never scheduled reminders for them. This
// infers each task's original creator from its "Created task" ActivityLog
// entry, sets assignedToId, and re-syncs reminders. Run once, then delete.
import prisma from "../src/lib/prisma.js";
import { syncTaskReminders } from "../src/features/reminders/reminderService.js";

async function main() {
    const candidates = await prisma.task.findMany({
        where: {
            assignedToId: null,
            dueDate: { not: null },
            status: { not: "COMPLETED" },
        },
        select: { id: true, title: true, dueDate: true, workspaceId: true },
    });

    console.log(`Found ${candidates.length} unassigned task(s) with a due date.`);

    let fixed = 0;
    let skipped = 0;

    for (const task of candidates) {
        const creationLog = await prisma.activityLog.findFirst({
            where: { taskId: task.id, action: { startsWith: "Created task" } },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
        });

        let assigneeId = creationLog?.userId ?? null;

        if (!assigneeId) {
            const members = await prisma.workspaceMember.findMany({
                where: { workspaceId: task.workspaceId },
                select: { userId: true },
            });
            if (members.length === 1) assigneeId = members[0].userId;
        }

        if (!assigneeId) {
            console.warn(`  SKIP "${task.title}" (${task.id}) — no creator log and workspace has multiple members.`);
            skipped++;
            continue;
        }

        const updated = await prisma.task.update({
            where: { id: task.id },
            data: { assignedToId: assigneeId },
            select: { id: true, dueDate: true, assignedToId: true },
        });

        await syncTaskReminders(updated);
        console.log(`  FIXED "${task.title}" (${task.id}) -> assignedToId=${assigneeId}`);
        fixed++;
    }

    console.log(`Done. Fixed ${fixed}, skipped ${skipped}.`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
