import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
    createWaitingItem,
    getExecutionOverview,
    reportClientTelemetry,
    resolveWaitingItem,
    smartRescheduleTask,
} from "./executionController.js";

const router = express.Router();

router.get("/overview", authenticate, getExecutionOverview);
router.post("/waiting", authenticate, createWaitingItem);
router.post("/waiting/:id/resolve", authenticate, resolveWaitingItem);
router.post("/tasks/:id/reschedule", authenticate, smartRescheduleTask);
router.post("/telemetry", authenticate, reportClientTelemetry);

export default router;
