import express from "express";
import { createWorkspace, deleteWorkspace, listMembers, listWorkspaces, listWorkspaceTemplates, removeMember, updateMemberRole, updateWorkspace } from "./workspaceController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { enforceWorkspaceLimit } from "../../middleware/billingMiddleware.js";

const router = express.Router();

router.get("/", authenticate, listWorkspaces);
router.get("/templates", authenticate, listWorkspaceTemplates);
router.post("/", authenticate, enforceWorkspaceLimit, createWorkspace);
router.patch("/:workspaceId", authenticate, updateWorkspace);
router.delete("/:workspaceId", authenticate, deleteWorkspace);
router.get("/:workspaceId/members", authenticate, listMembers);
router.patch("/:workspaceId/members/:memberId", authenticate, updateMemberRole);
router.delete("/:workspaceId/members/:memberId", authenticate, removeMember);

export default router;
