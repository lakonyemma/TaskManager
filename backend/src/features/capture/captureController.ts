import { Request, Response } from "express";
import { parseNaturalLanguageTask } from "./nlpParser.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

export const parseCapture = async (req: AuthedRequest, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) {
        return res.status(400).json({ message: "text is required" });
    }
    if (text.length > 500) {
        return res.status(400).json({ message: "text is too long (max 500 characters)" });
    }

    const parsed = parseNaturalLanguageTask(text);
    return res.status(200).json({ parsed });
};
