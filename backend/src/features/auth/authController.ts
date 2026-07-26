import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import prisma from "../../lib/prisma.js";
import { hashToken, REFRESH_TOKEN_TTL_MS, signAccessToken, signRefreshToken, verifyToken } from "../../utils/auth.js";
import { createActivityLog } from "../../utils/activity.js";

const PROFILE_SELECT = {
    id: true,
    firstname: true,
    lastName: true,
    email: true,
    avatarUrl: true,
    bio: true,
    isActive: true,
    language: true,
    fontStyle: true,
    colorTheme: true,
    createdAt: true,
    updatedAt: true,
} as const;

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

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                firstname,
                lastName,
                email,
                password: hashedPassword,
            },
            select: PROFILE_SELECT,
        });

        const { accessToken, refreshToken } = await issueSession(user, req);

        await createActivityLog({ userId: user.id, action: "Registered account" });

        return res.status(201).json({
            message: "User registered successfully",
            accessToken,
            refreshToken,
            user,
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
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const { accessToken, refreshToken } = await issueSession(user, req);

        await createActivityLog({ userId: user.id, action: "Logged in" });

        const { password: _password, ...safeUser } = user;
        void _password;

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
            select: { id: true, email: true },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
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
        await prisma.session.updateMany({
            where: { tokenHash: hashToken(refreshToken), revokedAt: null },
            data: { revokedAt: new Date() },
        });
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
