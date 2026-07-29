import prisma from "../lib/prisma.js";
import type { Plan } from "../../generated/prisma/client.js";

// Lazily expires a subscription whose paid period has ended instead of
// relying on a cron job (there's no background-worker infra in this
// deployment) — every plan lookup is a natural checkpoint since almost
// every gated action reads the plan first.
const expireIfPastDue = async (subscription: { id: string; status: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean }) => {
    if (!subscription.currentPeriodEnd) return false;
    if (subscription.status === "EXPIRED" || subscription.status === "CANCELED") return false;
    if (subscription.currentPeriodEnd.getTime() > Date.now()) return false;

    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { key: "FREE" } });
    await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
            planId: freePlan.id,
            status: subscription.cancelAtPeriodEnd ? "CANCELED" : "EXPIRED",
            billingCycle: "MONTHLY",
            provider: null,
            providerSubscriptionId: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
        },
    });
    return true;
};

export const getWorkspacePlan = async (workspaceId: string): Promise<Plan> => {
    const subscription = await prisma.subscription.findUnique({
        where: { workspaceId },
        include: { plan: true },
    });
    if (subscription) {
        const expired = await expireIfPastDue(subscription);
        if (!expired) return subscription.plan;
        return prisma.plan.findUniqueOrThrow({ where: { key: "FREE" } });
    }

    // Workspaces should always have a subscription (created alongside the
    // workspace, backfilled by the seed script for older rows), but fall back
    // to the Free plan's limits rather than crashing if one is ever missing.
    return prisma.plan.findUniqueOrThrow({ where: { key: "FREE" } });
};

export const getMembership = (userId: string, workspaceId: string) =>
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });

export const workspaceLimitError = (message: string) => ({ message, upgradeRequired: true });

export const assertWithinTaskLimit = async (workspaceId: string) => {
    const plan = await getWorkspacePlan(workspaceId);
    if (plan.maxTasksPerWorkspace === null) return null;
    const count = await prisma.task.count({ where: { workspaceId } });
    if (count >= plan.maxTasksPerWorkspace) {
        return workspaceLimitError(`This workspace has reached its ${plan.maxTasksPerWorkspace}-task limit on the ${plan.name} plan.`);
    }
    return null;
};

export const assertWithinMemberLimit = async (workspaceId: string) => {
    const plan = await getWorkspacePlan(workspaceId);
    if (plan.maxWorkspaceMembers === null) return null;
    const [memberCount, pendingInviteCount] = await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId } }),
        prisma.workspaceInvitation.count({ where: { workspaceId, status: "PENDING" } }),
    ]);
    if (memberCount + pendingInviteCount >= plan.maxWorkspaceMembers) {
        return workspaceLimitError(
            plan.maxWorkspaceMembers === 1
                ? "Inviting members requires a Team plan."
                : `This workspace has reached its ${plan.maxWorkspaceMembers}-member limit on the ${plan.name} plan.`,
        );
    }
    return null;
};

export const assertWithinWorkspaceLimit = async (userId: string) => {
    // Personal workspace count is tracked per-user (a user's own Free/Premium
    // allowance), independent of any Team workspaces they belong to.
    const memberships = await prisma.workspaceMember.findMany({
        where: { userId, role: "OWNER" },
        select: { workspace: { select: { id: true, type: true } } },
    });
    const ownedPersonalWorkspaces = memberships.filter((m) => m.workspace.type === "PERSONAL");
    if (ownedPersonalWorkspaces.length === 0) return null;

    const plans = await Promise.all(ownedPersonalWorkspaces.map((m) => getWorkspacePlan(m.workspace.id)));
    const bestPlan = plans.find((p) => p.maxWorkspaces === null) || plans[0];
    if (bestPlan.maxWorkspaces === null) return null;
    if (ownedPersonalWorkspaces.length >= bestPlan.maxWorkspaces) {
        return workspaceLimitError(`You've reached the ${bestPlan.maxWorkspaces}-workspace limit on the ${bestPlan.name} plan.`);
    }
    return null;
};
