import express from "express";
import {
    createAnnouncement, disableWorkspace, enableWorkspace, getAnalytics, getHealth,
    listAllAuditLogs, listAnnouncements, listUsers, listWorkspaces, reactivateUser, suspendUser,
} from "./adminController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin.js";

const router = express.Router();

// Every route here requires both a valid session AND the platform-wide
// super admin flag — a workspace OWNER/ADMIN role grants none of this.
router.use(authenticate, requireSuperAdmin);

router.get("/users", listUsers);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/reactivate", reactivateUser);

router.get("/workspaces", listWorkspaces);
router.patch("/workspaces/:id/disable", disableWorkspace);
router.patch("/workspaces/:id/enable", enableWorkspace);

router.get("/analytics", getAnalytics);
router.get("/health", getHealth);

router.get("/announcements", listAnnouncements);
router.post("/announcements", createAnnouncement);

router.get("/audit-logs", listAllAuditLogs);

export default router;
