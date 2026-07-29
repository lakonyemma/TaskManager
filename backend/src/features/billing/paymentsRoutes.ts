import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
    capturePaypalOrder,
    createPaypalOrder,
    createStripeCheckout,
    flutterwaveWebhook,
    initiateFlutterwavePayment,
    paypalWebhook,
    verifyFlutterwavePayment,
} from "./paymentsController.js";

const router = express.Router();

// Note: POST /api/payments/stripe/webhook is mounted directly in server.ts,
// ahead of the global express.json() middleware, because Stripe's signature
// verification needs the raw request body.

router.post("/stripe/checkout", authenticate, createStripeCheckout);

router.post("/paypal/checkout", authenticate, createPaypalOrder);
router.post("/paypal/capture", authenticate, capturePaypalOrder);
router.post("/paypal/webhook", paypalWebhook);

router.post("/flutterwave/checkout", authenticate, initiateFlutterwavePayment);
router.get("/flutterwave/verify", authenticate, verifyFlutterwavePayment);
router.post("/flutterwave/webhook", flutterwaveWebhook);

export default router;
