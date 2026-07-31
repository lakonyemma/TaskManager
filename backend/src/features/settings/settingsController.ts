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
    appLockEnabled: true,
    appLockTimeoutMinutes: true,
} as const;

const PIN_REGEX = /^\d{4}$/;

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

// Enables App Lock for the first time (or re-enables after a disable) by
// setting the initial PIN. Requires the account password as proof of
// identity — a 4-digit PIN alone is too weak a gate to let someone set
// without re-proving who they are.
export const enableAppLock = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { pin, password } = req.body as { pin?: string; password?: string };
        if (!pin || !PIN_REGEX.test(pin)) {
            return res.status(400).json({ message: "PIN must be exactly 4 digits" });
        }
        if (!password) {
            return res.status(400).json({ message: "Your account password is required to enable App Lock" });
        }

        const user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user) return res.status(404).json({ message: "User not found" });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ message: "Incorrect password" });

        const pinHash = await bcrypt.hash(pin, 10);
        await prisma.user.update({ where: { id: authUser.id }, data: { appLockEnabled: true, appLockPinHash: pinHash } });

        await createActivityLog({ userId: authUser.id, action: "Enabled App Lock", entityType: "account_changed", ipAddress: req.ip || null });

        return res.status(200).json({ message: "App Lock enabled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const disableAppLock = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { pin } = req.body as { pin?: string };
        const user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.appLockEnabled && user.appLockPinHash) {
            if (!pin || !(await bcrypt.compare(pin, user.appLockPinHash))) {
                return res.status(401).json({ message: "Incorrect PIN" });
            }
        }

        await prisma.user.update({ where: { id: authUser.id }, data: { appLockEnabled: false, appLockPinHash: null } });

        await createActivityLog({ userId: authUser.id, action: "Disabled App Lock", entityType: "account_changed", ipAddress: req.ip || null });

        return res.status(200).json({ message: "App Lock disabled" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const changeAppLockPin = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };
        if (!newPin || !PIN_REGEX.test(newPin)) {
            return res.status(400).json({ message: "New PIN must be exactly 4 digits" });
        }

        const user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user || !user.appLockEnabled || !user.appLockPinHash) {
            return res.status(400).json({ message: "App Lock is not enabled" });
        }

        if (!currentPin || !(await bcrypt.compare(currentPin, user.appLockPinHash))) {
            return res.status(401).json({ message: "Incorrect current PIN" });
        }

        const pinHash = await bcrypt.hash(newPin, 10);
        await prisma.user.update({ where: { id: authUser.id }, data: { appLockPinHash: pinHash } });

        await createActivityLog({ userId: authUser.id, action: "Changed App Lock PIN", entityType: "account_changed", ipAddress: req.ip || null });

        return res.status(200).json({ message: "PIN updated" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const setAppLockTimeout = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { timeoutMinutes } = req.body as { timeoutMinutes?: number };
        if (typeof timeoutMinutes !== "number" || timeoutMinutes < 0 || timeoutMinutes > 120) {
            return res.status(400).json({ message: "timeoutMinutes must be between 0 and 120" });
        }

        await prisma.user.update({ where: { id: authUser.id }, data: { appLockTimeoutMinutes: Math.round(timeoutMinutes) } });

        return res.status(200).json({ message: "Timeout updated" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

// Verifies a PIN attempt against the stored hash — used by the lock-screen
// overlay to unlock the app. Rate-limited at the route level (see
// rateLimit.ts pinVerifyRateLimiter) since a 4-digit PIN is brute-forceable
// without one.
export const verifyAppLockPin = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const { pin } = req.body as { pin?: string };
        const user = await prisma.user.findUnique({ where: { id: authUser.id } });
        if (!user || !user.appLockEnabled || !user.appLockPinHash) {
            return res.status(400).json({ message: "App Lock is not enabled" });
        }

        const valid = !!pin && (await bcrypt.compare(pin, user.appLockPinHash));
        if (!valid) return res.status(401).json({ message: "Incorrect PIN", valid: false });

        return res.status(200).json({ valid: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
