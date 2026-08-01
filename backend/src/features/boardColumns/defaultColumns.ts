import prisma from "../../lib/prisma.js";

// Every workspace starts with these four — matching the fixed Kanban set
// this app used before custom columns existed, so nothing visually changes
// until someone actually customizes their board. mapsToStatus is what keeps
// every status-based system (achievements, reports, insights, reminders,
// dependency-completion checks) working unchanged: a column is just a
// user-facing label/position for a task that's really still TODO/
// IN_PROGRESS/REVIEW/COMPLETED underneath.
export const DEFAULT_BOARD_COLUMNS = [
    { name: "To Do", color: "#94a3b8", order: 0, mapsToStatus: "TODO" as const },
    { name: "In Progress", color: "#8b5cf6", order: 1, mapsToStatus: "IN_PROGRESS" as const },
    { name: "Review", color: "#f59e0b", order: 2, mapsToStatus: "REVIEW" as const },
    { name: "Done", color: "#34d399", order: 3, mapsToStatus: "COMPLETED" as const },
];

export const seedDefaultColumns = async (workspaceId: string) => {
    const created = [];
    for (const def of DEFAULT_BOARD_COLUMNS) {
        created.push(await prisma.boardColumn.create({ data: { workspaceId, ...def } }));
    }
    return created;
};
