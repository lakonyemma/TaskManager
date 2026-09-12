import crypto from "node:crypto";

const KEY_ENV = "GMAIL_TOKEN_ENCRYPTION_KEY";

const getKey = (): Buffer => {
    const configured = process.env[KEY_ENV];
    if (!configured) {
        throw new Error(`[mail] ${KEY_ENV} is required before Gmail can be connected.`);
    }
    return crypto.createHash("sha256").update(configured).digest();
};

export const isMailEncryptionConfigured = (): boolean => Boolean(process.env[KEY_ENV]);

export const encryptMailSecret = (value: string): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
};

export const decryptMailSecret = (packed: string): string => {
    const [version, ivRaw, tagRaw, encryptedRaw] = packed.split(".");
    if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
        throw new Error("[mail] Encrypted Gmail token is malformed.");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedRaw, "base64url")),
        decipher.final(),
    ]).toString("utf8");
};
