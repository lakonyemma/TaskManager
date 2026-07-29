import express from "express";
import { listActivity } from "./activityController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, listActivity);

export default router;
