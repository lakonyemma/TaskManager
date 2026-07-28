import { Request, Response } from "express";
import { listUserAchievements } from "./achievementService.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

export const getMyAchievements = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const achievements = await listUserAchievements(authUser.id);
        return res.status(200).json(achievements);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
