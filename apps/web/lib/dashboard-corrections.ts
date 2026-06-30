export type CorrectionTargetRow = {
  targetTable: string;
  targetId: string;
  action: string;
  createdAt?: string;
};

export type CorrectableRow = {
  _id: unknown;
  createdAt?: string;
};

export type DataEntryCorrectionRow = CorrectableRow & {
  entryType: string;
  key?: string;
  payload?: unknown;
};

type WorkflowCorrectionStep = {
  id: string;
  setupKey: string;
  rank: number;
  cascadeAfterRank: number;
  createdAt?: string;
};

const activeCorrectionActions = new Set(["reverse", "replace", "close"]);

const setupLifecycleStageRanks = new Map([
  ["raw_material_at_machine", 0],
  ["presetting", 1],
  ["setting", 2],
  ["quality_approval", 3],
  ["operator_started", 4],
  ["item_complete", 5],
]);

const setupLifecycleStageAliases: Record<string, string> = {
  shop_floor_rm: "raw_material_at_machine",
  raw_material_at_machine: "raw_material_at_machine",
  tools_drawing: "presetting",
  presetting: "presetting",
  setting: "setting",
  qc_approval: "quality_approval",
  quality_approval: "quality_approval",
  worker_start: "operator_started",
  operator_started: "operator_started",
  item_complete: "item_complete",
};

const firstPieceInspectionRank = 2.5;

export function activeCorrectionTargetKeys(corrections: CorrectionTargetRow[]) {
  return new Set(corrections
    .filter((row) => activeCorrectionActions.has(row.action))
    .map((row) => `${row.targetTable}:${row.targetId}`));
}

export function dataEntryCorrectionTargetsWithWorkflowCascade(
  rows: DataEntryCorrectionRow[],
  correctionTargets: Set<string>,
  corrections: CorrectionTargetRow[] = [],
) {
  const expandedTargets = new Set(correctionTargets);
  const correctionCreatedAtByTarget = activeCorrectionCreatedAtByTarget(corrections);
  const workflowSteps = rows
    .map(workflowCorrectionStepForRow)
    .filter((step): step is WorkflowCorrectionStep => Boolean(step));
  const correctedSteps = workflowSteps.filter((step) => correctionTargets.has(`dataEntries:${step.id}`));

  for (const correctedStep of correctedSteps) {
    const correctionCreatedAt = correctionCreatedAtByTarget.get(`dataEntries:${correctedStep.id}`);
    for (const step of workflowSteps) {
      if (step.setupKey !== correctedStep.setupKey) continue;
      if (step.rank <= correctedStep.cascadeAfterRank) continue;
      if (isAfterCorrection(step.createdAt, correctionCreatedAt)) continue;
      expandedTargets.add(`dataEntries:${step.id}`);
    }
  }

  return expandedTargets;
}

export function latestUncorrectedRow<T extends CorrectableRow>(
  rows: T[],
  targetTable: string,
  correctionTargets: Set<string>,
) {
  return rows
    .filter((row) => !correctionTargets.has(`${targetTable}:${String(row._id)}`))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))
    .at(-1);
}

function workflowCorrectionStepForRow(row: DataEntryCorrectionRow): WorkflowCorrectionStep | undefined {
  const entryType = cleanText(row.entryType);
  const payload = recordValue(row.payload);
  const setupKey = setupKeyForWorkflowRow(row, payload);
  if (!setupKey) return undefined;

  if (entryType === "first_piece_inspection_report") {
    return {
      id: String(row._id),
      setupKey,
      rank: firstPieceInspectionRank,
      cascadeAfterRank: setupLifecycleStageRanks.get("setting") ?? 2,
      createdAt: row.createdAt,
    };
  }

  if (entryType !== "shop_floor_status") return undefined;
  const stage = normalizeSetupLifecycleStage(textFrom(payload, "stage", "shopFloorStage"));
  const rank = setupLifecycleStageRanks.get(stage);
  if (rank === undefined) return undefined;

  return {
    id: String(row._id),
    setupKey,
    rank,
    cascadeAfterRank: rank,
    createdAt: row.createdAt,
  };
}

function activeCorrectionCreatedAtByTarget(corrections: CorrectionTargetRow[]) {
  const correctionCreatedAtByTarget = new Map<string, string | undefined>();
  for (const row of corrections) {
    if (!activeCorrectionActions.has(row.action)) continue;
    const targetKey = `${row.targetTable}:${row.targetId}`;
    const createdAt = cleanText(row.createdAt) || undefined;
    const current = correctionCreatedAtByTarget.get(targetKey);
    if (!correctionCreatedAtByTarget.has(targetKey) || !current || (createdAt && createdAt > current)) {
      correctionCreatedAtByTarget.set(targetKey, createdAt ?? current);
    }
  }
  return correctionCreatedAtByTarget;
}

function isAfterCorrection(rowCreatedAt: string | undefined, correctionCreatedAt: string | undefined) {
  return Boolean(rowCreatedAt && correctionCreatedAt && rowCreatedAt > correctionCreatedAt);
}

function setupKeyForWorkflowRow(row: DataEntryCorrectionRow, payload: Record<string, unknown>) {
  const payloadKey = setupKeyFromPayload(payload);
  if (payloadKey) return payloadKey;
  return setupKeyFromDataEntryKey(row.key);
}

function setupKeyFromPayload(payload: Record<string, unknown>) {
  const optionNumber = textFrom(payload, "optionNumber", "OPTION NUMBER", "OPTION NO");
  const parts = [
    canonicalKey(textFrom(payload, "jcNo", "JC NO.", "JC NO")),
    canonicalKey(textFrom(payload, "partCode", "partNo", "PART CODE", "PART NO")),
    canonicalKey(optionNumber),
    setupStepKey(textFrom(payload, "setupNo", "SETUP NO.", "SETUP NO", "SET UP"), optionNumber),
    canonicalKey(textFrom(payload, "machine", "machineNo", "M/C NO", "MACHINE NO", "MACHINE NO.")),
  ];
  return parts.every(Boolean) ? parts.join("|") : "";
}

function setupKeyFromDataEntryKey(key: unknown) {
  const parts = cleanText(key).split("|").map(canonicalKey).filter(Boolean);
  if (parts.at(-1) === "fpi") parts.pop();
  return parts.length >= 5 ? parts.slice(0, 5).join("|") : "";
}

function setupStepKey(setupNo: string, optionNumber: string) {
  const setupKey = canonicalKey(setupNo);
  const optionKey = canonicalKey(optionNumber);
  if (!setupKey) return "";
  const match = setupKey.match(/^(\d+)\.(\d+)$/);
  if (match && match[1] === optionKey) return match[2] ?? "";
  return setupKey;
}

function normalizeSetupLifecycleStage(stage: string) {
  return setupLifecycleStageAliases[stage] ?? "";
}

function textFrom(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function canonicalKey(value: unknown) {
  return cleanText(value).replace(/\s+/g, "").toLowerCase();
}
