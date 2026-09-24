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

export function isPlanningWorkday(value: Date) {
  return !planningHolidayWeekdays.has(value.getDay());
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}
