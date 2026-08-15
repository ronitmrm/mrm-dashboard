import { dateSortValue } from "./dashboard-view-model";
import { nextCalendarDateLabel, priorityPlanWindow, type PriorityPlanWindow, type PriorityPlanWindowBlocker } from "./priority-plan-scenarios";

export type DashboardPayload = Record<string, unknown>;

type PriorityPlanBlocker = PriorityPlanWindowBlocker & {
  jcNo: string;
  itemCode: string;
  setupNo: string;
  machine: string;
  startDate: string;
  endDate: string;
  label: string;
  requiresApproval: boolean;
};

export type PriorityPlanStep = {
  key: string;
  jcNo: string;
  itemCode: string;
  setupNo: string;
  machine: string;
  startDate: string;
  endDate: string;
  blockers: PriorityPlanBlocker[];
};

export type PriorityPlanSetupReference = {
  targetSetupNo: string;
  jcNo: string;
  setupNo: string;
  machine: string;
};

export function priorityChangePlan(productionControl: DashboardPayload, partCode: string, jcNo: string): { steps: PriorityPlanStep[] } {
  const plannedRows = asArray(productionControl.machinePlanDetailRows).filter((row) => !shopFloorItemIsFinished(row));
  const targetPartKey = machineKey(partCode);
  const targetJcKey = machineKey(jcNo);
  const targetRows = plannedRows
    .filter((row) => !targetPartKey || machineKey(itemCode(row)) === targetPartKey)
    .filter((row) => !targetJcKey || machineKey(jobCardNumber(row)) === targetJcKey)
    .sort(jobCardSetupSort);

  return {
    steps: targetRows.map((targetRow) => {
      const targetMachine = machineValue(targetRow, "machine");
      const targetMachineKey = machineKey(targetMachine);
      const targetDate = dateSortValue(plannedSetupDate(targetRow));
      const blockers = plannedRows
        .filter((row) => priorityPlanRowKey(row) !== priorityPlanRowKey(targetRow))
        .filter((row) => machineKey(machineValue(row, "machine")) === targetMachineKey)
        .filter((row) => priorityPlanBlocksTarget(row, targetDate))
        .sort(machinePlanDisplaySort)
        .map(priorityPlanBlocker);
      return {
        key: priorityPlanRowKey(targetRow),
        jcNo: jobCardNumber(targetRow),
        itemCode: itemCode(targetRow),
        setupNo: displayValue(targetRow.setupNo),
        machine: targetMachine,
        startDate: displayValue(plannedSetupDate(targetRow)),
        endDate: displayValue(targetRow.plannedProductionEndDate || targetRow.endDate),
        blockers,
      };
    }),
  };
}

function priorityPlanStepWindow(
  step: PriorityPlanStep,
  selectedInterruptions: Record<string, boolean>,
  queueAfterKey?: string,
  minimumStartDate?: unknown,
) {
  return priorityPlanWindow({
    targetStartDate: step.startDate,
    targetEndDate: step.endDate,
    blockers: step.blockers,
    preemptedBlockerKeys: new Set(step.blockers
      .filter((blocker) => selectedInterruptions[blocker.key])
      .map((blocker) => blocker.key)),
    heldBlockerKeys: priorityPlanHeldBlockerKeys(step, queueAfterKey),
    minimumStartDate,
  });
}

export function priorityPlanStepWindows(
  steps: PriorityPlanStep[],
  selectedInterruptions: Record<string, boolean>,
  queueAfterByStep: Record<string, string> = {},
) {
  const windows = new Map<string, PriorityPlanWindow>();
  let minimumStartDate = "";
  for (const step of steps) {
    const window = priorityPlanStepWindow(step, selectedInterruptions, queueAfterByStep[step.key], minimumStartDate);
    windows.set(step.key, window);
    minimumStartDate = nextCalendarDateLabel(window.endDate);
  }
  return windows;
}

export function priorityPlanStepPreviewState(
  stepKey: string,
  confirmedSteps: Record<string, boolean>,
  activeStepKey: string,
) {
  if (confirmedSteps[stepKey]) {
    return { datesVisible: true, label: "Confirmed" } as const;
  }
  if (stepKey === activeStepKey) {
    return { datesVisible: true, label: "Editing" } as const;
  }
  return { datesVisible: false, label: "Waiting" } as const;
}

export function priorityPlanHeldBlockers(step: PriorityPlanStep, queueAfterKey?: string) {
  if (!queueAfterKey) return [];
  const queuedBlockers = step.blockers.filter((blocker) => blocker.state === "queued");
  const queueIndex = queuedBlockers.findIndex((blocker) => blocker.key === queueAfterKey);
  if (queueIndex < 0) return [];
  return queuedBlockers.slice(0, queueIndex + 1);
}

export function priorityPlanQueueBeforeSetups(
  steps: PriorityPlanStep[],
  queueAfterByStep: Record<string, string>,
): PriorityPlanSetupReference[] {
  const rows: PriorityPlanSetupReference[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    for (const blocker of priorityPlanHeldBlockers(step, queueAfterByStep[step.key])) {
      const reference = {
        targetSetupNo: step.setupNo,
        jcNo: blocker.jcNo,
        setupNo: blocker.setupNo,
        machine: blocker.machine,
      };
      const key = setupReferenceKey(reference);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(reference);
    }
  }
  return rows;
}

