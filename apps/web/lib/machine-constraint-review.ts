export type MachineConstraintReviewRow = Record<string, unknown>;

export type MachineConstraintQueueReviewKind = "destination" | "same_machine_later" | "downstream";

export type MachineConstraintQueueReviewGroup = {
  kind: MachineConstraintQueueReviewKind;
  machine: string;
  title: string;
  description: string;
  rows: MachineConstraintReviewRow[];
  emptyMessage?: string;
};

export function machineConstraintQueueReview({
  plannedRows,
  machineRows,
  affectedRows,
  machineNo,
  rescheduleAction,
  explicitDestinationMachines,
  includeSameMachineLater = true,
  includeDownstream = true,
  maxRowsPerQueue = 8,
}: {
  plannedRows: MachineConstraintReviewRow[];
  machineRows: MachineConstraintReviewRow[];
  affectedRows: MachineConstraintReviewRow[];
  machineNo: string;
  rescheduleAction: string;
  explicitDestinationMachines?: string[];
  includeSameMachineLater?: boolean;
  includeDownstream?: boolean;
  maxRowsPerQueue?: number;
}): MachineConstraintQueueReviewGroup[] {
  const targetMachine = machineKey(machineNo);
  if (!targetMachine || !affectedRows.length) return [];

  const groups: MachineConstraintQueueReviewGroup[] = [];
  const added = new Set<string>();
  const affectedKeys = new Set(affectedRows.map(setupIdentityKey));

  function addGroup(group: MachineConstraintQueueReviewGroup) {
    const key = `${group.kind}:${machineKey(group.machine)}`;
    if (!group.machine || added.has(key)) return;
    added.add(key);
    groups.push(group);
  }

  if (machineKey(rescheduleAction) !== "delay") {
    const destinationMachines = explicitDestinationMachines?.length
      ? uniqueMachineValues(explicitDestinationMachines).filter((machine) => machineKey(machine) !== targetMachine)
      : compatibleDestinationMachines(affectedRows, machineRows, plannedRows, targetMachine);
    for (const machine of destinationMachines) {
      const queueRows = queueRowsForMachine(plannedRows, machine, affectedKeys, maxRowsPerQueue);
      addGroup({
        kind: "destination",
        machine,
        title: `${machine} destination queue`,
        description: "Compatible queue that can receive shifted or remaining quantity; rows here may move if this planner action is saved.",
        rows: queueRows,
        emptyMessage: "No current planned rows on this compatible machine.",
      });
    }
  }

  if (includeSameMachineLater) {
    const laterRows = plannedRows
      .filter((row) => machineKey(machineValue(row)) === targetMachine)
      .filter((row) => !affectedKeys.has(setupIdentityKey(row)))
      .filter((row) => rowStartSortValue(row) >= affectedWindowStart(affectedRows))
      .sort(machinePlanSort)
      .slice(0, maxRowsPerQueue);
    if (laterRows.length) {
      addGroup({
        kind: "same_machine_later",
        machine: displayMachine(machineNo),
        title: `${displayMachine(machineNo)} later queue`,
        description: "Later rows on the unavailable machine can be delayed if locked work must wait for the machine to return.",
        rows: laterRows,
      });
    }
  }

  if (includeDownstream) {
    for (const machine of downstreamMachines(affectedRows, plannedRows, targetMachine)) {
      const rows = downstreamRowsForMachine(affectedRows, plannedRows, machine, maxRowsPerQueue);
      addGroup({
        kind: "downstream",
        machine,
        title: `${machine} downstream setup queue`,
        description: "Later setups for affected job cards may move because WIP availability changes after this planner action.",
        rows,
      });
    }
  }

  return groups.sort((left, right) => groupRank(left.kind) - groupRank(right.kind) || left.machine.localeCompare(right.machine, undefined, { numeric: true }));
}

export function compatibleDestinationMachineOptions({
  affectedRows,
  machineRows,
  plannedRows,
  sourceMachine,
}: {
  affectedRows: MachineConstraintReviewRow[];
  machineRows: MachineConstraintReviewRow[];
  plannedRows: MachineConstraintReviewRow[];
  sourceMachine: string;
}) {
  return compatibleDestinationMachines(affectedRows, machineRows, plannedRows, machineKey(sourceMachine));
}

