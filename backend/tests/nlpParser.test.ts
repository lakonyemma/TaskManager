import test from "node:test";
import assert from "node:assert/strict";
import { parseNaturalLanguageTask } from "../src/features/capture/nlpParser.js";

const NOW = new Date("2026-09-12T09:00:00.000Z");

test("smart capture infers deadline priority and duration", () => {
    const parsed = parseNaturalLanguageTask("Submit assignment tomorrow at 2pm high priority 90 minutes", NOW);

    assert.equal(parsed.title, "Submit assignment");
    assert.equal(parsed.priority, "HIGH");
    assert.equal(parsed.estimatedMinutes, 90);
    assert.ok(parsed.dueDate);
    assert.equal(new Date(parsed.dueDate!).getUTCHours(), 14);
});

test("smart capture converts hours to minutes", () => {
    const parsed = parseNaturalLanguageTask("Prepare presentation for 2 hours", NOW);
    assert.equal(parsed.title, "Prepare presentation");
    assert.equal(parsed.estimatedMinutes, 120);
});
