import express from "express";
import { createTag, deleteTag, listTags, updateTag } from "./tagController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/workspaces/:workspaceId/tags", authenticate, listTags);
router.post("/workspaces/:workspaceId/tags", authenticate, createTag);
router.patch("/tags/:id", authenticate, updateTag);
router.delete("/tags/:id", authenticate, deleteTag);

export default router;
