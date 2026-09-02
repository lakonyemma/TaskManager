import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth.js";

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    try {
        const token = authHeader.split(" ")[1];
        const payload = verifyToken(token);
        if (payload.type !== "access") {
            return res.status(401).json({ message: "Access token required" });
        }

        req.user = {
            id: payload.id,
            email: payload.email,
        };

        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
