import express from "express";
import {
    login, logout, logoutAll, listSessions, me, refresh, register, resendVerification,
    revokeSession, verifyEmail,
} from "./authController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.post("/register", authRateLimiter, register);
router.post("/login", authRateLimiter, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", authenticate, logoutAll);
router.get("/sessions", authenticate, listSessions);
router.delete("/sessions/:id", authenticate, revokeSession);
router.get("/me", authenticate, me);
router.get("/verify-email/:token", verifyEmail);
router.post("/resend-verification", authRateLimiter, resendVerification);

export default router;
