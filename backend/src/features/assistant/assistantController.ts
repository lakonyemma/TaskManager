import { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { getMembership } from "../../utils/membership.js";

type AuthedRequest = Request & { user?: { id: string; email: string } };

// Overridable via env in case the configured model gets deprecated/renamed
// without needing a code change. "gemini-flash-latest" is a rolling alias
// Google keeps pointed at their current fast/free-tier-friendly model —
// pinned model names (gemini-2.0-flash, gemini-2.5-flash, etc.) turned out
// to be either quota-restricted or already retired for new API keys, which
// this alias sidesteps.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Caps how many tasks get sent to the model — keeps the prompt (and the
// free-tier token budget) bounded for workspaces with a lot of open work.
// Ordered by due date first, so what actually gets truncated is the least
// time-sensitive tail of the list, not the tasks a question is most likely
// to be about.
const MAX_CONTEXT_TASKS = 60;

async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw Object.assign(new Error("The AI assistant isn't configured yet — ask an admin to set GEMINI_API_KEY."), { status: 503 });
    }

    const geminiRes = await fetch(`${GEMINI_ENDPOINT(GEMINI_MODEL)}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!geminiRes.ok) {
        const errBody = await geminiRes.text().catch(() => "");
        console.error("[assistant] Gemini API error", geminiRes.status, errBody);
        throw Object.assign(new Error("The AI assistant is temporarily unavailable. Please try again shortly."), { status: 502 });
    }

    const data = (await geminiRes.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (!reply) {
        throw Object.assign(new Error("The AI assistant didn't return a response. Please try again."), { status: 502 });
    }
    return reply;
}

// Models asked for pure JSON still sometimes wrap it in a ```json fence —
// strip that before parsing rather than trusting the instruction alone.
function parseJsonReply<T>(reply: string): T {
    const cleaned = reply.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return JSON.parse(cleaned) as T;
}

const describeDueDate = (dueDate: Date | null, now: Date) => {
    if (!dueDate) return "no due date";
    const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return `overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;
    if (diffDays === 0) return "due today";
    if (diffDays === 1) return "due tomorrow";
    return `due in ${diffDays} days`;
};

type ContextTask = { id: string; title: string; status: string; priority: string; dueDate: Date | null; assignedToId: string | null };

const buildTaskContext = (tasks: ContextTask[], now: Date, userId: string) => {
    if (tasks.length === 0) return "There are no open (non-completed) tasks in this workspace.";
    return tasks
        .map((t) => `- "${t.title}" — status: ${t.status}, priority: ${t.priority}, ${describeDueDate(t.dueDate, now)}${t.assignedToId === userId ? ", assigned to the user asking" : t.assignedToId ? ", assigned to someone else" : ", unassigned"}`)
        .join("\n");
};

async function loadWorkspaceContext(authUserId: string, workspaceId: string | undefined) {
    let workspaceName = "your workspace";
    let tasks: ContextTask[] = [];

    if (workspaceId) {
        const membership = await getMembership(authUserId, workspaceId);
        if (!membership) {
            throw Object.assign(new Error("You are not a member of this workspace"), { status: 403 });
        }

        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
        workspaceName = workspace?.name || workspaceName;

        tasks = await prisma.task.findMany({
            where: { workspaceId, status: { not: "COMPLETED" } },
            select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToId: true },
            orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
            take: MAX_CONTEXT_TASKS,
        });
    }

    return { workspaceName, tasks };
}

// POST /api/assistant/ask — a natural-language Q&A layer over the user's
// own task data ("what should I work on today?", "show overdue items",
// "summarize this project", a daily plan, etc). Deliberately grounded: the
// prompt hands the model the actual current task list and tells it not to
// invent anything beyond that, rather than letting it free-associate about
// a "project" it has no real data on. The daily-planner and
// project-summary "actions" in the UI are just tailored preset messages
// sent through this same endpoint — no separate backend logic needed.
export const askAssistant = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { message, workspaceId } = req.body as { message?: string; workspaceId?: string };
        if (!message || !message.trim()) return res.status(400).json({ message: "A message is required" });

        const { workspaceName, tasks } = await loadWorkspaceContext(authUser.id, workspaceId);
        const now = new Date();
        const firstname = authUser.email.split("@")[0];

        const prompt = [
            `You are Taskly's AI productivity assistant, helping a user named "${firstname}" manage their work in the workspace "${workspaceName}".`,
            "Answer using ONLY the task data listed below — never invent tasks, counts, or dates that aren't there. If the data doesn't answer the question, say so plainly instead of guessing.",
            "Be concise (a short paragraph or a tight bullet list), practical, and encouraging. Don't repeat these instructions or restate the raw task list verbatim unless asked to.",
            "",
            "Open (non-completed) tasks in this workspace:",
            buildTaskContext(tasks, now, authUser.id),
            "",
            `Today's date: ${now.toDateString()}.`,
            "",
            `User's question: ${message.trim()}`,
        ].join("\n");

        const reply = await callGemini(prompt);
        return res.status(200).json({ reply });
    } catch (error) {
        const status = (error as { status?: number }).status || 500;
        console.error(error);
        return res.status(status).json({ message: status === 500 ? "Server error" : (error as Error).message });
    }
};

