import test from "node:test";
import assert from "node:assert/strict";
import {
    buildDeadlineRisks,
    buildTodayPlan,
    buildWeeklyReview,
    computeExecutionScore,
    selectNextAction,
    suggestSmartReschedule,
    type ExecutionTask,
} from "../src/features/execution/executionPlanner.js";

const NOW = new Date("2026-09-12T09:00:00.000Z");

const task = (overrides: Partial<ExecutionTask>): ExecutionTask => ({
    id: crypto.randomUUID(),
    title: "Task",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    completedAt: null,
    estimatedMinutes: 60,
    updatedAt: NOW,
    ...overrides,
});

test("today plan surfaces overdue work even when it exceeds daily capacity", () => {
    const overdue = task({
        title: "Overdue assignment",
        priority: "CRITICAL",
        dueDate: new Date("2026-09-11T16:00:00.000Z"),
        estimatedMinutes: 420,
    });
    const plan = buildTodayPlan([overdue], NOW, 360);

    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0].title, "Overdue assignment");
    assert.equal(plan.tasks[0].overflow, true);
    assert.equal(plan.overloaded, true);
});

test("waiting items do not consume today's execution capacity", () => {
    const waiting = task({
        title: "Waiting for API approval",
        isWaiting: true,
        dueDate: new Date("2026-09-12T12:00:00.000Z"),
        estimatedMinutes: 120,
    });
    const active = task({
        title: "Finish report",
        dueDate: new Date("2026-09-12T15:00:00.000Z"),
        estimatedMinutes: 90,
    });

    const plan = buildTodayPlan([waiting, active], NOW);
    assert.deepEqual(plan.tasks.map((item) => item.title), ["Finish report"]);
});

test("deadline risk detects overdue and combined workload pressure", () => {
    const risks = buildDeadlineRisks([
        task({ title: "Late", dueDate: new Date("2026-09-10T12:00:00.000Z") }),
        task({ title: "Heavy today", dueDate: new Date("2026-09-12T17:00:00.000Z"), estimatedMinutes: 240 }),
        task({ title: "Safe", dueDate: new Date("2026-09-20T17:00:00.000Z"), estimatedMinutes: 30 }),
    ], NOW, 360);

    assert.equal(risks.length, 2);
    assert.equal(risks[0].title, "Late");
    assert.equal(risks[0].level, "CRITICAL");
    assert.equal(risks[1].title, "Heavy today");
    assert.ok(risks[1].workloadPressurePercent >= 75);
});

test("next action explains why the highest ranked task comes first", () => {
    const plan = buildTodayPlan([
        task({ title: "Normal task", priority: "MEDIUM" }),
        task({ title: "Due today", dueDate: new Date("2026-09-12T17:00:00.000Z"), priority: "HIGH" }),
    ], NOW, 360);
    const nextAction = selectNextAction(plan, NOW);

    assert.equal(nextAction?.title, "Due today");
    assert.match(nextAction?.reason ?? "", /Due today/i);
});

test("smart reschedule skips a day that is already full", () => {
    const target = task({ title: "Move me", estimatedMinutes: 120, dueDate: new Date("2026-09-12T17:00:00.000Z") });
    const busyTomorrow = task({ title: "Tomorrow load", estimatedMinutes: 300, dueDate: new Date("2026-09-13T16:00:00.000Z") });
    const suggestion = suggestSmartReschedule(target, [target, busyTomorrow], NOW, 360);

    assert.equal(suggestion.dueDate.toISOString().slice(0, 10), "2026-09-14");
});

test("weekly review summarizes wins and next-week pressure", () => {
    const review = buildWeeklyReview([
        task({ status: "COMPLETED", title: "Finished", completedAt: new Date("2026-09-11T10:00:00.000Z"), dueDate: new Date("2026-09-11T18:00:00.000Z") }),
        task({ title: "Next", dueDate: new Date("2026-09-15T18:00:00.000Z"), estimatedMinutes: 180 }),
        task({ title: "Late", dueDate: new Date("2026-09-10T18:00:00.000Z") }),
    ], NOW, 360);

    assert.equal(review.completed, 1);
    assert.equal(review.overdueCarried, 1);
    assert.equal(review.dueNext7Days, 1);
    assert.equal(review.recentWins[0].title, "Finished");
});

test("execution score rewards recent on-time completion and penalizes overdue work", () => {
    const score = computeExecutionScore([
        task({
            status: "COMPLETED",
            completedAt: new Date("2026-09-11T10:00:00.000Z"),
            dueDate: new Date("2026-09-11T18:00:00.000Z"),
        }),
        task({
            status: "COMPLETED",
            completedAt: new Date("2026-09-10T10:00:00.000Z"),
            dueDate: new Date("2026-09-10T18:00:00.000Z"),
        }),
        task({ dueDate: new Date("2026-09-09T18:00:00.000Z") }),
    ], NOW);

    assert.equal(score.hasHistory, true);
    assert.equal(score.completedLast7Days, 2);
    assert.equal(score.onTimeRate, 100);
    assert.equal(score.consistencyDays, 2);
    assert.equal(score.overdueOpen, 1);
    assert.ok(score.score > 60 && score.score < 100);
});
