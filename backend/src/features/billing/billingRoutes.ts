import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import { cancelSubscription, getSubscription, listPlans } from "./billingController.js";

const router = express.Router();

router.get("/plans", listPlans);
router.get("/workspaces/:workspaceId/subscription", authenticate, getSubscription);
router.post("/workspaces/:workspaceId/subscription/cancel", authenticate, cancelSubscription);

export default router;
