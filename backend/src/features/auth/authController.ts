import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import prisma from "../../lib/prisma.js";
import { hashToken, REFRESH_TOKEN_TTL_MS, signAccessToken, signRefreshToken, verifyToken } from "../../utils/auth.js";
import { createActivityLog } from "../../utils/activity.js";
import { sendVerificationEmail, sendVerificationSuccessEmail } from "../../utils/email.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const PROFILE_SELECT = {
    id: true,
    firstname: true,
    lastName: true,
    email: true,
    avatarUrl: true,
    bio: true,
    isActive: true,
    isSuperAdmin: true,
    language: true,
    fontStyle: true,
    colorTheme: true,
    taskNotificationsEnabled: true,
    emailNotificationsEnabled: true,
    appLockEnabled: true,
    appLockTimeoutMinutes: true,
    createdAt: true,
    updatedAt: true,
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const issueSession = async (
    user: { id: string; email: string },
    req: Request,
) => {
    const jti = crypto.randomUUID();
    const refreshToken = signRefreshToken({ id: user.id, email: user.email }, jti);
    await prisma.session.create({
        data: {
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            userAgent: req.headers["user-agent"] || null,
            ipAddress: req.ip || null,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
    });
    const accessToken = signAccessToken({ id: user.id, email: user.email });
    return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
    try {
        const { firstname, lastName, email, password } = req.body;

        if (!firstname || !lastName || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ message: "Enter a valid email address" });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomUUID();
        const user = await prisma.user.create({
            data: {
                firstname,
                lastName,
                email,
                password: hashedPassword,
                verificationToken,
                verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
            },
            select: PROFILE_SELECT,
        });

        await createActivityLog({ userId: user.id, action: "Registered account (pending email verification)", entityType: "account_created", ipAddress: req.ip || null });

        // Fire-and-forget: a slow/unreachable mail server must never hang
        // the registration response. sendVerificationEmail already logs its
        // own failures internally.
        void sendVerificationEmail(email, firstname, verificationToken).catch(() => {});

        return res.status(201).json({
            message: "Account created — check your email to verify your address before signing in.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            await createActivityLog({ userId: user.id, action: "Failed login attempt (wrong password)", entityType: "login_failed", ipAddress: req.ip || null });
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: "Please verify your email before signing in. Check your inbox for the verification link, or request a new one.",
                emailNotVerified: true,
            });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: "This account has been suspended. Contact your administrator for help." });
        }

        const { accessToken, refreshToken } = await issueSession(user, req);

        await createActivityLog({ userId: user.id, action: "Logged in", entityType: "login", ipAddress: req.ip || null });

        const { password: _password, verificationToken: _verificationToken, verificationTokenExpiresAt: _verificationTokenExpiresAt, appLockPinHash: _appLockPinHash, ...safeUser } = user;
        void _password; void _verificationToken; void _verificationTokenExpiresAt; void _appLockPinHash;

        return res.status(200).json({
            message: "Login successful",
            accessToken,
            refreshToken,
            user: safeUser,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const refresh = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ message: "Refresh token is required" });
        }

        const payload = verifyToken(refreshToken);
        if (payload.type !== "refresh") {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
        if (!session || session.revokedAt || session.expiresAt < new Date()) {
            return res.status(401).json({ message: "Session has been revoked or expired" });
        }

        const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { id: true, email: true, isActive: true },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (!user.isActive) {
            return res.status(403).json({ message: "This account has been suspended." });
        }

        await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

        const accessToken = signAccessToken({ id: user.id, email: user.email });

        return res.status(200).json({ accessToken });
    } catch (error) {
        console.error(error);
        return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ message: "Refresh token is required" });
        }
        const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(refreshToken) }, select: { userId: true } });
        await prisma.session.updateMany({
            where: { tokenHash: hashToken(refreshToken), revokedAt: null },
            data: { revokedAt: new Date() },
        });
        if (session) {
            await createActivityLog({ userId: session.userId, action: "Logged out", entityType: "logout", ipAddress: req.ip || null });
        }
        return res.status(200).json({ message: "Logged out" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const logoutAll = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }
        await prisma.session.updateMany({
            where: { userId: authUser.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        await createActivityLog({ userId: authUser.id, action: "Logged out of all sessions" });
        return res.status(200).json({ message: "Logged out of all sessions" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const listSessions = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const { refreshToken } = req.query as { refreshToken?: string };
        const currentHash = refreshToken ? hashToken(refreshToken) : null;

        const sessions = await prisma.session.findMany({
            where: { userId: authUser.id, revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { lastUsedAt: "desc" },
            select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, tokenHash: true },
        });

        return res.status(200).json({
            sessions: sessions.map(({ tokenHash, ...s }) => ({ ...s, isCurrent: currentHash ? tokenHash === currentHash : false })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const revokeSession = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }
        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        const session = await prisma.session.findUnique({ where: { id } });
        if (!session || session.userId !== authUser.id) {
            return res.status(404).json({ message: "Session not found" });
        }
        await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
        return res.status(200).json({ message: "Session revoked" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const me = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: PROFILE_SELECT,
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Deliberately idempotent — doesn't null the token on success — so it
// survives a double-fire (React StrictMode, corporate email-scanner link
// prefetching) without erroring the second time the same link is opened.
export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const { token } = req.body as { token?: string };
        if (!token) {
            return res.status(400).json({ message: "Verification token is required" });
        }

        const user = await prisma.user.findUnique({ where: { verificationToken: token } });
        if (!user) {
            return res.status(404).json({ message: "Invalid or already-used verification link" });
        }

        if (user.emailVerified) {
            return res.status(200).json({ message: "Email already verified" });
        }

        if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
            return res.status(400).json({ message: "This verification link has expired. Request a new one." });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true, emailVerifiedAt: new Date() },
        });

        await createActivityLog({ userId: user.id, action: "Verified email" });

        void sendVerificationSuccessEmail(user.email, user.firstname).catch(() => {});

        return res.status(200).json({ message: "Email verified — you can now sign in" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Always returns the same generic message whether or not the account
// exists (or is already verified) to avoid leaking which emails are
// registered.
export const resendVerification = async (req: Request, res: Response) => {
    try {
        const { email } = req.body as { email?: string };
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const GENERIC_MESSAGE = "If an account with that email exists and isn't verified yet, a new verification email has been sent.";

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.emailVerified) {
            return res.status(200).json({ message: GENERIC_MESSAGE });
        }

        const verificationToken = crypto.randomUUID();
        await prisma.user.update({
            where: { id: user.id },
            data: { verificationToken, verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
        });

        await createActivityLog({ userId: user.id, action: "Resent verification email" });

        void sendVerificationEmail(user.email, user.firstname, verificationToken).catch(() => {});

        return res.status(200).json({ message: GENERIC_MESSAGE });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
