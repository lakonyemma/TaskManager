import express from "express";
import { createTimeEntry, deleteTimeEntry, listTimeEntries } from "./timeEntryController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/tasks/:taskId/time-entries", authenticate, listTimeEntries);
router.post("/tasks/:taskId/time-entries", authenticate, createTimeEntry);
router.delete("/time-entries/:id", authenticate, deleteTimeEntry);

export default router;
