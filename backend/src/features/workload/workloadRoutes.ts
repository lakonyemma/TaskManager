import express from "express";
import { getWorkload } from "./workloadController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getWorkload);

export default router;
