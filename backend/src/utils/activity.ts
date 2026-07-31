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
    previousValue,
    newValue,
    ipAddress,
}: {
    userId: string;
    action: string;
    workspaceId?: string;
    taskId?: string;
    entityType?: string;
    entityId?: string;
    previousValue?: object;
    newValue?: object;
    ipAddress?: string | null;
}) => {
    return prisma.activityLog.create({
        data: {
            userId,
            action,
            workspaceId,
            taskId,
            entityType,
            entityId,
            previousValue,
            newValue,
            ipAddress,
        },
    });
};

// Security/administrative entity types that belong in the audit log view
// (and, for privacy, are excluded from the general collaboration Activity
// Feed by default — see activityController.ts).
export const AUDIT_ENTITY_TYPES = [
    "login",
    "login_failed",
    "logout",
    "account_created",
    "password_changed",
    "account_changed",
    "role_changed",
] as const;
