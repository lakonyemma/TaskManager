import * as chrono from "chrono-node";

type RecurrenceUnit = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Range = { start: number; end: number };

const UNIT_MAP: Record<string, RecurrenceUnit> = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };
const WEEKDAY_MAP: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

type RecurrenceMatch = { rule: RecurrenceUnit; interval: number; daysOfWeek: number[]; businessDaysOnly: boolean; matchedText: string };

type DurationMatch = { estimatedMinutes: number; matchedText: string };

// Chrono handles absolute/relative dates & times well, but has no concept of
// recurrence, priority, or work duration. Those are extracted separately and
// stripped from the final title alongside the date phrase.
const extractRecurrence = (lower: string): RecurrenceMatch | null => {
    let m = lower.match(/every\s+(weekday|business day)s?/);
    if (m) return { rule: "DAILY", interval: 1, daysOfWeek: [], businessDaysOnly: true, matchedText: m[0] };

    m = lower.match(/every\s+(\d+)\s+(day|week|month|year)s?/);
    if (m) return { rule: UNIT_MAP[m[2]], interval: parseInt(m[1], 10), daysOfWeek: [], businessDaysOnly: false, matchedText: m[0] };

    m = lower.match(/every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
    if (m) return { rule: "WEEKLY", interval: 1, daysOfWeek: [WEEKDAY_MAP[m[1]]], businessDaysOnly: false, matchedText: m[0] };

    m = lower.match(/\b(daily|every day)\b/);
    if (m) return { rule: "DAILY", interval: 1, daysOfWeek: [], businessDaysOnly: false, matchedText: m[0] };

    m = lower.match(/\b(weekly|every week)\b/);
    if (m) return { rule: "WEEKLY", interval: 1, daysOfWeek: [], businessDaysOnly: false, matchedText: m[0] };

    m = lower.match(/\b(monthly|every month)\b/);
    if (m) return { rule: "MONTHLY", interval: 1, daysOfWeek: [], businessDaysOnly: false, matchedText: m[0] };

    m = lower.match(/\b(yearly|annually|every year)\b/);
    if (m) return { rule: "YEARLY", interval: 1, daysOfWeek: [], businessDaysOnly: false, matchedText: m[0] };

    return null;
};

const extractPriority = (lower: string): { priority: Priority; matchedText: string } | null => {
    let m = lower.match(/\b(urgent|asap|critical|emergency)\b/);
    if (m) return { priority: "CRITICAL", matchedText: m[0] };

    m = lower.match(/\b(high priority|important)\b/);
    if (m) return { priority: "HIGH", matchedText: m[0] };

    m = lower.match(/\b(low priority|whenever|no rush)\b/);
    if (m) return { priority: "LOW", matchedText: m[0] };

    return null;
};

const extractDuration = (lower: string): DurationMatch | null => {
    const patterns = [
        /\b(?:for|takes?|duration\s*:?\s*)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|hours?|hrs?|hr)\b/,
        /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|hours?|hrs?|hr)\s*(?:of\s+work)?\b/,
    ];

    for (const pattern of patterns) {
        const match = lower.match(pattern);
        if (!match) continue;
        const amount = Number(match[1]);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const unit = match[2];
        const estimatedMinutes = unit.startsWith("h") ? Math.round(amount * 60) : Math.round(amount);
        if (estimatedMinutes < 5 || estimatedMinutes > 16 * 60) continue;
        return { estimatedMinutes, matchedText: match[0] };
    }

    return null;
};

const mergeRanges = (ranges: Range[]): Range[] => {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: Range[] = [];
    for (const r of sorted) {
        const last = merged[merged.length - 1];
        if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
        else merged.push({ ...r });
    }
    return merged;
};

const removeRanges = (text: string, ranges: Range[]): string => {
    let result = "";
    let cursor = 0;
    for (const r of mergeRanges(ranges)) {
        result += text.slice(cursor, r.start);
        cursor = Math.max(cursor, r.end);
    }
    result += text.slice(cursor);
    return result;
};

const cleanTitle = (raw: string): string => {
    let title = raw.replace(/\s+/g, " ").trim();
    title = title.replace(/^[,.\-–—]+|[,.\-–—]+$/g, "").trim();
    title = title.replace(/\b(at|on|by|every|for)\s*$/i, "").trim();
    title = title.replace(/^\s*(at|on|by)\b/i, "").trim();
    return title;
};

export type ParsedTask = {
    title: string;
    dueDate: string | null;
    hasExplicitTime: boolean;
    isRecurring: boolean;
    recurrenceRule: RecurrenceUnit | null;
    recurrenceInterval: number | null;
    recurrenceDaysOfWeek: number[];
    recurrenceBusinessDaysOnly: boolean;
    priority: Priority;
    estimatedMinutes: number | null;
    originalText: string;
};

export const parseNaturalLanguageTask = (text: string, referenceDate: Date = new Date()): ParsedTask => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    const chronoResults = chrono.parse(trimmed, referenceDate, { forwardDate: true });
    const dateResult = chronoResults[0] ?? null;

    const recurrence = extractRecurrence(lower);
    const priorityMatch = extractPriority(lower);
    const durationMatch = extractDuration(lower);

    const ranges: Range[] = [];
    if (dateResult) ranges.push({ start: dateResult.index, end: dateResult.index + dateResult.text.length });
    if (recurrence) {
        const idx = lower.indexOf(recurrence.matchedText);
        if (idx >= 0) ranges.push({ start: idx, end: idx + recurrence.matchedText.length });
    }
    if (priorityMatch) {
        const idx = lower.indexOf(priorityMatch.matchedText);
        if (idx >= 0) ranges.push({ start: idx, end: idx + priorityMatch.matchedText.length });
    }
    if (durationMatch) {
        const idx = lower.indexOf(durationMatch.matchedText);
        if (idx >= 0) ranges.push({ start: idx, end: idx + durationMatch.matchedText.length });
    }

    const title = cleanTitle(removeRanges(trimmed, ranges)) || trimmed;

    return {
        title,
        dueDate: dateResult ? dateResult.start.date().toISOString() : null,
        hasExplicitTime: dateResult ? dateResult.start.isCertain("hour") : false,
        isRecurring: !!recurrence,
        recurrenceRule: recurrence?.rule ?? null,
        recurrenceInterval: recurrence?.interval ?? null,
        recurrenceDaysOfWeek: recurrence?.daysOfWeek ?? [],
        recurrenceBusinessDaysOnly: recurrence?.businessDaysOnly ?? false,
        priority: priorityMatch?.priority ?? "MEDIUM",
        estimatedMinutes: durationMatch?.estimatedMinutes ?? null,
        originalText: trimmed,
    };
};
