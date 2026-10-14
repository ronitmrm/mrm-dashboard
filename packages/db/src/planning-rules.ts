import { productionShiftAt } from "./production-session-domain";

const plantDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

export function planningProductionDate(productionFloorCode: string | undefined, instant = new Date()) {
  return productionShiftAt(productionFloorCode ?? "", instant)?.productionDate ?? plantDate.format(instant);
}

export function machineTypeForFamily(
  rows: readonly Record<string, unknown>[],
  family: unknown
) {
  const key = String(family ?? "").trim().toLowerCase()
  if (!key) return ""
  const types = new Map<string, string>()
  for (const row of rows) {
    if (String(row.machineFamily ?? "").trim().toLowerCase() !== key) continue
    const type = String(row.machineType ?? "").trim()
    types.set(type.toLowerCase(), type)
  }
  return types.size === 1 ? [...types.values()][0]! : ""
}

export function formatPlanningFinish(date: unknown, workingHours: unknown) {
  const label = String(date ?? "").trim()
  if (!label) return "-"
  if (typeof workingHours !== "number" || !Number.isFinite(workingHours)) return label
  const minutes = Math.round(Math.max(0, workingHours) * 60)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${label} · ${hours}h${remainder ? ` ${remainder}m` : ""} into working day`
}

export type SourcePlannerDecision = Record<string, unknown> & {
  createdAt: string;
  source: "source-workbook";
  sourceWorkbook: string;
  sourceSheet: string;
  sourceRow: number;
};

export const sourcePlannerDecisions = {
  routeSelections: [] as SourcePlannerDecision[],
  plannerPriorities: [] as SourcePlannerDecision[],
  machineConstraints: [] as SourcePlannerDecision[],
  planOverrides: [] as SourcePlannerDecision[],
  routeChanges: [] as SourcePlannerDecision[],
  setupCompletions: [] as SourcePlannerDecision[],
};

const closedPlannerStatuses = new Set(["closed", "resolved", "cancelled", "canceled", "available", "inactive"]);
const priorityScores = new Map([
  ["urgent", 100],
  ["top", 100],
  ["critical", 100],
  ["today", 100],
  ["now", 100],
  ["high", 75],
  ["h", 75],
  ["medium", 50],
  ["med", 50],
  ["m", 50],
  ["normal", 50],
  ["low", 25],
  ["l", 25],
]);
const planningHolidayWeekdays = new Set([5]);

export function machineFamilyMatches(routeFamily: unknown, explicitFamily: unknown) {
  const family = text(explicitFamily).toLowerCase();
  return Boolean(family && text(routeFamily).toLowerCase() === family);
}

export function machineMasterFamily(row: Record<string, unknown>) {
  return text(row.machineFamily) || text(row["MACHINE FAMILY"]) || text(row["Machine Family"]);
}

export function isActivePlannerDecision(status: unknown) {
  const normalized = text(status).toLowerCase();
  return !normalized || !closedPlannerStatuses.has(normalized);
}

export function validConfirmedPrioritySetupNumbers(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const setupNumbers = value.map((entry) => String(entry).trim());
  if (setupNumbers.some((entry) => !entry || !Number.isFinite(Number(entry)))) return null;
  for (let index = 1; index < setupNumbers.length; index += 1) {
    if (Number(setupNumbers[index]) <= Number(setupNumbers[index - 1])) return null;
  }
  return setupNumbers;
}

export function workOrderIdentityMatches(
  existing: { itemId: string; workOrderNumber: string },
  requested: { itemId: string; workOrderNumber: string }
) {
  return (
    existing.itemId.trim().toLowerCase() === requested.itemId.trim().toLowerCase() &&
    existing.workOrderNumber.trim().toLowerCase() === requested.workOrderNumber.trim().toLowerCase()
  );
}

export function normalizeRescheduleAction(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (["delay", "delay plan", "delay_on_machine", "delay on machine"].includes(normalized)) return "delay";
  if (["shift full plan", "shift_all", "full", "move all", "shift all"].includes(normalized)) return "shift_all";
  return "shift_required";
}

export function rescheduleActionLabel(value: unknown) {
  return {
    delay: "Delay plan",
    shift_all: "Shift full plan",
    shift_required: "Shift only compulsory parts",
  }[normalizeRescheduleAction(value)];
}

export function priorityScore(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return 0;
  const fixedScore = priorityScores.get(normalized);
  if (fixedScore !== undefined) return fixedScore;
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 0) return Math.max(0, 100 - numberValue);
  return 50;
}

export function priorityLabel(value: unknown) {
  return text(value) || "Normal";
}

export function isWorkingFriday(row: Record<string, unknown>) {
  return text(row.dayType).toLowerCase() === "working friday";
}

export function planningCalendarScope(value: unknown) {
  const scope = text(value).toLowerCase() || "factory";
  if (!["factory", "cnc", "conventional", "conventional-02", "forging"].includes(scope))
    throw new RangeError("Choose Whole Factory or a production unit.");
  return scope;
}

export function planningCalendarShift(value: unknown, scope: string) {
  const shift = text(value) || "All";
  const allowed = scope === "cnc" ? ["All", "A", "B", "C"]
    : scope === "factory" ? ["All", "A", "B", "C", "General"] : ["All", "General"];
  if (!allowed.includes(shift)) throw new RangeError("Choose a shift used by the selected unit.");
  return shift;
}

// Dates supplied here are ISO Production Dates, including overnight CNC Shift C.
export function planningCalendarExceptions(rows: Record<string, unknown>[], floor: string) {
  const shifts = floor === "cnc" ? ["A", "B", "C"] : ["General"];
  const closed = new Map<string, Set<string>>();
  const workingDates = new Set<string>();
  for (const row of rows) {
    const scope = text(row.calendarScope) || "factory";
    if (scope !== "factory" && scope !== floor) continue;
    const date = text(row.date);
    if (!date) continue;
    if (isWorkingFriday(row)) {
      workingDates.add(date);
      continue;
    }
    const shift = text(row.shift) || "All";
    const stopped = closed.get(date) ?? new Set<string>();
    for (const selected of shifts) {
      if (shift === "All" || shift === selected) stopped.add(selected);
    }
    if (stopped.size) closed.set(date, stopped);
  }
  const holidayDates = new Set<string>();
  const capacityFractions: Record<string, number> = {};
  for (const [date, stopped] of closed) {
    const fraction = (shifts.length - stopped.size) / shifts.length;
    capacityFractions[date] = fraction;
    if (!fraction) holidayDates.add(date);
  }
  return { holidayDates, workingDates, capacityFractions };
}

export function isPlanningWorkday(value: Date, workingFriday = false) {
  return workingFriday || !planningHolidayWeekdays.has(value.getDay());
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}
