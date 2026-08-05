import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { deleteObject } from "../files/storage.js";
import { getMembership } from "../../utils/membership.js";
import { findWorkspaceTemplate, WORKSPACE_TEMPLATES } from "./templates.js";
import { generateWorkspaceStructure } from "./templateEngine.js";

export const listWorkspaceTemplates = (_req: Request, res: Response) => {
    return res.status(200).json({
        templates: WORKSPACE_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            boardCount: t.columns.length,
            taskCount: t.tasks.length,
            labelCount: t.tags.length,
            milestoneCount: t.milestones.length,
        })),
    });
};

export const listWorkspaces = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaces = await prisma.workspace.findMany({
            where: { members: { some: { userId: authUser.id } } },
            include: { members: true },
        });

        return res.status(200).json({ workspaces });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createWorkspace = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { name, description, type, templateId } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Workspace name is required" });
        }
        const workspaceType = type === "TEAM" ? "TEAM" : "PERSONAL";
        const template = findWorkspaceTemplate(templateId);

        const workspace = await prisma.workspace.create({
            data: {
                name,
                description,
                type: workspaceType,
                members: {
                    create: [{ userId: authUser.id, role: "OWNER" }],
                },
            },
            include: { members: true },
        });

        await createActivityLog({ userId: authUser.id, action: `Created workspace ${workspace.name}`, workspaceId: workspace.id, entityType: "project_created", entityId: workspace.id });

        // Generate the workspace's board, labels, milestones, and starter
        // tasks — the four default columns for a blank workspace, or the
        // full structure defined by the selected template. See
        // templateEngine.ts / templates.ts for what actually gets created.
        const generated = await generateWorkspaceStructure(workspace.id, authUser.id, template);

        return res.status(201).json({
            workspace,
            template: template ? { id: template.id, name: template.name } : null,
            generated: {
                columnCount: generated.columns.length,
                tagCount: generated.tags.length,
                milestoneCount: generated.milestones.length,
                taskCount: generated.tasks.length,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Renaming/redescribing a workspace ("project") is a real gap in the API
// today — there was previously no way to edit one after creation. Notifies
// every other member so anyone with the old name cached (e.g. in a stale
// tab) sees why things look different.
export const updateWorkspace = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = String(req.params.workspaceId);
        const { name, description } = req.body as { name?: string; description?: string };

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
            return res.status(403).json({ message: "Only workspace owners and admins can edit this workspace" });
        }

        if (name !== undefined && !name.trim()) {
            return res.status(400).json({ message: "Workspace name cannot be empty" });
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name.trim();
        if (description !== undefined) data.description = description;

        const before = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, description: true } });

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data,
            include: { members: true },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Updated workspace ${workspace.name}`,
            workspaceId,
            entityType: "project_updated",
            entityId: workspaceId,
            previousValue: before ? { name: before.name, description: before.description } : undefined,
            newValue: { name: workspace.name, description: workspace.description },
            ipAddress: req.ip || null,
        });

        const otherMembers = workspace.members.filter((m) => m.userId !== authUser.id);
        await Promise.all(
            otherMembers.map((m) =>
                prisma.notification.create({
                    data: {
                        userId: m.userId,
                        workspaceId,
                        type: "PROJECT_UPDATED",
                        message: `${workspace.name} was updated`,
                    },
                }),
            ),
        );

        return res.status(200).json({ workspace });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listMembers = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceIdParam = req.params.workspaceId;
        const workspaceId = Array.isArray(workspaceIdParam) ? workspaceIdParam[0] : workspaceIdParam;
        if (!workspaceId) {
            return res.status(400).json({ message: "Workspace id is required" });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this workspace" });
        }

        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, firstname: true, lastName: true, email: true, avatarUrl: true },
                },
            },
        });

        return res.status(200).json({ members });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

const ASSIGNABLE_ROLES = ["ADMIN", "MANAGER", "MEMBER", "GUEST"];

export const updateMemberRole = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = String(req.params.workspaceId);
        const memberId = String(req.params.memberId);
        const { role } = req.body;
        if (!ASSIGNABLE_ROLES.includes(role)) {
            return res.status(400).json({ message: `Role must be one of ${ASSIGNABLE_ROLES.join(", ")}` });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can change member roles" });
        }

        const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
        if (!target || target.workspaceId !== workspaceId) {
            return res.status(404).json({ message: "Member not found" });
        }
        if (target.role === "OWNER") {
            return res.status(400).json({ message: "The workspace owner's role cannot be changed" });
        }

        const updated = await prisma.workspaceMember.update({
            where: { id: memberId },
            data: { role },
            include: { user: { select: { id: true, firstname: true, lastName: true, email: true, avatarUrl: true } } },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Changed ${updated.user.firstname} ${updated.user.lastName}'s role to ${role}`,
            workspaceId,
            entityType: "role_changed",
            entityId: updated.id,
            previousValue: { role: target.role },
            newValue: { role: updated.role },
            ipAddress: req.ip || null,
        });

        return res.status(200).json({ member: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const removeMember = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = String(req.params.workspaceId);
        const memberId = String(req.params.memberId);

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can remove members" });
        }

        const target = await prisma.workspaceMember.findUnique({
            where: { id: memberId },
            include: { user: { select: { firstname: true, lastName: true } } },
        });
        if (!target || target.workspaceId !== workspaceId) {
            return res.status(404).json({ message: "Member not found" });
        }
        if (target.role === "OWNER") {
            return res.status(400).json({ message: "The workspace owner cannot be removed" });
        }

        await prisma.workspaceMember.delete({ where: { id: memberId } });

        await createActivityLog({
            userId: authUser.id,
            action: `Removed ${target.user.firstname} ${target.user.lastName} from the workspace`,
            workspaceId,
            entityType: "member_removed",
            entityId: memberId,
        });

        return res.status(200).json({ message: "Member removed" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Irreversible — every Task/Comment/File/Notification/ActivityLog/
// WorkspaceInvitation row scoped to this workspace cascades away with it
// (see the onDelete: Cascade relations on Workspace in schema.prisma), and
// every other member loses access immediately. No activity-log entry is
// written for the deletion itself: ActivityLog.workspaceId also cascades,
// so a record scoped to this workspace would vanish along with it and
// nothing in the UI surfaces workspace-less log entries.
export const deleteWorkspace = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const workspaceId = String(req.params.workspaceId);

        // Deliberately via getMembership (not a raw findUnique) — a
        // super-admin-disabled workspace often means a moderation hold is in
        // effect, and self-service deletion would let an owner destroy the
        // evidence (tasks/files/activity all cascade away) while that hold
        // is active.
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || membership.role !== "OWNER") {
            return res.status(403).json({ message: "Only the workspace owner can delete this workspace" });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { files: { select: { storedName: true } } },
        });
        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        // Best-effort: clean up the actual stored blobs (R2 or local disk) —
        // deleting the File rows via cascade below doesn't touch storage.
        await Promise.all(
            workspace.files.map((file) =>
                deleteObject(`${workspaceId}/${file.storedName}`).catch((error) =>
                    console.error(`[workspace delete] Failed to delete stored file ${file.storedName}:`, error),
                ),
            ),
        );

        await prisma.workspace.delete({ where: { id: workspaceId } });

        return res.status(200).json({ message: "Workspace deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
