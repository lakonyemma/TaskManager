import { NextFunction, Request, Response } from "express";
import multer from "multer";

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "File must be 15 MB or smaller." : err.message });
    }
    if (err.message.startsWith("Unsupported file type.")) {
        return res.status(400).json({ message: err.message });
    }

    return res.status(500).json({ message: "Internal server error" });
};
