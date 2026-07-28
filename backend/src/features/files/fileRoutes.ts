import express from "express";
import { deleteFile, downloadFile, listFiles, uploadFile } from "./fileController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { upload } from "./storage.js";

const router = express.Router();

router.get("/", authenticate, listFiles);
router.post("/", authenticate, upload.single("file"), uploadFile);
router.get("/:id/download", authenticate, downloadFile);
router.delete("/:id", authenticate, deleteFile);

export default router;
