import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
    createTaskFromMail,
    createWaitingFromMail,
    disconnectGmail,
    disconnectGmailConnection,
    getMailStatus,
    googleCallback,
    listMailActions,
    setMailActionStatus,
    startGoogleConnect,
    syncMailConnectionNow,
    syncMailNow,
    updateMailSettings,
} from "./mailController.js";

const router = express.Router();

router.get("/google/callback", googleCallback);
router.get("/status", authenticate, getMailStatus);
router.get("/google/connect", authenticate, startGoogleConnect);
router.delete("/google/connections/:connectionId", authenticate, disconnectGmailConnection);
router.delete("/google/disconnect/:accountId", authenticate, disconnectGmailConnection);
router.delete("/google/disconnect", authenticate, disconnectGmail);
router.post("/sync", authenticate, syncMailNow);
router.post("/connections/:connectionId/sync", authenticate, syncMailConnectionNow);
router.patch("/connections/:connectionId/settings", authenticate, updateMailSettings);
router.get("/items", authenticate, listMailActions);
router.patch("/settings", authenticate, updateMailSettings);
router.patch("/items/:id/status", authenticate, setMailActionStatus);
router.post("/items/:id/task", authenticate, createTaskFromMail);
router.post("/items/:id/waiting", authenticate, createWaitingFromMail);

export default router;
