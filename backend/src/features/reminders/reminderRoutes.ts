import express from "express";
import { cancelReminderEndpoint, listReminderOptions, listTaskReminders, snoozeReminderEndpoint } from "./reminderController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/options", authenticate, listReminderOptions);
router.get("/task/:taskId", authenticate, listTaskReminders);
router.post("/:id/snooze", authenticate, snoozeReminderEndpoint);
router.delete("/:id", authenticate, cancelReminderEndpoint);

export default router;
