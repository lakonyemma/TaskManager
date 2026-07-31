import prisma from "../lib/prisma.js";

// Treats a disabled workspace (platform admin kill switch — see
// features/admin) as if the caller isn't a member at all: membership rows
// are left intact so re-enabling instantly restores access, but every
// workspace-scoped controller that gates on `if (!membership) return 403`
// already blocks disabled workspaces for free by going through this.
export const getMembership = async (userId: string, workspaceId: string) => {
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        include: { workspace: { select: { isActive: true } } },
    });
    if (!membership || !membership.workspace.isActive) return null;
    return membership;
};
