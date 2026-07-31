import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const MAX_NAME_LENGTH = 60;

// Saved views are private per-user — no permission tiering beyond "must be
// a member of the workspace", since a view is just a personal filter
// shortcut, not shared workspace state.
export const listSavedViews = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const views = await prisma.savedView.findMany({
            where: { userId: authUser.id, workspaceId },
            orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
        });

        return res.status(200).json({ views });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createSavedView = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const { name, filters } = req.body as { name?: string; filters?: unknown };
        const trimmed = name?.trim();
        if (!trimmed) return res.status(400).json({ message: "View name is required" });
        if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `View name must be ${MAX_NAME_LENGTH} characters or fewer` });
        if (!filters || typeof filters !== "object") return res.status(400).json({ message: "filters is required" });

        const view = await prisma.savedView.create({
            data: { userId: authUser.id, workspaceId, name: trimmed, filters: filters as object },
        });

        return res.status(201).json({ view });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateSavedView = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const view = await prisma.savedView.findUnique({ where: { id } });
        if (!view || view.userId !== authUser.id) return res.status(404).json({ message: "Saved view not found" });

        const { name, pinned } = req.body as { name?: string; pinned?: boolean };
        const data: Record<string, unknown> = {};
        if (name !== undefined) {
            const trimmed = name.trim();
            if (!trimmed) return res.status(400).json({ message: "View name cannot be empty" });
            if (trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ message: `View name must be ${MAX_NAME_LENGTH} characters or fewer` });
            data.name = trimmed;
        }
        if (pinned !== undefined) data.pinned = !!pinned;

        const updated = await prisma.savedView.update({ where: { id }, data });
        return res.status(200).json({ view: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteSavedView = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const view = await prisma.savedView.findUnique({ where: { id } });
        if (!view || view.userId !== authUser.id) return res.status(404).json({ message: "Saved view not found" });

        await prisma.savedView.delete({ where: { id } });
        return res.status(200).json({ message: "Saved view deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
