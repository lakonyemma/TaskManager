import express from "express";
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from "./savedViewController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/workspaces/:workspaceId/saved-views", authenticate, listSavedViews);
router.post("/workspaces/:workspaceId/saved-views", authenticate, createSavedView);
router.patch("/saved-views/:id", authenticate, updateSavedView);
router.delete("/saved-views/:id", authenticate, deleteSavedView);

export default router;
