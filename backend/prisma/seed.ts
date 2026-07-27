import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Free plan limits are deliberately generous enough to let someone genuinely
// try Taskly (not a 1-task trial), while still creating real pressure to
// upgrade once they're doing more than solo list-keeping.
const PLANS = [
    {
        key: "FREE" as const,
        name: "Free",
        priceMonthlyCents: 0,
        priceAnnualCents: 0,
        maxWorkspaces: 3,
        maxTasksPerWorkspace: 50,
        maxWorkspaceMembers: 1,
        canUseKanban: false,
        canUseCalendar: false,
        canUseTimeline: false,
        canUseSubtasks: false,
        canUseRecurringTasks: false,
        canUseDependencies: false,
        canUseLabels: false,
        canUseAdvancedFilters: false,
        canUseAnalytics: false,
        canUseFileAttachments: false,
        canUseExport: false,
        canUseCustomDashboard: false,
        canUseEmailNotifications: false,
        canCreateTeamWorkspace: false,
    },
    {
        key: "PREMIUM" as const,
        name: "Premium",
        priceMonthlyCents: 800,
        priceAnnualCents: 8640, // $8 * 12 * 0.9, rounded to the cent
        maxWorkspaces: null,
        maxTasksPerWorkspace: null,
        maxWorkspaceMembers: 1,
        canUseKanban: true,
        canUseCalendar: true,
        canUseTimeline: true,
        canUseSubtasks: true,
        canUseRecurringTasks: true,
        canUseDependencies: true,
        canUseLabels: true,
        canUseAdvancedFilters: true,
        canUseAnalytics: true,
        canUseFileAttachments: true,
        canUseExport: true,
        canUseCustomDashboard: true,
        canUseEmailNotifications: true,
        canCreateTeamWorkspace: false,
    },
    {
        key: "TEAM" as const,
        name: "Team",
        priceMonthlyCents: 2000,
        priceAnnualCents: 21600, // $20 * 12 * 0.9
        maxWorkspaces: null,
        maxTasksPerWorkspace: null,
        maxWorkspaceMembers: null,
        canUseKanban: true,
        canUseCalendar: true,
        canUseTimeline: true,
        canUseSubtasks: true,
        canUseRecurringTasks: true,
        canUseDependencies: true,
        canUseLabels: true,
        canUseAdvancedFilters: true,
        canUseAnalytics: true,
        canUseFileAttachments: true,
        canUseExport: true,
        canUseCustomDashboard: true,
        canUseEmailNotifications: true,
        canCreateTeamWorkspace: true,
    },
];

async function main() {
    for (const plan of PLANS) {
        await prisma.plan.upsert({
            where: { key: plan.key },
            create: plan,
            update: plan,
        });
    }
    console.log(`Seeded ${PLANS.length} plans.`);

    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { key: "FREE" } });

    // Backfill: every workspace that predates the subscription system gets a
    // Free subscription so `Workspace.subscription` is never null in practice.
    const workspacesWithoutSubscription = await prisma.workspace.findMany({
        where: { subscription: null },
        select: { id: true },
    });

    for (const workspace of workspacesWithoutSubscription) {
        await prisma.subscription.create({
            data: {
                workspaceId: workspace.id,
                planId: freePlan.id,
                status: "ACTIVE",
                billingCycle: "MONTHLY",
            },
        });
    }
    console.log(`Backfilled ${workspacesWithoutSubscription.length} workspace(s) onto the Free plan.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
