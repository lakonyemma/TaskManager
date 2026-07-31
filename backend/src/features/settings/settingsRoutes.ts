import express from "express";
import {
    changeAppLockPin, changePassword, disableAppLock, enableAppLock, getNotificationPreferences, getSettings,
    setAppLockTimeout, updateNotificationPreferences, updateProfile, verifyAppLockPin,
} from "./settingsController.js";
import { deleteAvatar, serveAvatar, uploadAvatar } from "./avatarController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { upload } from "../files/storage.js";
import { pinVerifyRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.get("/", authenticate, getSettings);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);
router.get("/notification-preferences", authenticate, getNotificationPreferences);
router.patch("/notification-preferences", authenticate, updateNotificationPreferences);
router.post("/avatar", authenticate, upload.single("avatar"), uploadAvatar);
router.delete("/avatar", authenticate, deleteAvatar);
router.get("/avatar/:filename", serveAvatar);
router.post("/app-lock", authenticate, enableAppLock);
router.delete("/app-lock", authenticate, disableAppLock);
router.patch("/app-lock/pin", authenticate, changeAppLockPin);
router.patch("/app-lock/timeout", authenticate, setAppLockTimeout);
router.post("/app-lock/verify", authenticate, pinVerifyRateLimiter, verifyAppLockPin);

export default router;
