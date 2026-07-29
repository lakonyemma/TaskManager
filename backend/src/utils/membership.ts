import prisma from "../lib/prisma.js";

export const getMembership = (userId: string, workspaceId: string) =>
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
