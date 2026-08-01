import express from "express";
import { askAssistant, parseTaskWithAssistant, searchWithAssistant } from "./assistantController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { assistantRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.post("/ask", authenticate, assistantRateLimiter, askAssistant);
router.post("/search", authenticate, assistantRateLimiter, searchWithAssistant);
router.post("/parse-task", authenticate, assistantRateLimiter, parseTaskWithAssistant);

export default router;
