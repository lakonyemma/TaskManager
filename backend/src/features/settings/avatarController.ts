import { Request, Response } from "express";
import crypto from "node:crypto";
import path from "node:path";
import prisma from "../../lib/prisma.js";
import { deleteObject, getObject, putObject } from "../files/storage.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };
type UploadedRequest = AuthedRequest & { file?: Express.Multer.File };

const SETTINGS_SELECT = {
    id: true,
    firstname: true,
    lastName: true,
    email: true,
    avatarUrl: true,
    bio: true,
    language: true,
    fontStyle: true,
    colorTheme: true,
    taskNotificationsEnabled: true,
    emailNotificationsEnabled: true,
} as const;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a profile photo

// A user's avatarUrl always points at this endpoint (/api/settings/avatar/<storedName>)
// rather than a raw storage path, so we control content-type and can reject
// path traversal — `filename` below is only ever the stored name we
// generated, never arbitrary client input except when parsing an old value.
const storedNameFromAvatarUrl = (avatarUrl: string | null): string | null => {
    if (!avatarUrl) return null;
    const match = avatarUrl.match(/\/api\/settings\/avatar\/([^/?]+)$/);
    return match ? match[1] : null;
};

export const uploadAvatar = async (req: UploadedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const file = req.file;
        if (!file) return res.status(400).json({ message: "An image file is required" });

        if (!file.mimetype.startsWith("image/")) {
            return res.status(400).json({ message: "File must be an image" });
        }
        if (file.size > MAX_AVATAR_BYTES) {
            return res.status(400).json({ message: "Image must be under 5MB" });
        }

        const existing = await prisma.user.findUnique({ where: { id: authUser.id }, select: { avatarUrl: true } });

        const ext = path.extname(file.originalname).slice(0, 20);
        const storedName = `${crypto.randomUUID()}${ext}`;
        await putObject(`avatars/${storedName}`, file.buffer, file.mimetype);

        const oldStoredName = storedNameFromAvatarUrl(existing?.avatarUrl ?? null);
        if (oldStoredName) await deleteObject(`avatars/${oldStoredName}`);

        const avatarUrl = `/api/settings/avatar/${storedName}`;
        const user = await prisma.user.update({ where: { id: authUser.id }, data: { avatarUrl }, select: SETTINGS_SELECT });

        return res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const deleteAvatar = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const existing = await prisma.user.findUnique({ where: { id: authUser.id }, select: { avatarUrl: true } });
        const oldStoredName = storedNameFromAvatarUrl(existing?.avatarUrl ?? null);
        if (oldStoredName) await deleteObject(`avatars/${oldStoredName}`);

        const user = await prisma.user.update({ where: { id: authUser.id }, data: { avatarUrl: null }, select: SETTINGS_SELECT });
        return res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Public (no auth) — <img src> requests can't attach an Authorization
// header, and profile photos aren't sensitive data. `filename` is never
// used to build a filesystem path directly by the caller — getObject()
// handles the local-disk-vs-R2 path/key resolution and traversal guard.
export const serveAvatar = async (req: Request, res: Response) => {
    try {
        const filename = path.basename(String(req.params.filename));
        const object = await getObject(`avatars/${filename}`);
        if (!object) return res.status(404).json({ message: "Not found" });

        res.setHeader("Cache-Control", "public, max-age=86400");
        if (object.contentType) res.setHeader("Content-Type", object.contentType);
        object.stream.pipe(res);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
