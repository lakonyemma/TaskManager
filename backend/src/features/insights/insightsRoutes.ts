import express from "express";
import { getInsights } from "./insightsController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getInsights);

export default router;
