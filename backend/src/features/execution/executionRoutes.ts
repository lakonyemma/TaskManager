import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import { createWaitingItem, getExecutionOverview, resolveWaitingItem } from "./executionController.js";

const router = express.Router();

router.get("/overview", authenticate, getExecutionOverview);
router.post("/waiting", authenticate, createWaitingItem);
router.post("/waiting/:id/resolve", authenticate, resolveWaitingItem);

export default router;
