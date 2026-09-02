import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const configuredJwtSecret = process.env.JWT_SECRET;
if (!configuredJwtSecret && process.env.NODE_ENV === "production") {
    throw new Error("[auth] JWT_SECRET must be set in production.");
}
if (!configuredJwtSecret) {
    console.warn("[auth] JWT_SECRET is not set — using an insecure development-only secret.");
}
const JWT_SECRET = configuredJwtSecret || "development-secret";

export type AuthTokenPayload = {
    id: string;
    email: string;
    type?: "access" | "refresh";
    jti?: string;
};

export const signAccessToken = (user: { id: string; email: string }) =>
    jwt.sign({ id: user.id, email: user.email, type: "access" }, JWT_SECRET, {
        expiresIn: "15m",
    });

export const signRefreshToken = (user: { id: string; email: string }, jti: string) =>
    jwt.sign({ id: user.id, email: user.email, type: "refresh", jti }, JWT_SECRET, {
        expiresIn: "365d",
    });

export const verifyToken = (token: string) =>
    jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

export const hashToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");

// Users should stay signed in on a device until they explicitly sign out —
// a long TTL keeps the session alive across normal day-to-day gaps.
export const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
