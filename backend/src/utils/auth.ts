import jwt from "jsonwebtoken";
import crypto from "node:crypto";

if (!process.env.JWT_SECRET) {
    console.warn("[auth] JWT_SECRET is not set — falling back to an insecure development secret. Set JWT_SECRET in production.");
}
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

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
        expiresIn: "7d",
    });

export const verifyToken = (token: string) =>
    jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

export const hashToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
