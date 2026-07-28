import { Request, Response, NextFunction } from "express";
import { getMembership, getWorkspacePlan } from "../utils/plan.js";
import type { Plan, WorkspaceRole } from "../../generated/prisma/client.js";

export type AuthedRequest = Request & {
    user?: { id: string; email: string };
    membership?: { id: string; role: WorkspaceRole; userId: string; workspaceId: string };
    workspacePlan?: Plan;
};

const getWorkspaceIdFromRequest = (req: Request): string | undefined => {
    const fromParams = req.params.workspaceId;
    if (fromParams) return Array.isArray(fromParams) ? fromParams[0] : fromParams;
    if (typeof req.body?.workspaceId === "string") return req.body.workspaceId;
    if (typeof req.query?.workspaceId === "string") return req.query.workspaceId;
    return undefined;
};

// Verifies the caller belongs to the workspace (from :workspaceId, body, or
// query) and, if roles are given, that their role is one of them. Attaches
// the membership to the request either way so handlers can read it without
// a second query.
export const requireWorkspaceRole = (...allowedRoles: WorkspaceRole[]) => {
    return async (req: AuthedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) return res.status(401).json({ message: "Authentication required" });

            const workspaceId = getWorkspaceIdFromRequest(req);
            if (!workspaceId) return res.status(400).json({ message: "Workspace id is required" });

            const membership = await getMembership(req.user.id, workspaceId);
            if (!membership) return res.status(403).json({ message: "You are not a member of this workspace" });

            if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
                return res.status(403).json({ message: `This action requires one of these roles: ${allowedRoles.join(", ")}` });
            }

            req.membership = membership;
            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error" });
        }
    };
};

// Loads the workspace's plan and 403s with an `upgradeRequired` flag if the
// named boolean feature flag isn't enabled — the frontend uses that flag to
// show an upgrade prompt instead of a generic error.
export const requirePlanFeature = (feature: keyof Plan) => {
    return async (req: AuthedRequest, res: Response, next: NextFunction) => {
        try {
            const workspaceId = getWorkspaceIdFromRequest(req);
            if (!workspaceId) return res.status(400).json({ message: "Workspace id is required" });

            const plan = await getWorkspacePlan(workspaceId);
            if (!plan[feature]) {
                return res.status(403).json({
                    message: "This feature requires a plan upgrade.",
                    upgradeRequired: true,
                    feature,
                });
            }
            req.workspacePlan = plan;
            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error" });
        }
    };
};

