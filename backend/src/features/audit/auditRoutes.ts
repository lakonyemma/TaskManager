import express from "express";
import { exportAuditLogs, listAuditLogs } from "./auditController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticate, listAuditLogs);
router.get("/export", authenticate, exportAuditLogs);

export default router;
