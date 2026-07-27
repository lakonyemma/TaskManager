import { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import prisma from "../../lib/prisma.js";
import { AVATARS_DIR, moveToAvatars } from "../files/storage.js";

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
// rather than the raw uploads path, so we control content-type and can reject
// path traversal — `filename` below is only ever the disk-stored name we
// generated, never arbitrary client input except when parsing an old value.
const storedNameFromAvatarUrl = (avatarUrl: string | null): string | null => {
    if (!avatarUrl) return null;
    const match = avatarUrl.match(/\/api\/settings\/avatar\/([^/?]+)$/);
    return match ? match[1] : null;
};

const deleteStoredAvatar = (avatarUrl: string | null) => {
    const storedName = storedNameFromAvatarUrl(avatarUrl);
    if (!storedName) return;
    fs.unlink(path.join(AVATARS_DIR, storedName), () => {});
};

export const uploadAvatar = async (req: UploadedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const file = req.file;
        if (!file) return res.status(400).json({ message: "An image file is required" });

        if (!file.mimetype.startsWith("image/")) {
            fs.unlink(file.path, () => {});
            return res.status(400).json({ message: "File must be an image" });
        }
        if (file.size > MAX_AVATAR_BYTES) {
            fs.unlink(file.path, () => {});
            return res.status(400).json({ message: "Image must be under 5MB" });
        }

        const existing = await prisma.user.findUnique({ where: { id: authUser.id }, select: { avatarUrl: true } });

        moveToAvatars(file.path, file.filename);
        deleteStoredAvatar(existing?.avatarUrl ?? null);

        const avatarUrl = `/api/settings/avatar/${file.filename}`;
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
        deleteStoredAvatar(existing?.avatarUrl ?? null);

        const user = await prisma.user.update({ where: { id: authUser.id }, data: { avatarUrl: null }, select: SETTINGS_SELECT });
        return res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Public (no auth) — <img src> requests can't attach an Authorization
// header, and profile photos aren't sensitive data. `filename` is
// basename-sanitized before touching the filesystem so a crafted value like
// `../../.env` can't escape the avatars directory.
export const serveAvatar = async (req: Request, res: Response) => {
    try {
        const filename = path.basename(String(req.params.filename));
        const absolutePath = path.join(AVATARS_DIR, filename);
        if (!absolutePath.startsWith(AVATARS_DIR) || !fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: "Not found" });
        }
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.sendFile(absolutePath);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
