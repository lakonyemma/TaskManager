import express from "express";
import { login, logout, logoutAll, listSessions, me, refresh, register, revokeSession } from "./authController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", authenticate, logoutAll);
router.get("/sessions", authenticate, listSessions);
router.delete("/sessions/:id", authenticate, revokeSession);
router.get("/me", authenticate, me);

export default router;
