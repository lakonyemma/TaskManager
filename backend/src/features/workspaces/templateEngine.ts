// The template engine: the only place that turns a WorkspaceTemplate
// definition (templates.ts) into real database rows. workspaceController
// calls generateWorkspaceStructure and nothing else — it never touches
// prisma.boardColumn/tag/milestone/task directly for template generation,
// so a new template (or a change to an existing one) never requires
// touching this file or the controller, only templates.ts.
import prisma from "../../lib/prisma.js";
import { syncTaskReminders } from "../reminders/reminderService.js";
import { DEFAULT_BOARD_COLUMNS } from "../boardColumns/defaultColumns.js";
import type { WorkspaceTemplate } from "./templates.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type GeneratedWorkspaceStructure = {
    columns: { id: string; name: string; color: string; order: number; mapsToStatus: string }[];
    tags: { id: string; name: string; color: string }[];
    milestones: { id: string; name: string }[];
    tasks: { id: string; title: string }[];
};

// Builds a workspace's board, labels, milestones, and starter tasks from a
// template — or, for a blank workspace (`template` undefined), just the
// same four default board columns every workspace has always started with.
// Everything created here is a normal row: same tables, same relations,
// same onDelete/index behavior as anything a user creates by hand through
// the regular task/tag/milestone/column APIs, so it participates in every
// feature (drag, filter, comment, complete, etc.) identically from the
// moment it's created.
export const generateWorkspaceStructure = async (
    workspaceId: string,
    creatorUserId: string,
    template: WorkspaceTemplate | undefined,
): Promise<GeneratedWorkspaceStructure> => {
    const columnDefs = template
        ? template.columns.map((c, order) => ({ name: c.name, color: c.color, mapsToStatus: c.mapsToStatus, order }))
        : DEFAULT_BOARD_COLUMNS;

    // Every create below is independent of its siblings within the same
    // batch (a column doesn't need another column to exist first, etc.), so
    // each batch runs as one round of concurrent requests rather than N
    // sequential round-trips — the difference between ~5 batches and ~60+
    // serialized queries for a template this size.
    const columns = await Promise.all(columnDefs.map((def) => prisma.boardColumn.create({ data: { workspaceId, ...def } })));

    if (!template) {
        return { columns, tags: [], milestones: [], tasks: [] };
    }

    const columnsByName = new Map(columns.map((c) => [c.name, c.id]));
    const firstColumnId = columns[0]?.id ?? null;
    const now = Date.now();

    const [tags, milestones] = await Promise.all([
        Promise.all(template.tags.map((tagDef) => prisma.tag.create({ data: { workspaceId, name: tagDef.name, color: tagDef.color } }))),
        Promise.all(template.milestones.map((milestoneDef, order) => prisma.milestone.create({
            data: {
                workspaceId,
                name: milestoneDef.name,
                description: milestoneDef.description || null,
                dueDate: milestoneDef.dueInDays ? new Date(now + milestoneDef.dueInDays * DAY_MS) : null,
                order,
            },
        }))),
    ]);
    const tagsByName = new Map(tags.map((t) => [t.name, t.id]));
    const milestonesByName = new Map(milestones.map((m) => [m.name, m.id]));

    // Pass 1: create every task (plus its reminders, since those only need
    // that one task to already exist) — a task's dependsOnTitles may name a
    // task that appears later in the list, so nothing can be linked yet.
    const tasks = await Promise.all(template.tasks.map(async (taskDef) => {
        const tagIds = (taskDef.tagNames ?? []).map((n) => tagsByName.get(n)).filter((tagId): tagId is string => !!tagId);
        const columnId = (taskDef.columnName ? columnsByName.get(taskDef.columnName) : undefined) ?? firstColumnId;
        const milestoneId = taskDef.milestoneName ? (milestonesByName.get(taskDef.milestoneName) ?? null) : null;
        const dueDate = taskDef.dueInDays ? new Date(now + taskDef.dueInDays * DAY_MS) : null;

        const task = await prisma.task.create({
            data: {
                title: taskDef.title,
                description: taskDef.description,
                priority: taskDef.priority,
                workspaceId,
                assignedToId: creatorUserId,
                columnId,
                milestoneId,
                dueDate,
                ...(tagIds.length ? { tags: { connect: tagIds.map((tagId) => ({ id: tagId })) } } : {}),
            },
        });
        if (task.dueDate) await syncTaskReminders(task);
        return task;
    }));
    const taskIdByTitle = new Map(tasks.map((t) => [t.title, t.id]));

    // Pass 2: wire up dependencies now that every task in the template
    // exists. Titles are only ever resolved within this same template, so
    // an unrecognized one is dropped rather than treated as an error.
    await Promise.all(template.tasks.map((taskDef) => {
        if (!taskDef.dependsOnTitles?.length) return null;
        const taskId = taskIdByTitle.get(taskDef.title);
        if (!taskId) return null;
        const dependsOnIds = taskDef.dependsOnTitles
            .map((title) => taskIdByTitle.get(title))
            .filter((depId): depId is string => !!depId);
        if (!dependsOnIds.length) return null;
        return prisma.task.update({
            where: { id: taskId },
            data: { dependsOn: { connect: dependsOnIds.map((depId) => ({ id: depId })) } },
        });
    }));

    return { columns, tags, milestones, tasks };
};
