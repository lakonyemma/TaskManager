import express from "express";
import { getMyAchievements } from "./achievementController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getMyAchievements);

export default router;
