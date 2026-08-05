import express from "express";
import { createMilestone, deleteMilestone, listMilestones, updateMilestone } from "./milestoneController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/workspaces/:workspaceId/milestones", authenticate, listMilestones);
router.post("/workspaces/:workspaceId/milestones", authenticate, createMilestone);
router.patch("/milestones/:id", authenticate, updateMilestone);
router.delete("/milestones/:id", authenticate, deleteMilestone);

export default router;