function compatibleDestinationMachines(
  affectedRows: MachineConstraintReviewRow[],
  machineRows: MachineConstraintReviewRow[],
  plannedRows: MachineConstraintReviewRow[],
  targetMachine: string,
) {
  const machines = new Set<string>();
  for (const affected of affectedRows) {
    const routeMachine = rowText(affected, "routeMachine");
    const machineType = rowText(affected, "machineType");
    for (const row of machineRows) {
      if (!machineRowIsActive(row)) continue;
      const machine = machineValue(row);
      const key = machineKey(machine);
      if (!key || key === targetMachine) continue;
      const rowType = rowText(row, "machineType", "type", "TYPE", "MACHINE TYPE");
      if (machineCodeMatches(routeMachine, machine) && machineTypeCompatible(machineType, rowType)) machines.add(machine);
    }
    for (const row of plannedRows) {
      const machine = machineValue(row);
      const key = machineKey(machine);
      if (!key || key === targetMachine) continue;
      const rowRoute = rowText(row, "routeMachine");
      const rowType = rowText(row, "machineType");
      if ((machineCodeMatches(routeMachine, machine) || machineCodeMatches(routeMachine, rowRoute)) && machineTypeCompatible(machineType, rowType)) machines.add(machine);
    }
  }
  return [...machines].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function uniqueMachineValues(values: string[]) {
  const seen = new Set<string>();
  const machines: string[] = [];
  for (const value of values) {
    const machine = displayMachine(value);
    const key = machineKey(machine);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    machines.push(machine);
  }
  return machines.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function queueRowsForMachine(
  plannedRows: MachineConstraintReviewRow[],
  machine: string,
  excludedKeys: Set<string>,
  maxRows: number,
) {
  const key = machineKey(machine);
  return plannedRows
    .filter((row) => machineKey(machineValue(row)) === key)
    .filter((row) => !excludedKeys.has(setupIdentityKey(row)))
    .sort(machinePlanSort)
    .slice(0, maxRows);
}

function downstreamMachines(
  affectedRows: MachineConstraintReviewRow[],
  plannedRows: MachineConstraintReviewRow[],
  targetMachine: string,
) {
  const machines = new Set<string>();
  for (const affected of affectedRows) {
    for (const row of downstreamRowsForAffected(affected, plannedRows)) {
      const machine = machineValue(row);
      if (machineKey(machine) && machineKey(machine) !== targetMachine) machines.add(machine);
    }
  }
  return [...machines].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function downstreamRowsForMachine(
  affectedRows: MachineConstraintReviewRow[],
  plannedRows: MachineConstraintReviewRow[],
  machine: string,
  maxRows: number,
) {
  const machineTarget = machineKey(machine);
  const seen = new Set<string>();
  const rows: MachineConstraintReviewRow[] = [];
  for (const affected of affectedRows) {
    for (const row of downstreamRowsForAffected(affected, plannedRows)) {
      if (machineKey(machineValue(row)) !== machineTarget) continue;
      const key = setupIdentityKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows.sort(machinePlanSort).slice(0, maxRows);
}

function downstreamRowsForAffected(affected: MachineConstraintReviewRow, plannedRows: MachineConstraintReviewRow[]) {
  const jcNo = machineKey(rowText(affected, "jcNo", "JobCardNo", "jobCard"));
  const partCode = machineKey(rowText(affected, "partCode", "PART CODE", "itemCode"));
  const optionNumber = machineKey(rowText(affected, "optionNumber", "option"));
  const setupNo = setupSortValue(rowText(affected, "setupNo"));
  if (!jcNo || setupNo === Number.MAX_SAFE_INTEGER) return [];
  return plannedRows.filter((row) => {
    if (machineKey(rowText(row, "jcNo", "JobCardNo", "jobCard")) !== jcNo) return false;
    if (partCode && machineKey(rowText(row, "partCode", "PART CODE", "itemCode")) !== partCode) return false;
    if (optionNumber && machineKey(rowText(row, "optionNumber", "option")) !== optionNumber) return false;
    return setupSortValue(rowText(row, "setupNo")) > setupNo;
  });
}

function affectedWindowStart(rows: MachineConstraintReviewRow[]) {
  return rows.reduce((min, row) => Math.min(min, rowStartSortValue(row)), Number.MAX_SAFE_INTEGER);
}

function machinePlanSort(left: MachineConstraintReviewRow, right: MachineConstraintReviewRow) {
  return rowStartSortValue(left) - rowStartSortValue(right)
    || machineValue(left).localeCompare(machineValue(right), undefined, { numeric: true })
    || rowText(left, "jcNo", "JobCardNo", "jobCard").localeCompare(rowText(right, "jcNo", "JobCardNo", "jobCard"), undefined, { numeric: true })
    || setupSortValue(rowText(left, "setupNo")) - setupSortValue(rowText(right, "setupNo"));
}

function rowStartSortValue(row: MachineConstraintReviewRow) {
  return dateSortValue(rowText(row, "plannedProductionStartDate", "setupPlannedDate", "plannedDate"));
}

function dateSortValue(value: unknown) {
  const text = rowText({ value }, "value");
  if (!text || text === "-") return Number.MAX_SAFE_INTEGER;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso?.[1] && iso[2] && iso[3]) return Number(`${iso[1]}${iso[2]}${iso[3]}`);
  const dashboard = text.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/);
  if (dashboard?.[1] && dashboard[2] && dashboard[3]) {
    const month = monthNumber(dashboard[2]);
    const year = Number(dashboard[3].length === 2 ? `20${dashboard[3]}` : dashboard[3]);
    if (month) return Number(`${year}${String(month).padStart(2, "0")}${dashboard[1].padStart(2, "0")}`);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return Number.MAX_SAFE_INTEGER;
  return Number(`${parsed.getFullYear()}${String(parsed.getMonth() + 1).padStart(2, "0")}${String(parsed.getDate()).padStart(2, "0")}`);
}

function monthNumber(value: string) {
  return ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(value.toLowerCase()) + 1;
}

function setupSortValue(value: unknown) {
  const numeric = Number(rowText({ value }, "value").match(/\d+/)?.[0] ?? "");
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function setupIdentityKey(row: MachineConstraintReviewRow) {
  return [
    rowText(row, "jcNo", "JobCardNo", "jobCard"),
    rowText(row, "partCode", "PART CODE", "itemCode"),
    rowText(row, "optionNumber", "option"),
    rowText(row, "setupNo"),
    machineValue(row),
  ].map(machineKey).join("|");
}

function machineRowIsActive(row: MachineConstraintReviewRow) {
  const status = machineKey(rowText(row, "status", "STATUS", "activeStatus", "isActive", "ACTIVE", "active", "Active"));
  return !status || !["inactive", "breakdown", "maintenance", "not_active", "false", "0"].includes(status);
}

function machineValue(row: MachineConstraintReviewRow) {
  return displayMachine(rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO", "MACHINE NO."));
}

function displayMachine(value: unknown) {
  const text = rowText({ value }, "value");
  return text || "-";
}

function rowText(row: MachineConstraintReviewRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function machineKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function machineFamilyKey(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/^([A-Z]+)(\d)/);
  return match ? `${match[1]}${match[2]}`.toLowerCase() : normalized.toLowerCase();
}

function machineCodeMatches(routeMachine: unknown, actualMachine: unknown) {
  const routeFamily = machineFamilyKey(routeMachine);
  const actualFamily = machineFamilyKey(actualMachine);
  return Boolean(routeFamily && actualFamily && routeFamily === actualFamily);
}

function machineTypeCompatible(sourceType: unknown, targetType: unknown) {
  const source = machineKey(sourceType);
  const target = machineKey(targetType);
  return !source || !target || source === target;
}

function groupRank(kind: MachineConstraintQueueReviewKind) {
  if (kind === "destination") return 0;
  if (kind === "same_machine_later") return 1;
  return 2;
}
