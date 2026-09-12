import * as chrono from "chrono-node";

export type MailActionKind = "ACTION_REQUIRED" | "DEADLINE" | "WAITING_REPLY";

export type MailClassification = {
    actionable: boolean;
    kind: MailActionKind | null;
    confidence: number;
    detectedDueAt: Date | null;
    reason: string;
};

const PROMOTION_RE = /\b(unsubscribe|newsletter|sale|discount|offer|promo|promotion|coupon|deal|marketing preferences|view in browser)\b/i;
const ACTION_RE = /\b(action required|please|kindly|can you|could you|need you to|submit|complete|review|approve|confirm|respond|reply|send|provide|sign|pay|payment|invoice|register|upload|schedule|book|attend|fill|verify|update)\b/i;
const DEADLINE_RE = /\b(deadline|due|due date|by\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|before\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|no later than|expires?|closing date)\b/i;
const URGENT_RE = /\b(urgent|asap|immediately|important|final reminder|overdue)\b/i;

export const classifyIncomingMail = (
    subject: string,
    snippet: string,
    receivedAt = new Date(),
): MailClassification => {
    const text = `${subject}\n${snippet}`.replace(/\s+/g, " ").trim();

    if (!text || PROMOTION_RE.test(text)) {
        return { actionable: false, kind: null, confidence: 0, detectedDueAt: null, reason: "Promotional or non-action mail" };
    }

    const hasAction = ACTION_RE.test(text);
    const hasDeadlineSignal = DEADLINE_RE.test(text);
    const urgent = URGENT_RE.test(text);
    const parsedDate = chrono.parse(text, receivedAt, { forwardDate: true })[0]?.start?.date() ?? null;
    const detectedDueAt = hasDeadlineSignal ? parsedDate : null;

    if (hasDeadlineSignal && detectedDueAt) {
        let confidence = 78;
        if (hasAction) confidence += 10;
        if (urgent) confidence += 8;
        return {
            actionable: true,
            kind: "DEADLINE",
            confidence: Math.min(99, confidence),
            detectedDueAt,
            reason: "Message contains a deadline or due-date signal",
        };
    }

    if (hasAction) {
        let confidence = 68;
        if (urgent) confidence += 15;
        if (subject.includes("?")) confidence += 5;
        return {
            actionable: true,
            kind: "ACTION_REQUIRED",
            confidence: Math.min(95, confidence),
            detectedDueAt: parsedDate,
            reason: "Message asks for an action or response",
        };
    }

    return { actionable: false, kind: null, confidence: 20, detectedDueAt: null, reason: "No clear action signal" };
};

export const waitingReplyConfidence = (daysWaiting: number): number =>
    Math.min(95, 65 + Math.max(0, daysWaiting - 1) * 5);
