type DashboardPayload = Record<string, unknown>;

export type ShopFloorStatusPatch = {
  jcNo: string;
  partCode: string;
  optionNumber: string;
  setupNo: string;
  machine: string;
  stage: string;
  stageLabel?: string;
  doneBy?: string;
  worker?: string;
  remark?: string;
  completedAt?: string;
};

const stageLabels: Record<string, string> = {
  raw_material_at_machine: "Raw material at the machine",
  presetting: "Pre setting done",
  setting: "Setting done",
  quality_approval: "Quality approval",
  operator_started: "Operator assigned and machine started",
  item_complete: "Item complete",
};

export function shopFloorStatusPatchFromAction(path: string, body: Record<string, unknown>): ShopFloorStatusPatch | undefined {
  if (path !== "data-entry") return undefined;
  if (text(body.entryType) !== "shop_floor_status") return undefined;
  const payload = record(body.payload);
  const patch = {
    jcNo: text(payload.jcNo),
    partCode: text(payload.partCode),
    optionNumber: displayText(payload.optionNumber),
    setupNo: displayText(payload.setupNo),
    machine: displayText(payload.machine),
    stage: text(payload.stage),
    stageLabel: optionalText(payload.stageLabel),
    doneBy: optionalText(payload.doneBy),
    worker: optionalText(payload.worker),
    remark: optionalText(payload.remark),
    completedAt: optionalText(payload.completedAt),
  };
  return shopFloorStatusKey(patch) && patch.stage ? patch : undefined;
}

export function upsertShopFloorStatusPatch(current: ShopFloorStatusPatch[], patch: ShopFloorStatusPatch) {
  const patchKey = shopFloorStatusKey(patch);
  return [
    ...current.filter((item) => shopFloorStatusKey(item) !== patchKey),
    patch,
  ];
}

export function applyShopFloorStatusPatches(payload: DashboardPayload, patches: ShopFloorStatusPatch[]) {
  if (!patches.length) return payload;
  const productionControl = record(payload.productionControl);
  const rows = array(productionControl.machinePlanDetailRows);
  if (!rows.length) return payload;
  const patchesByKey = new Map(patches.map((patch) => [shopFloorStatusKey(patch), patch]));
  let changed = false;
  const patchedRows = rows.map((row) => {
    const rowRecord = record(row);
    const patch = patchesByKey.get(shopFloorStatusKey({
      jcNo: text(rowRecord.jcNo),
      partCode: text(rowRecord.partCode),
      optionNumber: displayText(rowRecord.optionNumber),
      setupNo: displayText(rowRecord.setupNo),
      machine: displayText(rowRecord.machine),
    }));
    if (!patch) return row;
    changed = true;
    return {
      ...rowRecord,
      shopFloorStage: patch.stage,
      shopFloorStageLabel: patch.stageLabel || stageLabels[patch.stage] || patch.stage,
      shopFloorDoneBy: patch.doneBy || "",
      shopFloorWorker: patch.worker || "",
      shopFloorRemark: patch.remark || "",
      shopFloorUpdatedAt: patch.completedAt || "",
      runningStatus: optimisticRunningStatus(patch.stage, rowRecord.runningStatus),
    };
  });
  if (!changed) return payload;
  return {
    ...payload,
    productionControl: {
      ...productionControl,
      machinePlanDetailRows: patchedRows,
    },
  };
}

function optimisticRunningStatus(stage: string, current: unknown) {
  if (stage === "item_complete") return "Complete";
  if (stage === "operator_started") return "Running";
  if (stage === "setting" || stage === "quality_approval") return "Setup complete";
  return current;
}

function shopFloorStatusKey(value: Pick<ShopFloorStatusPatch, "jcNo" | "partCode" | "optionNumber" | "setupNo" | "machine">) {
  const parts = [value.jcNo, value.partCode, value.optionNumber, value.setupNo, value.machine].map((part) => text(part).toLowerCase());
  return parts.every(Boolean) ? parts.join("|") : "";
}

function record(value: unknown): DashboardPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as DashboardPayload : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  const cleaned = text(value);
  return cleaned || undefined;
}

function displayText(value: unknown) {
  const cleaned = text(value);
  return cleaned && cleaned !== "-" ? cleaned : "";
}
