import { Request, Response } from "express";
import crypto from "node:crypto";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { sendInvitationAcceptedEmail, sendInvitationEmail } from "../../utils/email.js";

export const inviteByEmail = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { email, workspaceId, role } = req.body;
        if (!email || !workspaceId) {
            return res.status(400).json({ message: "Email and workspaceId are required" });
        }

        const inviteRole = role || "MEMBER";
        if (!["MEMBER", "MANAGER", "ADMIN", "GUEST"].includes(inviteRole)) {
            return res.status(400).json({ message: "Role must be MEMBER, MANAGER, ADMIN, or GUEST" });
        }

        // Check the inviter is an OWNER or ADMIN of the workspace
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: authUser.id, workspaceId } },
        });
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can send invitations" });
        }

        // Check the workspace exists
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        // Check the invited user doesn't already belong
        const invitedUser = await prisma.user.findUnique({ where: { email } });
        if (invitedUser) {
            const existingMember = await prisma.workspaceMember.findUnique({
                where: { userId_workspaceId: { userId: invitedUser.id, workspaceId } },
            });
            if (existingMember) {
                return res.status(400).json({ message: "User is already a member of this workspace" });
            }
        }

        // Check no PENDING invitation already exists for this email+workspace
        const existingInvitation = await prisma.workspaceInvitation.findUnique({
            where: { email_workspaceId: { email, workspaceId } },
        });
        if (existingInvitation && existingInvitation.status === "PENDING") {
            return res.status(400).json({ message: "A pending invitation already exists for this email" });
        }

        // Reactivate or create the invitation
        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days to accept

        let invitation;
        if (existingInvitation) {
            invitation = await prisma.workspaceInvitation.update({
                where: { id: existingInvitation.id },
                data: {
                    token,
                    expiresAt,
                    status: "PENDING",
                    invitedById: authUser.id,
                    role: inviteRole as "MEMBER" | "MANAGER" | "ADMIN",
                },
            });
        } else {
            invitation = await prisma.workspaceInvitation.create({
                data: {
                    email,
                    workspaceId,
                    invitedById: authUser.id,
                    token,
                    expiresAt,
                    role: inviteRole as "MEMBER" | "MANAGER" | "ADMIN",
                },
            });
        }

        // Create a notification for the invited user if they have an account
        if (invitedUser) {
            await prisma.notification.create({
                data: {
                    userId: invitedUser.id,
                    workspaceId,
                    type: "WORKSPACE_INVITED",
                    message: `You've been invited to join the workspace "${workspace.name}"`,
                },
            });
        }

        await createActivityLog({
            userId: authUser.id,
            action: `Invited ${email} to workspace ${workspace.name}`,
            workspaceId,
            entityType: "member_invited",
        });

        // Skip sending if the recipient already has an account and has opted out
        // of email notifications; they still get the in-app notification above.
        if (!invitedUser || invitedUser.emailNotificationsEnabled) {
            const inviter = await prisma.user.findUnique({ where: { id: authUser.id }, select: { firstname: true, lastName: true } });
            void sendInvitationEmail(email, workspace.name, token, inviter ? `${inviter.firstname} ${inviter.lastName}` : undefined, inviteRole, expiresAt).catch(() => {});
        }

        return res.status(201).json({
            message: `Invitation sent to ${email}`,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                token: invitation.token,
                expiresAt: invitation.expiresAt,
                status: invitation.status,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const acceptInvitation = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const tokenParam = req.params.token;
        const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
        if (!token) {
            return res.status(400).json({ message: "Invitation token is required" });
        }

        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { token },
            include: { workspace: true, invitedBy: { select: { firstname: true, lastName: true, email: true } } },
        });
        if (!invitation) {
            return res.status(404).json({ message: "Invitation not found" });
        }

        if (invitation.status !== "PENDING") {
            return res.status(400).json({ message: `Invitation is already ${invitation.status.toLowerCase()}` });
        }

        if (new Date() > invitation.expiresAt) {
            await prisma.workspaceInvitation.update({
                where: { id: invitation.id },
                data: { status: "EXPIRED" },
            });
            return res.status(400).json({ message: "Invitation has expired" });
        }

        // Check the authenticated user's email matches the invited email
        if (authUser.email !== invitation.email) {
            return res.status(403).json({ message: "This invitation was sent to a different email address" });
        }

        // Create the workspace membership with the invitation's role
        await prisma.workspaceMember.create({
            data: {
                userId: authUser.id,
                workspaceId: invitation.workspaceId,
                role: invitation.role,
            },
        });

        // Mark invitation as accepted
        await prisma.workspaceInvitation.update({
            where: { id: invitation.id },
            data: { status: "ACCEPTED" },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Accepted invitation to workspace ${invitation.workspace.name}`,
            workspaceId: invitation.workspaceId,
        });

        const accepter = await prisma.user.findUnique({ where: { id: authUser.id }, select: { firstname: true, lastName: true } });
        void sendInvitationAcceptedEmail(
            invitation.invitedBy.email,
            invitation.invitedBy.firstname,
            accepter ? `${accepter.firstname} ${accepter.lastName}` : authUser.email,
            invitation.workspace.name,
        ).catch(() => {});

        return res.status(200).json({
            message: `You've joined workspace "${invitation.workspace.name}"`,
            workspaceId: invitation.workspaceId,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listMyInvitations = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const invitations = await prisma.workspaceInvitation.findMany({
            where: {
                email: authUser.email,
                status: "PENDING",
                expiresAt: { gt: new Date() },
            },
            include: { workspace: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ invitations });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const cancelInvitation = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Invitation id is required" });
        }

        const invitation = await prisma.workspaceInvitation.findUnique({ where: { id } });
        if (!invitation) {
            return res.status(404).json({ message: "Invitation not found" });
        }

        // Verify the caller is an OWNER/ADMIN of the workspace
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: authUser.id, workspaceId: invitation.workspaceId } },
        });
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can cancel invitations" });
        }

        if (invitation.status !== "PENDING") {
            return res.status(400).json({ message: `Invitation is already ${invitation.status.toLowerCase()}` });
        }

        await prisma.workspaceInvitation.update({
            where: { id },
            data: { status: "CANCELLED" },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Cancelled invitation for ${invitation.email}`,
            workspaceId: invitation.workspaceId,
        });

        return res.status(200).json({ message: "Invitation cancelled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const resendInvitation = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Invitation id is required" });
        }

        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { id },
            include: { workspace: { select: { name: true } } },
        });
        if (!invitation) {
            return res.status(404).json({ message: "Invitation not found" });
        }

        // Verify the caller is an OWNER/ADMIN of the workspace
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: authUser.id, workspaceId: invitation.workspaceId } },
        });
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can resend invitations" });
        }

        if (invitation.status !== "PENDING" && invitation.status !== "EXPIRED") {
            return res.status(400).json({ message: `Invitation is already ${invitation.status.toLowerCase()}` });
        }

        // Issue a fresh single-use token and expiry — the old link stops working.
        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.workspaceInvitation.update({
            where: { id },
            data: { token, expiresAt, status: "PENDING" },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Resent invitation to ${invitation.email}`,
            workspaceId: invitation.workspaceId,
        });

        const recipient = await prisma.user.findUnique({ where: { email: invitation.email } });
        if (!recipient || recipient.emailNotificationsEnabled) {
            const inviter = await prisma.user.findUnique({ where: { id: authUser.id }, select: { firstname: true, lastName: true } });
            void sendInvitationEmail(invitation.email, invitation.workspace.name, token, inviter ? `${inviter.firstname} ${inviter.lastName}` : undefined, invitation.role, expiresAt).catch(() => {});
        }

        return res.status(200).json({ message: `Invitation resent to ${invitation.email}` });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listWorkspaceInvitations = async (req: Request, res: Response) => {
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

        // Verify the caller is an OWNER/ADMIN of the workspace
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: authUser.id, workspaceId } },
        });
        if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
            return res.status(403).json({ message: "Only workspace owners and admins can view invitations" });
        }

        const invitations = await prisma.workspaceInvitation.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ invitations });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Public (no auth) preview so the registration page can prefill the invited
// email and show which workspace the invite is for, without leaking any
// other invitation data.
export const previewInvitation = async (req: Request, res: Response) => {
    try {
        const tokenParam = req.params.token;
        const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
        if (!token) {
            return res.status(400).json({ message: "Invitation token is required" });
        }

        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { token },
            include: { workspace: { select: { name: true } } },
        });
        if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
            return res.status(404).json({ message: "Invitation not found or no longer valid" });
        }

        return res.status(200).json({
            email: invitation.email,
            workspaceName: invitation.workspace.name,
            role: invitation.role,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
