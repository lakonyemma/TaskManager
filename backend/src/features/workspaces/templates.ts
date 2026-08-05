// The workspace template engine's data layer — every template Taskly ships
// is declared here as plain config (columns, labels, milestones, starter
// tasks, and the dependencies/milestone links between them). Nothing here
// touches the database; templateEngine.ts is what turns one of these
// definitions into real rows. Adding a template (or changing an existing
// one) never requires touching templateEngine.ts or workspaceController.ts
// — that's the whole point of keeping this a data table instead of
// hardcoded creation logic.

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BoardTaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED";

export type WorkspaceTemplateColumn = {
    name: string;
    color: string;
    /** Which of the four underlying statuses this column behaves as — see BoardColumn.mapsToStatus. */
    mapsToStatus: BoardTaskStatus;
};

export type WorkspaceTemplateTag = { name: string; color: string };

export type WorkspaceTemplateMilestone = {
    name: string;
    description?: string;
    /** Due date offset in days from workspace creation, if any. */
    dueInDays?: number;
};

export type WorkspaceTemplateTask = {
    title: string;
    description?: string;
    priority: TaskPriority;
    /** Due date offset in days from workspace creation, if any. */
    dueInDays?: number;
    /** Names of tags (below) to attach to this task. */
    tagNames?: string[];
    /** Which board column (by name) this task starts in — defaults to the template's first column. */
    columnName?: string;
    /** Which milestone (by name) this task counts toward, if any. */
    milestoneName?: string;
    /** Titles of other tasks *in this same template* that must complete before this one can. */
    dependsOnTitles?: string[];
};

export type WorkspaceTemplate = {
    id: string;
    name: string;
    description: string;
    columns: WorkspaceTemplateColumn[];
    tags: WorkspaceTemplateTag[];
    milestones: WorkspaceTemplateMilestone[];
    tasks: WorkspaceTemplateTask[];
};