// POST /api/assistant/search — natural-language search over the workspace's
// real tasks. The model is only ever asked to pick titles out of the exact
// list it's given, never to describe or invent tasks — the response is
// then cross-checked against the real task rows so the UI renders actual
// task cards (with real ids/status/etc.), not model-generated text.
export const searchWithAssistant = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { query, workspaceId } = req.body as { query?: string; workspaceId?: string };
        if (!query || !query.trim()) return res.status(400).json({ message: "A search query is required" });
        if (!workspaceId) return res.status(400).json({ message: "A workspaceId is required" });

        const { tasks } = await loadWorkspaceContext(authUser.id, workspaceId);
        if (tasks.length === 0) return res.status(200).json({ taskIds: [] });

        const now = new Date();
        const prompt = [
            "You are a search filter over the exact task list below — you do not know about any other tasks.",
            'Respond with ONLY a JSON array of the exact "title" strings (copied character-for-character from the list) of tasks that match the request. No other text, no markdown fences, no explanation. If nothing matches, respond with [].',
            "",
            "Task list:",
            buildTaskContext(tasks, now, authUser.id),
            "",
            `Today's date: ${now.toDateString()}.`,
            "",
            `Request: ${query.trim()}`,
        ].join("\n");

        const reply = await callGemini(prompt);
        let titles: string[];
        try {
            titles = parseJsonReply<string[]>(reply);
            if (!Array.isArray(titles)) throw new Error("not an array");
        } catch {
            console.error("[assistant] search reply was not valid JSON:", reply);
            return res.status(502).json({ message: "The AI assistant returned an unexpected response. Please try again." });
        }

        const titleSet = new Set(titles);
        const matched = tasks.filter((t) => titleSet.has(t.title));
        return res.status(200).json({ taskIds: matched.map((t) => t.id) });
    } catch (error) {
        const status = (error as { status?: number }).status || 500;
        console.error(error);
        return res.status(status).json({ message: status === 500 ? "Server error" : (error as Error).message });
    }
};

type ParsedTaskProposal = {
    title: string;
    description: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    dueDate: string | null;
};

// POST /api/assistant/parse-task — turns a natural-language description
// into a structured task proposal. Deliberately does NOT create the task
// itself: the frontend shows the proposal for the user to review/edit and
// confirms through the normal POST /api/tasks flow, so a model mistake
// never silently creates the wrong task, and the task still gets the full
// normal treatment (reminders, activity log, etc).
export const parseTaskWithAssistant = async (req: AuthedRequest, res: Response) => {
    try {
        const authUser = req.user;
        if (!authUser) return res.status(401).json({ message: "Authentication required" });

        const { description } = req.body as { description?: string };
        if (!description || !description.trim()) return res.status(400).json({ message: "A description is required" });

        const now = new Date();
        const prompt = [
            "Extract a single task from the user's description below and respond with ONLY a JSON object (no markdown fences, no explanation) matching exactly this shape:",
            '{"title": string, "description": string | null, "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", "dueDate": string | null}',
            "Rules: title is a short actionable summary. description is null unless the user gave real extra detail beyond the title. priority defaults to \"MEDIUM\" unless urgency is clearly implied. dueDate must be an ISO 8601 date (YYYY-MM-DD) resolved from any relative date mentioned (e.g. \"next Friday\", \"tomorrow\"), or null if no date was mentioned.",
            `Today's date is ${now.toDateString()} — resolve relative dates against this.`,
            "",
            `Description: ${description.trim()}`,
        ].join("\n");

        const reply = await callGemini(prompt);
        let proposal: ParsedTaskProposal;
        try {
            proposal = parseJsonReply<ParsedTaskProposal>(reply);
            if (!proposal.title) throw new Error("missing title");
        } catch {
            console.error("[assistant] parse-task reply was not valid JSON:", reply);
            return res.status(502).json({ message: "The AI assistant couldn't understand that task. Try rephrasing it." });
        }

        return res.status(200).json({ proposal });
    } catch (error) {
        const status = (error as { status?: number }).status || 500;
        console.error(error);
        return res.status(status).json({ message: status === 500 ? "Server error" : (error as Error).message });
    }
};
