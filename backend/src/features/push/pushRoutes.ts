import express from "express";
import { getPublicKey, sendTestPush, subscribe, unsubscribe } from "./pushController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/vapid-public-key", authenticate, getPublicKey);
router.post("/subscribe", authenticate, subscribe);
router.post("/unsubscribe", authenticate, unsubscribe);
router.post("/test", authenticate, sendTestPush);

export default router;
