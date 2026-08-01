// Starter content applied when a workspace is created from a template —
// a handful of relevant tags plus a short, realistic first task list, so a
// new workspace doesn't open to a completely blank slate. Purely static
// config (no DB table) since nobody's asked to author custom templates yet;
// add an entry here to add a template.

export type WorkspaceTemplateTask = {
    title: string;
    description?: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    /** Due date offset in days from workspace creation, if any. */
    dueInDays?: number;
    /** Names of tags (below) to attach to this task. */
    tagNames?: string[];
};

export type WorkspaceTemplateTag = { name: string; color: string };

export type WorkspaceTemplate = {
    id: string;
    name: string;
    description: string;
    tags: WorkspaceTemplateTag[];
    tasks: WorkspaceTemplateTask[];
};

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
    {
        id: "software-development",
        name: "Software Development",
        description: "Plan, build, and ship a software project — from repo setup to launch.",
        tags: [
            { name: "Bug", color: "#f87171" },
            { name: "Feature", color: "#8b5cf6" },
            { name: "Backend", color: "#38bdf8" },
            { name: "Frontend", color: "#34d399" },
            { name: "DevOps", color: "#fbbf24" },
        ],
        tasks: [
            { title: "Set up project repository", description: "Initialize version control, branch strategy, and README.", priority: "HIGH", dueInDays: 2, tagNames: ["DevOps"] },
            { title: "Define coding standards", description: "Linting, formatting, and PR review conventions.", priority: "MEDIUM", dueInDays: 3, tagNames: ["DevOps"] },
            { title: "Design database schema", priority: "HIGH", dueInDays: 5, tagNames: ["Backend"] },
            { title: "Build core API endpoints", priority: "HIGH", dueInDays: 10, tagNames: ["Backend"] },
            { title: "Build main UI screens", priority: "HIGH", dueInDays: 12, tagNames: ["Frontend"] },
            { title: "Set up CI/CD pipeline", description: "Automated tests and deploys on every push.", priority: "MEDIUM", dueInDays: 7, tagNames: ["DevOps"] },
            { title: "Write API documentation", priority: "LOW", dueInDays: 14 },
        ],
    },
    {
        id: "school-projects",
        name: "School Projects",
        description: "Stay on top of research, group work, and deadlines for a class project.",
        tags: [
            { name: "Research", color: "#38bdf8" },
            { name: "Writing", color: "#8b5cf6" },
            { name: "Presentation", color: "#fbbf24" },
            { name: "Group Work", color: "#34d399" },
        ],
        tasks: [
            { title: "Choose project topic", priority: "HIGH", dueInDays: 2 },
            { title: "Research and gather sources", priority: "HIGH", dueInDays: 5, tagNames: ["Research"] },
            { title: "Create project outline", priority: "MEDIUM", dueInDays: 6, tagNames: ["Writing"] },
            { title: "Assign group roles", priority: "MEDIUM", dueInDays: 3, tagNames: ["Group Work"] },
            { title: "Write first draft", priority: "HIGH", dueInDays: 10, tagNames: ["Writing"] },
            { title: "Prepare presentation slides", priority: "MEDIUM", dueInDays: 13, tagNames: ["Presentation"] },
            { title: "Rehearse presentation", priority: "LOW", dueInDays: 14, tagNames: ["Presentation"] },
        ],
    },
    {
        id: "marketing-campaigns",
        name: "Marketing Campaigns",
        description: "Coordinate a campaign from strategy through launch and reporting.",
        tags: [
            { name: "Content", color: "#8b5cf6" },
            { name: "Social Media", color: "#38bdf8" },
            { name: "Design", color: "#fb923c" },
            { name: "Analytics", color: "#34d399" },
        ],
        tasks: [
            { title: "Define campaign goals & KPIs", priority: "HIGH", dueInDays: 2, tagNames: ["Analytics"] },
            { title: "Identify target audience", priority: "HIGH", dueInDays: 3 },
            { title: "Create content calendar", priority: "MEDIUM", dueInDays: 5, tagNames: ["Content"] },
            { title: "Design campaign creative assets", priority: "MEDIUM", dueInDays: 8, tagNames: ["Design"] },
            { title: "Schedule social media posts", priority: "MEDIUM", dueInDays: 9, tagNames: ["Social Media"] },
            { title: "Launch campaign", priority: "CRITICAL", dueInDays: 10 },
            { title: "Track & report performance", priority: "MEDIUM", dueInDays: 17, tagNames: ["Analytics"] },
        ],
    },
    {
        id: "personal-productivity",
        name: "Personal Productivity",
        description: "A lightweight setup for tracking goals, habits, and day-to-day errands.",
        tags: [
            { name: "Habit", color: "#34d399" },
            { name: "Goal", color: "#8b5cf6" },
            { name: "Errand", color: "#fbbf24" },
            { name: "Health", color: "#f87171" },
        ],
        tasks: [
            { title: "Set this week's top 3 goals", priority: "HIGH", dueInDays: 1, tagNames: ["Goal"] },
            { title: "Plan tomorrow's top priorities", priority: "MEDIUM", dueInDays: 1 },
            { title: "Daily 10-minute walk", priority: "LOW", dueInDays: 1, tagNames: ["Health"] },
            { title: "Review and declutter inbox", priority: "MEDIUM", dueInDays: 3, tagNames: ["Habit"] },
            { title: "Weekly review & planning", priority: "MEDIUM", dueInDays: 7, tagNames: ["Habit"] },
        ],
    },
    {
        id: "ngo-projects",
        name: "NGO Projects",
        description: "Run a community or nonprofit project — outreach, volunteers, and reporting.",
        tags: [
            { name: "Fundraising", color: "#fbbf24" },
            { name: "Outreach", color: "#38bdf8" },
            { name: "Volunteer", color: "#34d399" },
            { name: "Reporting", color: "#8b5cf6" },
        ],
        tasks: [
            { title: "Define project objectives & beneficiaries", priority: "HIGH", dueInDays: 3 },
            { title: "Create fundraising plan", priority: "HIGH", dueInDays: 7, tagNames: ["Fundraising"] },
            { title: "Recruit and onboard volunteers", priority: "MEDIUM", dueInDays: 10, tagNames: ["Volunteer"] },
            { title: "Community outreach & awareness", priority: "MEDIUM", dueInDays: 14, tagNames: ["Outreach"] },
            { title: "Track donations & expenses", priority: "MEDIUM", dueInDays: 21, tagNames: ["Fundraising"] },
            { title: "Prepare donor/impact report", priority: "MEDIUM", dueInDays: 30, tagNames: ["Reporting"] },
        ],
    },
];

export const findWorkspaceTemplate = (id: string | undefined | null) =>
    id ? WORKSPACE_TEMPLATES.find((t) => t.id === id) : undefined;
