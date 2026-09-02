import express from "express";
import { deleteFile, downloadFile, listFiles, uploadFile } from "./fileController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { upload } from "./storage.js";
import { uploadRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.get("/", authenticate, listFiles);
router.post("/", authenticate, uploadRateLimiter, upload.single("file"), uploadFile);
router.get("/:id/download", authenticate, downloadFile);
router.delete("/:id", authenticate, deleteFile);

export default router;
