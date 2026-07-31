import express from "express";
import { listFocusSessions, logFocusSession } from "./focusController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, listFocusSessions);
router.post("/", authenticate, logFocusSession);

export default router;
