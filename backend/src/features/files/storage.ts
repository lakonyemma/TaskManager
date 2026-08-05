import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

// Buffered in memory (not staged to disk first) — small enough at this size
// cap, and lets putObject() below write to either local disk or R2 without
// the caller needing to know which backend is active.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const useR2 = Boolean(R2_BUCKET && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

const s3 = useR2
    ? new S3Client({
        region: "auto",
        endpoint: R2_ENDPOINT,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
    : null;

// Local-disk fallback, used automatically whenever the R2_* env vars aren't
// set — local dev needs zero object-storage configuration. Most free
// hosting tiers wipe local disk on every restart/redeploy though, so
// production deployments should set R2_* instead (see docs/DEPLOYMENT.md).
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
if (!useR2) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

if (useR2) {
    console.log("[storage] Using Cloudflare R2 object storage.");
} else {
    const missing = Object.entries({ R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY })
        .filter(([, value]) => !value)
        .map(([name]) => name);
    const allMissing = missing.length === 4;
    console.warn(
        allMissing
            // Nothing set at all — the expected, unremarkable local-dev case.
            ? "[storage] R2_BUCKET/R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY are not set — falling back to local disk. " +
              "Uploaded files will NOT survive a redeploy/restart on most hosting platforms; see docs/DEPLOYMENT.md."
            // Some are set — almost certainly a misconfiguration (partially filled-in
            // R2 credentials), and one that fails *silently*: uploads still "work" by
            // falling back to disk, so this is easy to miss until files start
            // disappearing after a restart. Name the exact gap instead of a generic
            // "not fully set" so it's obvious at boot.
            : `[storage] R2 is misconfigured — ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} missing while the ` +
              `other R2_* vars are set. Falling back to local disk, which will NOT survive a redeploy/restart on most ` +
              "hosting platforms (uploaded files, including avatars, will silently disappear). Set the missing " +
              "variable(s) — see docs/DEPLOYMENT.md.",
    );
}

export const isDurableStorageConfigured = (): boolean => useR2;

// `key` mirrors the old on-disk layout for continuity — e.g. `<workspaceId>/<storedName>`
// for task attachments, `avatars/<storedName>` for profile photos.
export const putObject = async (key: string, buffer: Buffer, contentType: string): Promise<void> => {
    if (useR2 && s3) {
        await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
        return;
    }
    const dest = path.join(UPLOADS_ROOT, key);
    await fsPromises.mkdir(path.dirname(dest), { recursive: true });
    await fsPromises.writeFile(dest, buffer);
};

const EXT_CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf",
};

export const getObject = async (key: string): Promise<{ stream: Readable; contentType?: string } | null> => {
    if (useR2 && s3) {
        try {
            const result = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
            return { stream: result.Body as unknown as Readable, contentType: result.ContentType };
        } catch (error) {
            const name = (error as { name?: string })?.name;
            if (name === "NoSuchKey" || name === "NotFound") return null;
            throw error;
        }
    }
    const filePath = path.join(UPLOADS_ROOT, key);
    if (!filePath.startsWith(UPLOADS_ROOT) || !fs.existsSync(filePath)) return null;
    return { stream: fs.createReadStream(filePath), contentType: EXT_CONTENT_TYPES[path.extname(filePath).toLowerCase()] };
};

export const deleteObject = async (key: string): Promise<void> => {
    if (useR2 && s3) {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
        return;
    }
    await fsPromises.unlink(path.join(UPLOADS_ROOT, key)).catch(() => {});
};
