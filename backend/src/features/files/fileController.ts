import { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";
import { getMembership, getWorkspacePlan } from "../../utils/plan.js";
import { UPLOADS_ROOT, moveToWorkspace } from "./storage.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };
type UploadedRequest = AuthedRequest & { file?: Express.Multer.File };

export const uploadFile = async (req: UploadedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { workspaceId, taskId } = req.body as { workspaceId?: string; taskId?: string };
        const file = req.file;
        if (!workspaceId || !file) {
            if (file) fs.unlink(file.path, () => {});
            return res.status(400).json({ message: "workspaceId and a file are required" });
        }

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership || membership.role === "GUEST") {
            fs.unlink(file.path, () => {});
            return res.status(403).json({ message: "You do not have permission to upload files here" });
        }

        const plan = await getWorkspacePlan(workspaceId);
        if (!plan.canUseFileAttachments) {
            fs.unlink(file.path, () => {});
            return res.status(403).json({ message: "File attachments require a plan upgrade.", upgradeRequired: true, feature: "canUseFileAttachments" });
        }

        if (taskId) {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            if (!task || task.workspaceId !== workspaceId) {
                fs.unlink(file.path, () => {});
                return res.status(404).json({ message: "Task not found in this workspace" });
            }
        }

        moveToWorkspace(file.path, workspaceId, file.filename);

        const record = await prisma.file.create({
            data: {
                workspaceId,
                taskId: taskId || null,
                uploadedById: authUser.id,
                filename: file.originalname,
                storedName: file.filename,
                mimeType: file.mimetype,
                sizeBytes: file.size,
            },
        });

        await createActivityLog({
            userId: authUser.id,
            action: `Uploaded file ${record.filename}`,
            workspaceId,
            taskId: taskId || undefined,
        });

        return res.status(201).json({ file: record });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listFiles = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const workspaceId = req.query.workspaceId as string | undefined;
        const taskId = req.query.taskId as string | undefined;
        if (!workspaceId) return res.status(400).json({ message: "workspaceId is required" });

        const membership = await getMembership(authUser.id, workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const files = await prisma.file.findMany({
            where: { workspaceId, ...(taskId ? { taskId } : {}) },
            include: { uploadedBy: { select: { id: true, firstname: true, lastName: true } } },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({ files });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const downloadFile = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const file = await prisma.file.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ message: "File not found" });

        const membership = await getMembership(authUser.id, file.workspaceId);
        if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

        const absolutePath = path.join(UPLOADS_ROOT, file.workspaceId, file.storedName);
        if (!fs.existsSync(absolutePath)) return res.status(404).json({ message: "File not found on disk" });

        return res.download(absolutePath, file.filename);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteFile = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const id = String(req.params.id);
        const file = await prisma.file.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ message: "File not found" });

        const membership = await getMembership(authUser.id, file.workspaceId);
        const canModerate = membership && ["OWNER", "ADMIN", "MANAGER"].includes(membership.role);
        if (file.uploadedById !== authUser.id && !canModerate) {
            return res.status(403).json({ message: "You do not have permission to delete this file" });
        }

        await prisma.file.delete({ where: { id } });
        fs.unlink(path.join(UPLOADS_ROOT, file.workspaceId, file.storedName), () => {});

        return res.status(200).json({ message: "File deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
