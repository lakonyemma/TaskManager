import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const MAX_NAME_LENGTH = 40;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#8b5cf6";

// Anyone GUEST-and-up can see tags (needed just to filter/view them on
// tasks); creating/renaming is a MEMBER+ action, deleting (which detaches
// the tag from every task workspace-wide) is gated to MANAGER+ — mirrors
// the existing "assign to others is Manager+" pattern in taskController.
const canManageTags = (role: string) => role !== "GUEST";
const canDeleteTags = (role: string) => ["OWNER", "ADMIN", "MANAGER"].includes(role);

export const listTags = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const tags = await prisma.tag.findMany({
            where: { workspaceId },
            orderBy: { name: "asc" },
            include: { _count: { select: { tasks: true } } },
        });

        return res.status(200).json({ tags });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createTag = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canManageTags(membership.role)) return res.status(403).json({ message: "Guests cannot create tags" });

        const { name, color } = req.body as { name?: string; color?: string };
        const trimmed = name?.trim();
        if (!trimmed) return res.status(400).json({ message: "Tag name is required" });
        if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `Tag name must be ${MAX_NAME_LENGTH} characters or fewer` });
        if (color !== undefined && !HEX_COLOR.test(color)) return res.status(400).json({ message: "Color must be a hex value like #8b5cf6" });

        const existing = await prisma.tag.findFirst({
            where: { workspaceId, name: { equals: trimmed, mode: "insensitive" } },
        });
        if (existing) return res.status(409).json({ message: `A tag named "${existing.name}" already exists` });

        const tag = await prisma.tag.create({
            data: { name: trimmed, color: color || DEFAULT_COLOR, workspaceId },
        });

        return res.status(201).json({ tag });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateTag = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const tag = await prisma.tag.findUnique({ where: { id } });
        if (!tag) return res.status(404).json({ message: "Tag not found" });

        const membership = await getMembership(authUser.id, tag.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canManageTags(membership.role)) return res.status(403).json({ message: "Guests cannot edit tags" });

        const { name, color } = req.body as { name?: string; color?: string };
        const data: Record<string, string> = {};

        if (name !== undefined) {
            const trimmed = name.trim();
            if (!trimmed) return res.status(400).json({ message: "Tag name cannot be empty" });
            if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `Tag name must be ${MAX_NAME_LENGTH} characters or fewer` });
            const clash = await prisma.tag.findFirst({
                where: { workspaceId: tag.workspaceId, name: { equals: trimmed, mode: "insensitive" }, id: { not: id } },
            });
            if (clash) return res.status(409).json({ message: `A tag named "${clash.name}" already exists` });
            data.name = trimmed;
        }
        if (color !== undefined) {
            if (!HEX_COLOR.test(color)) return res.status(400).json({ message: "Color must be a hex value like #8b5cf6" });
            data.color = color;
        }

        const updated = await prisma.tag.update({ where: { id }, data });
        return res.status(200).json({ tag: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteTag = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const tag = await prisma.tag.findUnique({ where: { id } });
        if (!tag) return res.status(404).json({ message: "Tag not found" });

        const membership = await getMembership(authUser.id, tag.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });
        if (!canDeleteTags(membership.role)) return res.status(403).json({ message: "Only managers, admins, and owners can delete tags" });

        // The Task<->Tag join rows cascade automatically (implicit m2m FK is
        // ON DELETE CASCADE) — deleting the Tag row alone detaches it from
        // every task that had it.
        await prisma.tag.delete({ where: { id } });

        return res.status(200).json({ message: "Tag deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
