import express from "express";
import {
    acceptInvitation,
    cancelInvitation,
    inviteByEmail,
    listMyInvitations,
    listWorkspaceInvitations,
    previewInvitation,
} from "./invitationController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authenticate, inviteByEmail);
router.get("/mine", authenticate, listMyInvitations);
router.get("/preview/:token", previewInvitation);
router.post("/:token/accept", authenticate, acceptInvitation);
router.delete("/:id", authenticate, cancelInvitation);
router.get("/workspace/:workspaceId", authenticate, listWorkspaceInvitations);

export default router;
