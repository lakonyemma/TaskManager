import express from "express";
import { changePassword, getNotificationPreferences, getSettings, updateNotificationPreferences, updateProfile } from "./settingsController.js";
import { deleteAvatar, serveAvatar, uploadAvatar } from "./avatarController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { upload } from "../files/storage.js";

const router = express.Router();

router.get("/", authenticate, getSettings);
router.patch("/profile", authenticate, updateProfile);
router.patch("/password", authenticate, changePassword);
router.get("/notification-preferences", authenticate, getNotificationPreferences);
router.patch("/notification-preferences", authenticate, updateNotificationPreferences);
router.post("/avatar", authenticate, upload.single("avatar"), uploadAvatar);
router.delete("/avatar", authenticate, deleteAvatar);
router.get("/avatar/:filename", serveAvatar);

export default router;