function priorityPlanHeldBlockerKeys(step: PriorityPlanStep, queueAfterKey?: string) {
  return new Set(priorityPlanHeldBlockers(step, queueAfterKey).map((blocker) => blocker.key));
}

function setupReferenceKey(reference: PriorityPlanSetupReference) {
  return [reference.targetSetupNo, reference.jcNo, reference.setupNo, reference.machine].map(machineKey).join("|");
}

function priorityPlanBlocksTarget(row: DashboardPayload, targetDate: number) {
  const state = priorityPlanBlockerState(row);
  if (state === "running" || state === "started_not_running") return true;
  const rowDate = dateSortValue(plannedSetupDate(row));
  return rowDate <= targetDate;
}

function priorityPlanBlocker(row: DashboardPayload): PriorityPlanBlocker {
  const state = priorityPlanBlockerState(row);
  return {
    key: priorityPlanRowKey(row),
    jcNo: jobCardNumber(row),
    itemCode: itemCode(row),
    setupNo: displayValue(row.setupNo),
    machine: machineValue(row, "machine"),
    startDate: displayValue(plannedSetupDate(row)),
    endDate: displayValue(row.plannedProductionEndDate || row.endDate),
    state,
    label: state === "running" ? "Running now" : state === "started_not_running" ? "Started, not running" : "Planned before target",
    requiresApproval: state === "running" || state === "started_not_running",
  };
}

function priorityPlanBlockerState(row: DashboardPayload): PriorityPlanBlocker["state"] {
  if (shopFloorItemIsCurrent(row)) return "running";
  const runningStatus = str(row.runningStatus).toLowerCase();
  const stageIndex = shopFloorStageIndex(str(row.shopFloorStage));
  if (runningStatus === "setup complete" || stageIndex >= 0) return "started_not_running";
  return "queued";
}

function priorityPlanRowKey(row: DashboardPayload) {
  return [jobCardNumber(row), itemCode(row), displayValue(row.optionNumber), displayValue(row.setupNo), machineValue(row, "machine")]
    .map(machineKey)
    .join("|");
}

function jobCardSetupSort(a: DashboardPayload, b: DashboardPayload) {
  return displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, { numeric: true })
    || shopFloorPlanSort(a, b);
}

function machinePlanDisplaySort(a: DashboardPayload, b: DashboardPayload) {
  return shopFloorDisplayBucket(a) - shopFloorDisplayBucket(b)
    || shopFloorPlanSort(a, b);
}

function shopFloorDisplayBucket(row: DashboardPayload) {
  if (shopFloorItemIsFinished(row)) return 2;
  if (shopFloorItemIsCurrent(row)) return 0;
  return 1;
}

function shopFloorPlanSort(a: DashboardPayload, b: DashboardPayload) {
  return dateSortValue(plannedSetupDate(a)) - dateSortValue(plannedSetupDate(b))
    || displayValue(a.setupNo).localeCompare(displayValue(b.setupNo), undefined, { numeric: true })
    || itemCode(a).localeCompare(itemCode(b), undefined, { numeric: true });
}

function shopFloorItemIsFinished(row: DashboardPayload) {
  return str(row.shopFloorStage) === "item_complete"
    || str(row.runningStatus).toLowerCase() === "complete";
}

function shopFloorItemIsCurrent(row: DashboardPayload) {
  return ["operator_started", "worker_start"].includes(str(row.shopFloorStage))
    || str(row.runningStatus).toLowerCase() === "running"
    || Number(row.rawRows) > 0
    || Number(row.rawOutputQty) > 0
    || Number(row.rawActualQty) > 0;
}

function shopFloorStageIndex(stage: string) {
  const normalizedStage = {
    shop_floor_rm: "raw_material_at_machine",
    tools_drawing: "presetting",
    qc_approval: "quality_approval",
    worker_start: "operator_started",
  }[stage] ?? stage;
  return [
    "raw_material_at_machine",
    "presetting",
    "setting",
    "quality_approval",
    "operator_started",
    "item_complete",
  ].findIndex((item) => item === normalizedStage);
}

function plannedSetupDate(row: DashboardPayload | undefined) {
  return row?.plannedProductionStartDate || row?.setupPlannedDate || row?.plannedDate;
}

function machineValue(row: DashboardPayload, type: "machine" | "machineType") {
  if (type === "machine") {
    return displayValue(row.machine || row.machineNo || row["MACHINE NO"] || row["M/C NO"] || row["MACHINE NO."]);
  }
  return displayValue(row.machineType || row["MACHINE TYPE"] || row.type || row.TYPE);
}

function jobCardNumber(row: DashboardPayload) {
  return displayValue(row.jcNo || row.JobCardNo || row.jobCard);
}

function itemCode(row: DashboardPayload) {
  return displayValue(row.partCode || row["PART CODE"] || row.itemCode);
}

function asArray(value: unknown): DashboardPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => item as DashboardPayload);
}

function displayValue(value: unknown) {
  const textValue = str(value);
  return textValue || "-";
}

function machineKey(value: unknown) {
  return str(value).toLowerCase();
}

function str(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}
