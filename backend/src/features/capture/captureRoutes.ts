import express from "express";
import { parseCapture } from "./captureController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { captureRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.post("/parse", authenticate, captureRateLimiter, parseCapture);

export default router;
