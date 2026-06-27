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

export function machineFamilyKey(value: unknown) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/^([A-Z]+)(\d)/);
  return match ? `${match[1]}${match[2]}`.toLowerCase() : normalized.toLowerCase();
}

export function machineCodeMatches(routeMachine: unknown, actualMachine: unknown) {
  const routeFamily = machineFamilyKey(routeMachine);
  const actualFamily = machineFamilyKey(actualMachine);
  return Boolean(routeFamily && actualFamily && routeFamily === actualFamily);
}

export function isActivePlannerDecision(status: unknown) {
  const normalized = text(status).toLowerCase();
  return !normalized || !closedPlannerStatuses.has(normalized);
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
