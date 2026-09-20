import { parseSortableDate } from "./dashboard-view-model";
import { isPlanningWorkday } from "@workspace/db/planning-rules";

export type PriorityToolingReservation = {
  key: string;
  codes: string[];
  startDate: unknown;
  endDate: unknown;
};

type PriorityPlanBlockerState = "running" | "started_not_running" | "queued";

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
  heldBlockerKeys = new Set<string>(),
  minimumStartDate,
  holidays = [],
  toolingCapacity = {},
  toolingReservations = [],
}: {
  targetStartDate: unknown;
  targetEndDate: unknown;
  blockers: PriorityPlanWindowBlocker[];
  preemptedBlockerKeys?: Set<string>;
  heldBlockerKeys?: Set<string>;
  minimumStartDate?: unknown;
  holidays?: unknown[];
  toolingCapacity?: Record<string, number>;
  toolingReservations?: PriorityToolingReservation[];
}): PriorityPlanWindow {
  const targetStart = normalizedDate(targetStartDate);
  const targetEnd = normalizedDate(targetEndDate) ?? targetStart;
  if (!targetStart) return { startDate: "", endDate: "" };

  const holidayDates = new Set(holidays.map(normalizedDate).filter((date) => date !== undefined).map(Number));
  const workday = (date: Date) => isPlanningWorkday(date) && !holidayDates.has(Number(date));
  const nextWorkday = (date: Date) => {
    while (!workday(date)) date = addCalendarDays(date, 1);
    return date;
  };
  let durationDays = 0;
  for (let day = targetStart; day <= (targetEnd ?? targetStart); day = addCalendarDays(day, 1)) {
    if (workday(day)) durationDays += 1;
  }
  durationDays = Math.max(durationDays, 1);
  const parsedBlockers = blockers.map((blocker) => ({
    ...blocker,
    start: normalizedDate(blocker.startDate),
    end: normalizedDate(blocker.endDate) ?? normalizedDate(blocker.startDate),
  }));
  const preempted = parsedBlockers.filter((blocker) =>
    (blocker.state === "queued" && !heldBlockerKeys.has(blocker.key)) || preemptedBlockerKeys.has(blocker.key),
  );
  const notPreempted = parsedBlockers.filter((blocker) =>
    (blocker.state !== "queued" && !preemptedBlockerKeys.has(blocker.key)) || heldBlockerKeys.has(blocker.key),
  );
  const earliestPreemptedStart = minDate(...preempted.map((blocker) => blocker.start).filter(Boolean) as Date[]);
  const blockingEnd = maxDate(...notPreempted.map((blocker) => blocker.end).filter(Boolean) as Date[]);
  const earliestStart = minDate(targetStart, earliestPreemptedStart) ?? targetStart;
  let start = nextWorkday(maxDate(
    earliestStart,
    blockingEnd ? addCalendarDays(blockingEnd, 1) : undefined,
    normalizedDate(minimumStartDate),
  ) ?? targetStart);
  const releasedKeys = new Set(preempted.map((blocker) => blocker.key));
  const reservations = toolingReservations.filter((row) => !releasedKeys.has(row.key)).map((row) => ({
    ...row, start: normalizedDate(row.startDate), end: normalizedDate(row.endDate),
  }));
  if (Object.values(toolingCapacity).some((capacity) => !(capacity >= 1)) ||
    reservations.some((row) => row.codes.some((code) => code in toolingCapacity) && (!row.start || !row.end))) {
    return { startDate: "", endDate: "" };
  }
  let end = start;
  // Check the whole run, including reservations that begin after the candidate start.
  for (;;) {
    end = start;
    let conflictEnd: Date | undefined;
    for (let remaining = durationDays; remaining > 0; end = nextWorkday(addCalendarDays(end, 1))) {
      for (const [code, capacity] of Object.entries(toolingCapacity)) {
        const occupied = reservations.filter((row) => row.codes.includes(code) && row.start! <= end && row.end! >= end);
        if (occupied.length >= capacity) {
          conflictEnd = minDate(...occupied.map((row) => row.end));
          break;
        }
      }
      if (conflictEnd || --remaining === 0) break;
    }
    if (!conflictEnd) break;
    start = nextWorkday(addCalendarDays(conflictEnd, 1));
  }
  return { startDate: dateLabel(start), endDate: dateLabel(end) };
}

export function nextCalendarDateLabel(value: unknown) {
  const date = normalizedDate(value);
  return date ? dateLabel(addCalendarDays(date, 1)) : "";
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
