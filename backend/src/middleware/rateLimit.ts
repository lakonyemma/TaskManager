import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

// Brute-force protection on login/register: generous enough for real users
// retrying a typo'd password, tight enough to slow down credential stuffing.
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Please try again in a few minutes." },
});

// Invitation spam protection, keyed per authenticated user (falls back to IP
// for unauthenticated callers, though this route always requires auth).
export const invitationRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req as Request & { user?: { id: string } }).user?.id || ipKeyGenerator(req.ip || "unknown"),
    message: { message: "Too many invitations sent. Please try again later." },
});
