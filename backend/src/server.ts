import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import authRoutes from "./features/auth/authRoutes.js";
import workspaceRoutes from "./features/workspaces/workspaceRoutes.js";
import taskRoutes from "./features/tasks/taskRoutes.js";
import notificationRoutes from "./features/notifications/notificationRoutes.js";
import reportRoutes from "./features/reports/reportRoutes.js";
import invitationRoutes from "./features/invitations/invitationRoutes.js";
import settingsRoutes from "./features/settings/settingsRoutes.js";
import activityRoutes from "./features/activity/activityRoutes.js";
import commentRoutes from "./features/comments/commentRoutes.js";
import fileRoutes from "./features/files/fileRoutes.js";
import exportRoutes from "./features/export/exportRoutes.js";
import pushRoutes from "./features/push/pushRoutes.js";
import reminderRoutes from "./features/reminders/reminderRoutes.js";
import { startReminderWorker } from "./features/reminders/reminderWorker.js";
import { startDigestWorker } from "./features/digest/digestWorker.js";
import achievementRoutes from "./features/achievements/achievementRoutes.js";
import insightsRoutes from "./features/insights/insightsRoutes.js";
import workloadRoutes from "./features/workload/workloadRoutes.js";
import captureRoutes from "./features/capture/captureRoutes.js";
import tagRoutes from "./features/tags/tagRoutes.js";
import savedViewRoutes from "./features/savedViews/savedViewRoutes.js";
import auditRoutes from "./features/audit/auditRoutes.js";
import searchRoutes from "./features/search/searchRoutes.js";
import focusRoutes from "./features/focus/focusRoutes.js";
import boardColumnRoutes from "./features/boardColumns/boardColumnRoutes.js";
import milestoneRoutes from "./features/milestones/milestoneRoutes.js";
import timeEntryRoutes from "./features/timeEntries/timeEntryRoutes.js";
import adminRoutes from "./features/admin/adminRoutes.js";
import assistantRoutes from "./features/assistant/assistantRoutes.js";
import { ensureAchievementsSeeded } from "./features/achievements/achievementService.js";
import { errorHandler } from "./shared/errorHandler.js";

dotenv.config();

const app = express();

// Render (and most PaaS hosts) put a reverse proxy in front of the app —
// without this, req.ip resolves to the proxy's internal address for every
// request, which breaks IP-based rate limiting (falls back to sharing one
// bucket across all users) and makes activity/session logging useless.
// `1` trusts exactly one hop, matching a single reverse proxy; harmless in
// local dev, where there's no proxy in front at all.
app.set("trust proxy", 1);

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
    res.json({
        success: true,
        message: "TaskManager API is running",
        endpoints: {
            authRegister: "/api/auth/register",
            authLogin: "/api/auth/login",
            workspaces: "/api/workspaces",
            tasks: "/api/tasks",
            notifications: "/api/notifications",
            reports: "/api/reports",
            push: "/api/push",
            reminders: "/api/reminders",
        },
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api", commentRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/achievements", achievementRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/workload", workloadRoutes);
app.use("/api/capture", captureRoutes);
app.use("/api", tagRoutes);
app.use("/api", savedViewRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/focus-sessions", focusRoutes);
app.use("/api", boardColumnRoutes);
app.use("/api", milestoneRoutes);
app.use("/api", timeEntryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/assistant", assistantRoutes);

app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startReminderWorker();
    startDigestWorker();
    ensureAchievementsSeeded().catch((error) => console.error("[achievements] Failed to seed catalog:", error));
});