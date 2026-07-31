import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../../lib/prisma.js";
import { createActivityLog } from "../../utils/activity.js";

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

export const getSettings = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: SETTINGS_SELECT,
        });

        return res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { firstname, lastName, avatarUrl, bio, language, fontStyle, colorTheme, taskNotificationsEnabled, emailNotificationsEnabled } = req.body;

        const data: Record<string, unknown> = {};
        if (firstname !== undefined) data.firstname = firstname;
        if (lastName !== undefined) data.lastName = lastName;
        if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
        if (bio !== undefined) data.bio = bio;
        if (language !== undefined) data.language = language;
        if (fontStyle !== undefined) data.fontStyle = fontStyle;
        if (colorTheme !== undefined) data.colorTheme = colorTheme;
        if (taskNotificationsEnabled !== undefined) data.taskNotificationsEnabled = !!taskNotificationsEnabled;
        if (emailNotificationsEnabled !== undefined) data.emailNotificationsEnabled = !!emailNotificationsEnabled;

        // Only diff the fields actually being changed — avoids a bloated
        // previous/new payload and a no-op audit entry on an empty save.
        const before = await prisma.user.findUnique({ where: { id: authUser.id }, select: SETTINGS_SELECT });

        const user = await prisma.user.update({
            where: { id: authUser.id },
            data,
            select: SETTINGS_SELECT,
        });

        const changedKeys = Object.keys(data).filter((key) => before && before[key as keyof typeof before] !== user[key as keyof typeof user]);
        if (before && changedKeys.length > 0) {
            const previousValue = Object.fromEntries(changedKeys.map((k) => [k, before[k as keyof typeof before]]));
            const newValue = Object.fromEntries(changedKeys.map((k) => [k, user[k as keyof typeof user]]));
            await createActivityLog({
                userId: authUser.id,
                action: "Updated account settings",
                entityType: "account_changed",
                previousValue,
                newValue,
                ipAddress: req.ip || null,
            });
        }

        return res.status(200).json({ message: "Profile updated", user });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current and new password are required" });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters" });
        }

        const user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: authUser.id }, data: { password: hashedPassword } });

        // Revoke all existing sessions so other devices must re-authenticate.
        await prisma.session.updateMany({
            where: { userId: authUser.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });

        await createActivityLog({ userId: authUser.id, action: "Changed password", entityType: "password_changed", ipAddress: req.ip || null });

        return res.status(200).json({ message: "Password changed. Please sign in again on other devices." });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const getNotificationPreferences = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const preferences = await prisma.notificationPreference.upsert({
            where: { userId: authUser.id },
            update: {},
            create: { userId: authUser.id },
        });

        return res.status(200).json({ preferences });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateNotificationPreferences = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { pushEnabled, soundEnabled, vibrationEnabled, defaultReminderMinutes } = req.body;

        const data: Record<string, unknown> = {};
        if (pushEnabled !== undefined) data.pushEnabled = !!pushEnabled;
        if (soundEnabled !== undefined) data.soundEnabled = !!soundEnabled;
        if (vibrationEnabled !== undefined) data.vibrationEnabled = !!vibrationEnabled;
        if (Array.isArray(defaultReminderMinutes)) {
            const minutes = defaultReminderMinutes
                .map((m: unknown) => Number(m))
                .filter((m: number) => Number.isFinite(m) && m > 0 && m <= 44640);
            data.defaultReminderMinutes = minutes;
        }

        const preferences = await prisma.notificationPreference.upsert({
            where: { userId: authUser.id },
            update: data,
            create: { userId: authUser.id, ...data },
        });

        return res.status(200).json({ message: "Notification preferences saved", preferences });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
