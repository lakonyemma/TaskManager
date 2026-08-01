import { Request, Response } from "express";
import type { TaskStatus } from "../../../generated/prisma/client.js";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"];
const isValidStatus = (value: unknown): value is TaskStatus => VALID_STATUSES.includes(value as TaskStatus);
const canManageColumns = (role: string) => ["OWNER", "ADMIN", "MANAGER"].includes(role);

export const listColumns = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const columns = await prisma.boardColumn.findMany({ where: { workspaceId }, orderBy: { order: "asc" } });
        return res.status(200).json({ columns });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const createColumn = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = String(req.params.workspaceId);
        const { name, color, mapsToStatus } = req.body as { name?: string; color?: string; mapsToStatus?: unknown };
        if (!name?.trim()) return res.status(400).json({ message: "Column name is required" });
        if (mapsToStatus !== undefined && !isValidStatus(mapsToStatus)) {
            return res.status(400).json({ message: "mapsToStatus must be one of TODO, IN_PROGRESS, REVIEW, COMPLETED" });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || !canManageColumns(membership.role)) {
            return res.status(403).json({ message: "Only managers, admins, and owners can customize board columns" });
        }

        const last = await prisma.boardColumn.findFirst({ where: { workspaceId }, orderBy: { order: "desc" } });
        const column = await prisma.boardColumn.create({
            data: {
                workspaceId,
                name: name.trim(),
                color: color || "#8b5cf6",
                mapsToStatus: isValidStatus(mapsToStatus) ? mapsToStatus : "TODO",
                order: (last?.order ?? -1) + 1,
            },
        });

        return res.status(201).json({ column });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateColumn = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const column = await prisma.boardColumn.findUnique({ where: { id } });
        if (!column) return res.status(404).json({ message: "Column not found" });

        const membership = await getMembership(authUser.id, column.workspaceId);
        if (!membership || !canManageColumns(membership.role)) {
            return res.status(403).json({ message: "Only managers, admins, and owners can customize board columns" });
        }

        const { name, color, order, mapsToStatus } = req.body as { name?: string; color?: string; order?: number; mapsToStatus?: unknown };
        if (mapsToStatus !== undefined && !isValidStatus(mapsToStatus)) {
            return res.status(400).json({ message: "mapsToStatus must be one of TODO, IN_PROGRESS, REVIEW, COMPLETED" });
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined && name.trim()) data.name = name.trim();
        if (color !== undefined) data.color = color;
        if (typeof order === "number") data.order = order;
        if (mapsToStatus !== undefined) data.mapsToStatus = mapsToStatus;

        const updated = await prisma.boardColumn.update({ where: { id }, data });
        return res.status(200).json({ column: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteColumn = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const column = await prisma.boardColumn.findUnique({ where: { id } });
        if (!column) return res.status(404).json({ message: "Column not found" });

        const membership = await getMembership(authUser.id, column.workspaceId);
        if (!membership || !canManageColumns(membership.role)) {
            return res.status(403).json({ message: "Only managers, admins, and owners can customize board columns" });
        }

        const columnCount = await prisma.boardColumn.count({ where: { workspaceId: column.workspaceId } });
        if (columnCount <= 1) {
            return res.status(409).json({ message: "A workspace needs at least one board column" });
        }

        // Move any tasks sitting in this column to another column that maps
        // to the same status, if one exists — otherwise they just fall back
        // to unsorted-by-column (still grouped correctly by status).
        const fallback = await prisma.boardColumn.findFirst({
            where: { workspaceId: column.workspaceId, mapsToStatus: column.mapsToStatus, id: { not: id } },
        });
        await prisma.task.updateMany({ where: { columnId: id }, data: { columnId: fallback?.id ?? null } });

        await prisma.boardColumn.delete({ where: { id } });
        return res.status(200).json({ message: "Column deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