// Shown next to the "Blank workspace" option, which isn't a real template
// entry (there's nothing to generate) — findWorkspaceTemplate(undefined)
// already means blank, so it's kept out of WORKSPACE_TEMPLATES rather than
// modeled as a template with empty arrays.
export const BLANK_WORKSPACE_DESCRIPTION = "Start with a completely empty workspace.";

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
    {
        id: "software-development",
        name: "Software Development",
        description: "Perfect for software teams using agile workflows, sprints, testing, and deployments.",
        columns: [
            { name: "Backlog", color: "#94a3b8", mapsToStatus: "TODO" },
            { name: "Sprint Planning", color: "#38bdf8", mapsToStatus: "TODO" },
            { name: "In Progress", color: "#8b5cf6", mapsToStatus: "IN_PROGRESS" },
            { name: "Code Review", color: "#fbbf24", mapsToStatus: "REVIEW" },
            { name: "Testing", color: "#fb923c", mapsToStatus: "REVIEW" },
            { name: "Done", color: "#34d399", mapsToStatus: "COMPLETED" },
        ],
        tags: [
            { name: "Bug", color: "#f87171" },
            { name: "Feature", color: "#8b5cf6" },
            { name: "Enhancement", color: "#34d399" },
            { name: "Documentation", color: "#38bdf8" },
            { name: "High Priority", color: "#fbbf24" },
        ],
        milestones: [
            { name: "Requirements Complete", dueInDays: 5 },
            { name: "MVP Complete", dueInDays: 20 },
            { name: "QA Complete", dueInDays: 28 },
            { name: "Production Release", dueInDays: 35 },
        ],
        tasks: [
            { title: "Gather Requirements", description: "Interview stakeholders and document what the product needs to do.", priority: "HIGH", dueInDays: 3, tagNames: ["Documentation"], milestoneName: "Requirements Complete" },
            { title: "Design UI/UX", description: "Wireframe and design the core screens.", priority: "HIGH", dueInDays: 7, tagNames: ["Feature"], milestoneName: "Requirements Complete", dependsOnTitles: ["Gather Requirements"] },
            { title: "Setup Frontend", description: "Scaffold the client app, routing, and build tooling.", priority: "MEDIUM", dueInDays: 10, tagNames: ["Feature"], milestoneName: "MVP Complete", dependsOnTitles: ["Design UI/UX"] },
            { title: "Setup Backend", description: "Scaffold the API server and project structure.", priority: "MEDIUM", dueInDays: 10, tagNames: ["Feature"], milestoneName: "MVP Complete", dependsOnTitles: ["Gather Requirements"] },
            { title: "Database Design", description: "Model the core entities and relationships.", priority: "HIGH", dueInDays: 9, tagNames: ["Feature", "High Priority"], milestoneName: "MVP Complete", dependsOnTitles: ["Gather Requirements"] },
            { title: "Authentication System", description: "Build sign-up, login, and session handling.", priority: "HIGH", dueInDays: 14, tagNames: ["Feature", "High Priority"], milestoneName: "MVP Complete", dependsOnTitles: ["Setup Backend", "Database Design"] },
            { title: "API Integration", description: "Connect the frontend to the backend's endpoints.", priority: "MEDIUM", dueInDays: 18, tagNames: ["Feature"], milestoneName: "MVP Complete", dependsOnTitles: ["Setup Backend", "Setup Frontend"] },
            { title: "Unit Testing", description: "Cover core logic with unit tests.", priority: "MEDIUM", dueInDays: 22, tagNames: ["Enhancement"], milestoneName: "QA Complete", dependsOnTitles: ["API Integration"] },
            { title: "Integration Testing", description: "Test the frontend and backend working together end-to-end.", priority: "MEDIUM", dueInDays: 26, tagNames: ["Enhancement"], milestoneName: "QA Complete", dependsOnTitles: ["Unit Testing"] },
            { title: "Deployment", description: "Ship to production and verify the release.", priority: "CRITICAL", dueInDays: 35, tagNames: ["High Priority"], milestoneName: "Production Release", dependsOnTitles: ["Integration Testing"] },
        ],
    },
    {
        id: "school-projects",
        name: "School Projects",
        description: "Ideal for students managing assignments, research, and academic projects.",
        columns: [
            { name: "Research", color: "#38bdf8", mapsToStatus: "TODO" },
            { name: "Planning", color: "#8b5cf6", mapsToStatus: "TODO" },
            { name: "Drafting", color: "#fbbf24", mapsToStatus: "IN_PROGRESS" },
            { name: "Review", color: "#fb923c", mapsToStatus: "REVIEW" },
            { name: "Submission", color: "#34d399", mapsToStatus: "COMPLETED" },
        ],
        tags: [
            { name: "Assignment", color: "#8b5cf6" },
            { name: "Research", color: "#38bdf8" },
            { name: "Group Work", color: "#34d399" },
            { name: "Presentation", color: "#fbbf24" },
            { name: "Exam", color: "#f87171" },
        ],
        milestones: [
            { name: "Proposal Approved", dueInDays: 4 },
            { name: "First Draft Complete", dueInDays: 10 },
            { name: "Final Draft Complete", dueInDays: 16 },
            { name: "Submission", dueInDays: 18 },
        ],
        tasks: [
            { title: "Choose Topic", description: "Pick a topic and get it signed off.", priority: "HIGH", dueInDays: 2, tagNames: ["Assignment"], milestoneName: "Proposal Approved" },
            { title: "Research Sources", description: "Gather references and reading material.", priority: "HIGH", dueInDays: 5, tagNames: ["Research"], milestoneName: "Proposal Approved", dependsOnTitles: ["Choose Topic"] },
            { title: "Create Outline", description: "Structure the sections before writing begins.", priority: "MEDIUM", dueInDays: 6, tagNames: ["Research"], milestoneName: "Proposal Approved", dependsOnTitles: ["Research Sources"] },
            { title: "Write First Draft", description: "Write a complete first pass.", priority: "HIGH", dueInDays: 10, tagNames: ["Assignment"], milestoneName: "First Draft Complete", dependsOnTitles: ["Create Outline"] },
            { title: "Peer Review", description: "Get feedback from a classmate or group member.", priority: "MEDIUM", dueInDays: 13, tagNames: ["Group Work"], milestoneName: "Final Draft Complete", dependsOnTitles: ["Write First Draft"] },
            { title: "Edit Final Draft", description: "Incorporate feedback and polish the writing.", priority: "HIGH", dueInDays: 16, tagNames: ["Assignment"], milestoneName: "Final Draft Complete", dependsOnTitles: ["Peer Review"] },
            { title: "Submit Project", description: "Turn in the finished project before the deadline.", priority: "CRITICAL", dueInDays: 18, tagNames: ["Assignment"], milestoneName: "Submission", dependsOnTitles: ["Edit Final Draft"] },
        ],
    },
    {
        id: "marketing-campaigns",
        name: "Marketing Campaigns",
        description: "Built for planning, publishing, and analyzing marketing campaigns.",
        columns: [
            { name: "Ideas", color: "#38bdf8", mapsToStatus: "TODO" },
            { name: "Content Creation", color: "#8b5cf6", mapsToStatus: "TODO" },
            { name: "Design", color: "#fb923c", mapsToStatus: "IN_PROGRESS" },
            { name: "Approval", color: "#fbbf24", mapsToStatus: "REVIEW" },
            { name: "Publishing", color: "#34d399", mapsToStatus: "IN_PROGRESS" },
            { name: "Analytics", color: "#a78bfa", mapsToStatus: "COMPLETED" },
        ],
        tags: [
            { name: "Social Media", color: "#38bdf8" },
            { name: "Email", color: "#8b5cf6" },
            { name: "SEO", color: "#34d399" },
            { name: "Paid Ads", color: "#f87171" },
            { name: "Content", color: "#fbbf24" },
        ],
        milestones: [
            { name: "Campaign Planning", dueInDays: 5 },
            { name: "Campaign Launch", dueInDays: 14 },
            { name: "Mid Campaign Review", dueInDays: 21 },
            { name: "Campaign Completion", dueInDays: 30 },
        ],
        tasks: [
            { title: "Define Campaign Goals", description: "Set measurable goals and KPIs for the campaign.", priority: "HIGH", dueInDays: 3, tagNames: ["Content"], milestoneName: "Campaign Planning" },
            { title: "Create Content Calendar", description: "Plan out what publishes and when.", priority: "MEDIUM", dueInDays: 6, tagNames: ["Content"], milestoneName: "Campaign Planning", dependsOnTitles: ["Define Campaign Goals"] },
            { title: "Design Creatives", description: "Produce the visual assets for the campaign.", priority: "MEDIUM", dueInDays: 10, tagNames: ["Content"], milestoneName: "Campaign Launch", dependsOnTitles: ["Create Content Calendar"] },
            { title: "Draft Campaign Content", description: "Write the copy for posts, emails, and ads.", priority: "MEDIUM", dueInDays: 11, tagNames: ["Content", "Social Media"], milestoneName: "Campaign Launch", dependsOnTitles: ["Create Content Calendar"] },
            { title: "Obtain Approval", description: "Get sign-off from stakeholders before publishing.", priority: "HIGH", dueInDays: 13, tagNames: ["Email"], milestoneName: "Campaign Launch", dependsOnTitles: ["Design Creatives", "Draft Campaign Content"] },
            { title: "Publish Campaign", description: "Launch across the chosen channels.", priority: "CRITICAL", dueInDays: 14, tagNames: ["Social Media", "Paid Ads"], milestoneName: "Campaign Launch", dependsOnTitles: ["Obtain Approval"] },
            { title: "Analyze Results", description: "Review performance against the original KPIs.", priority: "MEDIUM", dueInDays: 28, tagNames: ["SEO"], milestoneName: "Campaign Completion", dependsOnTitles: ["Publish Campaign"] },
        ],
    },
    {
        id: "personal-productivity",
        name: "Personal Productivity",
        description: "Organize your personal goals, habits, and daily activities.",
        columns: [
            { name: "Inbox", color: "#94a3b8", mapsToStatus: "TODO" },
            { name: "Today", color: "#8b5cf6", mapsToStatus: "TODO" },
            { name: "This Week", color: "#38bdf8", mapsToStatus: "TODO" },
            { name: "Goals", color: "#fbbf24", mapsToStatus: "IN_PROGRESS" },
            { name: "Completed", color: "#34d399", mapsToStatus: "COMPLETED" },
        ],
        tags: [
            { name: "Personal", color: "#8b5cf6" },
            { name: "Work", color: "#38bdf8" },
            { name: "Health", color: "#f87171" },
            { name: "Finance", color: "#34d399" },
            { name: "Learning", color: "#fbbf24" },
        ],
        milestones: [
            { name: "Weekly Goals Complete", dueInDays: 7 },
            { name: "Monthly Goals Complete", dueInDays: 30 },
            { name: "Quarterly Goals Complete", dueInDays: 90 },
        ],
        tasks: [
            { title: "Daily Planning", description: "Set your top priorities for the day.", priority: "MEDIUM", dueInDays: 1, tagNames: ["Personal"], milestoneName: "Weekly Goals Complete" },
            { title: "Weekly Review", description: "Look back on the week and plan the next one.", priority: "MEDIUM", dueInDays: 7, tagNames: ["Personal"], milestoneName: "Weekly Goals Complete", dependsOnTitles: ["Daily Planning"] },
            { title: "Monthly Review", description: "Check progress against your monthly goals.", priority: "MEDIUM", dueInDays: 30, tagNames: ["Work"], milestoneName: "Monthly Goals Complete", dependsOnTitles: ["Weekly Review"] },
            { title: "Personal Growth", description: "Spend time on a skill or habit you're building.", priority: "LOW", dueInDays: 14, tagNames: ["Learning"], milestoneName: "Monthly Goals Complete" },
            { title: "Exercise Goals", description: "Track your movement and fitness targets.", priority: "MEDIUM", dueInDays: 7, tagNames: ["Health"], milestoneName: "Weekly Goals Complete" },
            { title: "Budget Tracking", description: "Review spending against your budget.", priority: "MEDIUM", dueInDays: 30, tagNames: ["Finance"], milestoneName: "Monthly Goals Complete" },
        ],
    },
    {
        id: "ngo-projects",
        name: "NGO Projects",
        description: "Designed for NGOs managing community and donor-funded projects.",
        columns: [
            { name: "Planning", color: "#8b5cf6", mapsToStatus: "TODO" },
            { name: "Funding", color: "#fbbf24", mapsToStatus: "TODO" },
            { name: "Community Outreach", color: "#38bdf8", mapsToStatus: "IN_PROGRESS" },
            { name: "Implementation", color: "#fb923c", mapsToStatus: "IN_PROGRESS" },
            { name: "Monitoring", color: "#a78bfa", mapsToStatus: "REVIEW" },
            { name: "Completed", color: "#34d399", mapsToStatus: "COMPLETED" },
        ],
        tags: [
            { name: "Funding", color: "#fbbf24" },
            { name: "Outreach", color: "#38bdf8" },
            { name: "Volunteers", color: "#34d399" },
            { name: "Monitoring", color: "#a78bfa" },
            { name: "Reports", color: "#8b5cf6" },
        ],
        milestones: [
            { name: "Funding Secured", dueInDays: 14 },
            { name: "Project Launch", dueInDays: 21 },
            { name: "Midterm Evaluation", dueInDays: 45 },
            { name: "Final Evaluation", dueInDays: 90 },
        ],
        tasks: [
            { title: "Needs Assessment", description: "Assess community needs and intended beneficiaries.", priority: "HIGH", dueInDays: 5, tagNames: ["Reports"], milestoneName: "Funding Secured" },
            { title: "Budget Preparation", description: "Prepare the project budget for funders.", priority: "HIGH", dueInDays: 10, tagNames: ["Funding"], milestoneName: "Funding Secured", dependsOnTitles: ["Needs Assessment"] },
            { title: "Stakeholder Engagement", description: "Brief partners, donors, and community leaders.", priority: "MEDIUM", dueInDays: 12, tagNames: ["Outreach"], milestoneName: "Funding Secured", dependsOnTitles: ["Needs Assessment"] },
            { title: "Volunteer Recruitment", description: "Recruit and onboard volunteers for the project.", priority: "MEDIUM", dueInDays: 18, tagNames: ["Volunteers"], milestoneName: "Project Launch", dependsOnTitles: ["Budget Preparation"] },
            { title: "Community Outreach", description: "Run awareness and engagement activities on the ground.", priority: "MEDIUM", dueInDays: 21, tagNames: ["Outreach"], milestoneName: "Project Launch", dependsOnTitles: ["Stakeholder Engagement"] },
            { title: "Project Execution", description: "Carry out the planned activities.", priority: "HIGH", dueInDays: 45, tagNames: ["Monitoring"], milestoneName: "Midterm Evaluation", dependsOnTitles: ["Volunteer Recruitment", "Community Outreach"] },
            { title: "Impact Assessment", description: "Measure outcomes against the original goals.", priority: "MEDIUM", dueInDays: 90, tagNames: ["Reports", "Monitoring"], milestoneName: "Final Evaluation", dependsOnTitles: ["Project Execution"] },
        ],
    },
];

export const findWorkspaceTemplate = (id: string | undefined | null) =>
    id ? WORKSPACE_TEMPLATES.find((t) => t.id === id) : undefined;
