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
import { errorHandler } from "./shared/errorHandler.js";

dotenv.config();

const app = express();

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

app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});