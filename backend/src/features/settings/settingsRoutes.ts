import express from "express";
import { changePassword, getNotificationPreferences, getSettings, updateNotificationPreferences, updateProfile } from "./settingsController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, getSettings);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);
router.get("/notification-preferences", authenticate, getNotificationPreferences);
router.patch("/notification-preferences", authenticate, updateNotificationPreferences);

export default router;
