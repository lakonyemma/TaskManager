import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin.js";
import {
  adminBillingSummary,
  beginCheckout,
  beginTrial,
  billingWebhook,
  cancelBilling,
  completeCheckout,
  expireBilling,
  getBilling,
} from "./billingController.js";

const router = express.Router();

router.get("/", authenticate, getBilling);
router.post("/trial", authenticate, beginTrial);
router.post("/checkout", authenticate, beginCheckout);
router.post("/verify", authenticate, completeCheckout);
router.post("/cancel", authenticate, cancelBilling);
router.post("/webhook", billingWebhook);
router.post("/expire", authenticate, requireSuperAdmin, expireBilling);
router.get("/admin/summary", authenticate, requireSuperAdmin, adminBillingSummary);

export default router;
