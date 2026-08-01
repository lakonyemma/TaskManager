import express from "express";
import { createColumn, deleteColumn, listColumns, updateColumn } from "./boardColumnController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/workspaces/:workspaceId/board-columns", authenticate, listColumns);
router.post("/workspaces/:workspaceId/board-columns", authenticate, createColumn);
router.patch("/board-columns/:id", authenticate, updateColumn);
router.delete("/board-columns/:id", authenticate, deleteColumn);

export default router;
