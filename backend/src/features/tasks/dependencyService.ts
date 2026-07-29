import prisma from "../../lib/prisma.js";

// BFS over the dependency graph reachable from `newDependsOnIds` — if we ever
// reach `taskId` itself, adding this edge would close a cycle (taskId would
// transitively depend on itself).
export const wouldCreateCycle = async (taskId: string, newDependsOnIds: string[]): Promise<boolean> => {
    const visited = new Set<string>();
    const queue = [...newDependsOnIds];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === taskId) return true;
        if (visited.has(current)) continue;
        visited.add(current);

        const node = await prisma.task.findUnique({
            where: { id: current },
            select: { dependsOn: { select: { id: true } } },
        });
        if (node) queue.push(...node.dependsOn.map((d) => d.id));
    }

    return false;
};

export const getIncompleteDependencies = async (taskId: string) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { dependsOn: { select: { id: true, title: true, status: true } } },
    });
    return task?.dependsOn.filter((d) => d.status !== "COMPLETED") ?? [];
};
