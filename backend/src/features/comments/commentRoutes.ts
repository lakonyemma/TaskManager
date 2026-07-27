import express from "express";
import { createComment, deleteComment, listComments } from "./commentController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/tasks/:taskId/comments", authenticate, listComments);
router.post("/tasks/:taskId/comments", authenticate, createComment);
router.delete("/comments/:id", authenticate, deleteComment);

export default router;
