import test from "node:test";
import assert from "node:assert/strict";
import { classifyIncomingMail, waitingReplyConfidence } from "../src/features/mail/mailClassifier.js";

const NOW = new Date("2026-09-12T09:00:00.000Z");

test("classifies explicit email requests as action required", () => {
    const result = classifyIncomingMail("Please review the proposal", "Could you approve it when you have a moment?", NOW);
    assert.equal(result.actionable, true);
    assert.equal(result.kind, "ACTION_REQUIRED");
    assert.ok(result.confidence >= 68);
});

test("detects deadlines and extracts the due date", () => {
    const result = classifyIncomingMail("Assignment submission deadline", "Please submit by Monday at 2 PM.", NOW);
    assert.equal(result.actionable, true);
    assert.equal(result.kind, "DEADLINE");
    assert.ok(result.detectedDueAt instanceof Date);
});

test("does not turn newsletters and offers into tasks", () => {
    const result = classifyIncomingMail("Weekend sale - 30% discount", "Special offer. Unsubscribe any time.", NOW);
    assert.equal(result.actionable, false);
    assert.equal(result.kind, null);
});

test("does not promote ordinary informational mail without an action signal", () => {
    const result = classifyIncomingMail("Your monthly statement", "Your statement is now available to view online.", NOW);
    assert.equal(result.actionable, false);
});

test("waiting reply confidence increases as the wait gets longer", () => {
    assert.ok(waitingReplyConfidence(7) > waitingReplyConfidence(3));
    assert.ok(waitingReplyConfidence(30) <= 95);
});
