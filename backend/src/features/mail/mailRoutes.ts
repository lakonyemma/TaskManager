import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
    createTaskFromMail,
    createWaitingFromMail,
    disconnectGmail,
    getMailStatus,
    googleCallback,
    listMailActions,
    setMailActionStatus,
    startGoogleConnect,
    syncMailNow,
    updateMailSettings,
} from "./mailController.js";

const router = express.Router();

router.get("/google/callback", googleCallback);
router.get("/status", authenticate, getMailStatus);
router.get("/google/connect", authenticate, startGoogleConnect);
router.delete("/google/disconnect/:accountId", authenticate, disconnectGmail);
router.delete("/google/disconnect", authenticate, disconnectGmail);
router.post("/sync", authenticate, syncMailNow);
router.get("/items", authenticate, listMailActions);
router.patch("/settings", authenticate, updateMailSettings);
router.patch("/items/:id/status", authenticate, setMailActionStatus);
router.post("/items/:id/task", authenticate, createTaskFromMail);
router.post("/items/:id/waiting", authenticate, createWaitingFromMail);

export default router;
