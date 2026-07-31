import prisma from "../lib/prisma.js";

// entityType is a structured category (e.g. "task_completed",
// "priority_changed") the activity feed's type filter matches against;
// `action` stays the free-text, human-readable line rendered in the feed.
// entityType is optional so this doesn't force every existing call site to
// pick a category up front — untyped entries just won't match a type filter.
export const createActivityLog = async ({
    userId,
    action,
    workspaceId,
    taskId,
    entityType,
    entityId,
}: {
    userId: string;
    action: string;
    workspaceId?: string;
    taskId?: string;
    entityType?: string;
    entityId?: string;
}) => {
    return prisma.activityLog.create({
        data: {
            userId,
            action,
            workspaceId,
            taskId,
            entityType,
            entityId,
        },
    });
};
