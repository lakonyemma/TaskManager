import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

// Local-disk storage — no paid object storage needed for a $0 budget.
// Files land in an `_incoming` staging directory first (multer parses the
// multipart body field-by-field, so `workspaceId` isn't reliably known yet
// when `destination` runs); the controller moves the file into its final
// `uploads/<workspaceId>/` home once workspace membership + plan are checked.
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const INCOMING_DIR = path.join(UPLOADS_ROOT, "_incoming");

fs.mkdirSync(INCOMING_DIR, { recursive: true });

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, INCOMING_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).slice(0, 20);
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

export const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE_BYTES } });

export const moveToWorkspace = (tempPath: string, workspaceId: string, storedName: string): void => {
    const workspaceDir = path.join(UPLOADS_ROOT, workspaceId);
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.renameSync(tempPath, path.join(workspaceDir, storedName));
};

export const AVATARS_DIR = path.join(UPLOADS_ROOT, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

export const moveToAvatars = (tempPath: string, storedName: string): void => {
    fs.renameSync(tempPath, path.join(AVATARS_DIR, storedName));
};
