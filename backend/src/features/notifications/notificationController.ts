import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";

export const listNotifications = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const notifications = await prisma.notification.findMany({
            where: { userId: authUser.id },
            include: { task: { select: { id: true, title: true, status: true } } },
            orderBy: { createdAt: "desc" },
            take: 200,
        });

        return res.status(200).json({ notifications });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const getUnreadCount = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const count = await prisma.notification.count({
            where: { userId: authUser.id, isRead: false },
        });

        return res.status(200).json({ count });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;
        if (!id) {
            return res.status(400).json({ message: "Notification id is required" });
        }

        const notification = await prisma.notification.findUnique({ where: { id } });
        if (!notification || notification.userId !== authUser.id) {
            return res.status(404).json({ message: "Notification not found" });
        }

        await prisma.notification.update({ where: { id }, data: { isRead: true } });

        return res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const markAllRead = async (req: Request, res: Response) => {
    try {
        const authUser = (req as Request & { user?: { id: string; email: string } }).user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        await prisma.notification.updateMany({
            where: { userId: authUser.id, isRead: false },
            data: { isRead: true },
        });

        return res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
