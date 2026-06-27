import { parseSortableDate } from "./dashboard-view-model";

export type PriorityPlanBlockerState = "running" | "started_not_running" | "queued";

export type PriorityPlanWindowBlocker = {
  key: string;
  startDate: unknown;
  endDate: unknown;
  state: PriorityPlanBlockerState;
};

export type PriorityPlanWindow = {
  startDate: string;
  endDate: string;
};

export function priorityPlanWindow({
  targetStartDate,
  targetEndDate,
  blockers,
  preemptedBlockerKeys = new Set<string>(),
}: {
  targetStartDate: unknown;
  targetEndDate: unknown;
  blockers: PriorityPlanWindowBlocker[];
  preemptedBlockerKeys?: Set<string>;
}): PriorityPlanWindow {
  const targetStart = normalizedDate(targetStartDate);
  const targetEnd = normalizedDate(targetEndDate) ?? targetStart;
  if (!targetStart) return { startDate: displayText(targetStartDate), endDate: displayText(targetEndDate) };

  const durationDays = targetEnd && targetEnd >= targetStart ? daysBetween(targetStart, targetEnd) + 1 : 1;
  const parsedBlockers = blockers.map((blocker) => ({
    ...blocker,
    start: normalizedDate(blocker.startDate),
    end: normalizedDate(blocker.endDate) ?? normalizedDate(blocker.startDate),
  }));
  const preempted = parsedBlockers.filter((blocker) => blocker.state === "queued" || preemptedBlockerKeys.has(blocker.key));
  const notPreempted = parsedBlockers.filter((blocker) => blocker.state !== "queued" && !preemptedBlockerKeys.has(blocker.key));
  const earliestPreemptedStart = minDate(...preempted.map((blocker) => blocker.start).filter(Boolean) as Date[]);
  const blockingEnd = maxDate(...notPreempted.map((blocker) => blocker.end).filter(Boolean) as Date[]);
  const earliestStart = minDate(targetStart, earliestPreemptedStart) ?? targetStart;
  const start = maxDate(earliestStart, blockingEnd ? addCalendarDays(blockingEnd, 1) : undefined) ?? targetStart;
  const end = addCalendarDays(start, durationDays - 1);
  return { startDate: dateLabel(start), endDate: dateLabel(end) };
}

function normalizedDate(value: unknown) {
  const parsed = parseSortableDate(value);
  if (!parsed) return undefined;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addCalendarDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
}

function minDate(...values: Array<Date | undefined>) {
  return values.filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
}

function maxDate(...values: Array<Date | undefined>) {
  return values.filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
}

function dateLabel(value: Date) {
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
  return `${value.getDate()}-${monthShort[value.getMonth()]}-${String(value.getFullYear()).slice(2)}`;
}

function displayText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}
