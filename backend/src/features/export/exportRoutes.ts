import express from "express";
import { exportData } from "./exportController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, exportData);

export default router;
