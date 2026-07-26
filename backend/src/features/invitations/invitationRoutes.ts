import express from "express";
import {
    acceptInvitation,
    cancelInvitation,
    inviteByEmail,
    listMyInvitations,
    listWorkspaceInvitations,
    previewInvitation,
    resendInvitation,
} from "./invitationController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { invitationRateLimiter } from "../../middleware/rateLimit.js";

const router = express.Router();

router.post("/", authenticate, invitationRateLimiter, inviteByEmail);
router.get("/mine", authenticate, listMyInvitations);
router.get("/preview/:token", previewInvitation);
router.post("/:token/accept", authenticate, acceptInvitation);
router.delete("/:id", authenticate, cancelInvitation);
router.post("/:id/resend", authenticate, invitationRateLimiter, resendInvitation);
router.get("/workspace/:workspaceId", authenticate, listWorkspaceInvitations);

export default router;
