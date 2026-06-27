import { buildDashboardSnapshot, type AttendanceRecord, type DashboardFilters, type ProductionEntry, type TrainingRecord } from "./dashboard-domain";
import { isActivePlannerDecision, isPlanningWorkday, machineCodeMatches, priorityLabel, priorityScore, sourcePlannerDecisions } from "./planning-rules";

type DataEntry = {
  _id?: unknown;
  entryType: string;
  key?: string;
  payload: unknown;
  createdAt: string;
};

type ActionRow = Record<string, unknown> & { createdAt?: string };

export type LegacyDashboardInput = {
  workbookName: string;
  productionEntries: ProductionEntry[];
  attendanceRecords?: AttendanceRecord[];
  trainingRecords?: TrainingRecord[];
  dataEntries?: DataEntry[];
  routeSelections?: ActionRow[];
  plannerPriorities?: ActionRow[];
  machineConstraints?: ActionRow[];
  planOverrides?: ActionRow[];
  routeChanges?: ActionRow[];
  dispatchApprovals?: ActionRow[];
  setupCompletions?: ActionRow[];
  filters?: DashboardFilters;
  updatedAt?: string;
};

type Totals = {
  output: number;
  target: number;
  reject: number;
  runs: number;
};

type RichTotals = Totals & {
  downtime: number;
  runtimeHours: number;
  loggedHours: number;
};

type ProductionRow = Record<string, unknown>;
type MonthlyMachineTypeTotal = Totals & {
  monthKey: string;
  month: string;
  operatorId: string;
  machineType: string;
};
type PriorityTuple = [number, number, number, number];
type PlanningCalendar = {
  holidayDates: Set<string>;
};

const rejectionEntryCount = 5;
const unassignedDowntimeReason = "Reason Not Entered";
const monthNames: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const monthShortLegacy = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const planningHoursPerDay = 8;
const wipAvailabilityBufferDays = 1;
const interSetupTransferBufferDays = 1;
const planningSetupBufferDays = 1;
const planningDispatchTargetDays = 25;
const minimumParallelMachineWorkDays = 15;
const defaultPlanningCalendar: PlanningCalendar = { holidayDates: new Set<string>() };
const downtimeReasonFields: Array<[string, string[]]> = [
  ["QC Approval", ["QC APPROVAL DOWNTIME (MIN)", "QC APPROVAL", "QCDown"]],
  ["Machine Setting", ["MACHINE SETTING DOWNTIME (MIN)", "MACHINE SETTING", "SettingDown"]],
  ["No Raw Material", ["NO RAW MATERIAL DOWNTIME (MIN)", "NO RM", "NoRMDown"]],
  ["No Operator", ["NO OPERATOR DOWNTIME (MIN)", "NO OPERATOR", "NoOpDown"]],
  ["No Electricity", ["NO ELECTRICITY DOWNTIME (MIN)", "NO ELECTRICITY", "NoElecDown"]],
  ["Other", ["OTHER DOWNTIME (MIN)", "OTHER", "OtherDown"]],
];
const toolFixtureCategories: Array<[string, string]> = [
  ["DRILL LAG", "D"],
  ["MODHIYA", "M"],
  ["RIMMER", "R"],
  ["GARIYA", "G"],
  ["THREADING LAG", "T"],
  ["FOAM TOOL", "F"],
  ["CHAPLA", "C"],
  ["TAPERIYA TOOLING", "TT"],
  ["PIN STOPER", "PS"],
  ["WARM", "W"],
  ["SPECIAL CAM", "SC"],
  ["GEAR SHAFTING", "GS"],
  ["CARBON DRILL TOOL", "CD"],
  ["CUTTING CHAPLA", "CC"],
];

function mergeSourceActionRows(sourceRows: ActionRow[], liveRows: ActionRow[], keyFn: (row: ActionRow) => string) {
  const merged = new Map<string, ActionRow>();
  for (const row of [...sourceRows, ...liveRows]) {
    const key = keyFn(row);
    merged.set(key || JSON.stringify(row), row);
  }
  return [...merged.values()];
}

function routeSelectionDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO")),
    canonicalKey(rowText(row, "partCode", "PART CODE", "PART NO")),
    canonicalKey(rowText(row, "optionNumber", "SELECTED ROUTE OPTION", "OPTION NUMBER")),
  ].join("|");
}

function priorityDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "target", "TARGET")),
    canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO")),
    canonicalKey(rowText(row, "partCode", "PART CODE", "PART NO")),
    canonicalKey(rowText(row, "priority", "PRIORITY")),
  ].join("|");
}

function machineConstraintDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "machineNo", "machine", "MACHINE NO.", "MACHINE NO", "M/C NO")),
    rowText(row, "unavailableFrom", "UNAVAILABLE FROM"),
    rowText(row, "unavailableTo", "UNAVAILABLE TO"),
  ].join("|");
}

function planOverrideDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "target", "jcNo", "JC NO.", "JC NO", "PART CODE", "PART NO")),
    canonicalKey(rowText(row, "setupNo", "SETUP NO.", "SETUP NO")),
    canonicalKey(rowText(row, "fromMachine", "FROM MACHINE")),
    canonicalKey(rowText(row, "toMachine", "TO MACHINE")),
  ].join("|");
}

function routeChangeDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "target", "jcNo", "JC NO.", "JC NO", "PART CODE", "PART NO")),
    canonicalKey(rowText(row, "newOption", "NEW ROUTE OPTION", "NEW OPTION")),
    canonicalKey(rowText(row, "applyFromSetup", "APPLY FROM SETUP")),
  ].join("|");
}

function setupCompletionDecisionKey(row: ActionRow) {
  return [
    canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO")),
    canonicalKey(rowText(row, "setupNo", "SETUP NO.", "SETUP NO")),
    canonicalKey(rowText(row, "machine", "MACHINE NO.", "MACHINE NO")),
  ].join("|");
}

export function buildLegacyDashboardSnapshot(input: LegacyDashboardInput) {
  const dataEntries = input.dataEntries ?? [];
  const byType = bucketDataEntries(dataEntries);
  const employeeRows = entryRows(byType, "employee");
  const employees = new Map<string, string>();
  const departments = new Map<string, string>();
  for (const row of employeeRows) {
    const empId = rowText(row, "Emp ID", "EMP ID", "empId");
    if (!empId) continue;
    employees.set(empId, rowText(row, "Employee Name", "EMPLOYEE NAME", "employeeName") || empId);
    departments.set(empId, rowText(row, "Department", "DEPARTMENT", "department"));
  }

  const routeRows = entryRows(byType, "route");
  const cycleRows = entryRows(byType, "cycle");
  const toolingRows = entryRows(byType, "tooling");
  const workOrderRows = entryRows(byType, "work_order");
  const rmInwardRows = entryRows(byType, "rm_inward");
  const planningHolidayRows = latestEntryRowsByKey(entryRows(byType, "planning_holiday"), planningHolidayEntryKey);
  const setupChecklistRows: Record<string, unknown>[] = [];
  const shopFloorStatusRows = latestEntryRowsByKey(entryRows(byType, "shop_floor_status"), shopFloorStatusEntryKey);
  const firstPieceInspectionMasterRows = entryRows(byType, "first_piece_inspection_master");
  const firstPieceInspectionReportRows = latestEntryRowsByKey(entryRows(byType, "first_piece_inspection_report"), firstPieceReportEntryKey);
  const rawSoftwareRows = entryRows(byType, "software_raw");
  const meetingRows = entryRows(byType, "meeting_action");
  const routeLookup = loadRouteLookup(routeRows);
  const productionRows = rawSoftwareRows.length
    ? normalizedRawSoftwareRows(rawSoftwareRows, routeLookup)
    : normalizedProductionEntries(input.productionEntries);

  const snapshot = buildProductionAnalysis({
    productionRows,
    employees,
    departments,
    attendanceRecords: input.attendanceRecords ?? [],
    trainingRecords: input.trainingRecords ?? [],
    employeeRows,
    meetingRows,
    setupChecklistRows,
    shopFloorStatusRows,
    firstPieceInspectionMasterRows,
    firstPieceInspectionReportRows,
    routeRows,
    cycleRows,
    toolingRows,
    workOrderRows,
    rmInwardRows,
    planningHolidayRows,
    machineRows: entryRows(byType, "machine_master"),
    dispatchRows: entryRows(byType, "dispatch"),
    routeSelections: mergeSourceActionRows(sourcePlannerDecisions.routeSelections, input.routeSelections ?? [], routeSelectionDecisionKey),
    plannerPriorities: mergeSourceActionRows(sourcePlannerDecisions.plannerPriorities, input.plannerPriorities ?? [], priorityDecisionKey),
    machineConstraints: mergeSourceActionRows(sourcePlannerDecisions.machineConstraints, input.machineConstraints ?? [], machineConstraintDecisionKey),
    planOverrides: mergeSourceActionRows(sourcePlannerDecisions.planOverrides, input.planOverrides ?? [], planOverrideDecisionKey),
    routeChanges: mergeSourceActionRows(sourcePlannerDecisions.routeChanges, input.routeChanges ?? [], routeChangeDecisionKey),
    dispatchApprovals: input.dispatchApprovals ?? [],
    setupCompletions: mergeSourceActionRows(sourcePlannerDecisions.setupCompletions, input.setupCompletions ?? [], setupCompletionDecisionKey),
    filters: input.filters ?? {},
    workbookName: input.workbookName,
    updatedAt: input.updatedAt ?? "",
  });

  if (
    productionRows.length ||
    routeRows.length ||
    cycleRows.length ||
    toolingRows.length ||
    workOrderRows.length ||
    rmInwardRows.length ||
    setupChecklistRows.length ||
    employeeRows.length ||
    entryRows(byType, "machine_master").length
  ) return snapshot;

  return buildDashboardSnapshot(input);
}

function buildProductionAnalysis({
  productionRows,
  employees,
  departments,
  attendanceRecords,
  trainingRecords,
  employeeRows,
  meetingRows,
  setupChecklistRows,
  shopFloorStatusRows,
  firstPieceInspectionMasterRows,
  firstPieceInspectionReportRows,
  routeRows,
  cycleRows,
  toolingRows,
  workOrderRows,
  rmInwardRows,
  planningHolidayRows,
  machineRows,
  dispatchRows,
  routeSelections,
  plannerPriorities,
  machineConstraints,
  planOverrides,
  routeChanges,
  dispatchApprovals,
  setupCompletions,
  filters,
  workbookName,
  updatedAt,
}: {
  productionRows: ProductionRow[];
  employees: Map<string, string>;
  departments: Map<string, string>;
  attendanceRecords: AttendanceRecord[];
  trainingRecords: TrainingRecord[];
  employeeRows: Record<string, unknown>[];
  meetingRows: Record<string, unknown>[];
  setupChecklistRows: Record<string, unknown>[];
  shopFloorStatusRows: Record<string, unknown>[];
  firstPieceInspectionMasterRows: Record<string, unknown>[];
  firstPieceInspectionReportRows: Record<string, unknown>[];
  routeRows: Record<string, unknown>[];
  cycleRows: Record<string, unknown>[];
  toolingRows: Record<string, unknown>[];
  workOrderRows: Record<string, unknown>[];
  rmInwardRows: Record<string, unknown>[];
  planningHolidayRows: Record<string, unknown>[];
  machineRows: Record<string, unknown>[];
  dispatchRows: Record<string, unknown>[];
  routeSelections: ActionRow[];
  plannerPriorities: ActionRow[];
  machineConstraints: ActionRow[];
  planOverrides: ActionRow[];
  routeChanges: ActionRow[];
  dispatchApprovals: ActionRow[];
  setupCompletions: ActionRow[];
  filters: DashboardFilters;
  workbookName: string;
  updatedAt: string;
}) {
  const operatorMachineMonth = new Map<string, Totals & { operatorId: string; monthKey: string; month: string; machine: string; machineType: string }>();
  const operatorTotals = new Map<string, Totals & { machines: Set<string> }>();
  const machineTypeTotals = new Map<string, Totals & { operatorId: string; machineType: string }>();
  const monthlyMachineTypeTotals = new Map<string, MonthlyMachineTypeTotal>();
  const machineTotals = new Map<string, RichTotals & { machine: string; machineType: string; reasons: Map<string, number> }>();
  const downtimeByType = new Map<string, RichTotals & { machineType: string; reasons: Map<string, number> }>();
  const downtimeReasons = new Map<string, { reason: string; downtime: number; runs: number; machines: Set<string>; machineTypes: Set<string> }>();
  const downtimeReasonDetails = new Map<string, { machineType: string; machine: string; reason: string; downtime: number; runs: number; remarks: Set<string>; categories: Set<string> }>();
  const monthTotals = new Map<string, Totals & { monthKey: string; month: string }>();
  const dayTotals = new Map<string, Totals & { dateKey: string; date: string }>();
  const operatorDayTotals = new Map<string, Totals & { operatorId: string; dateKey: string; date: string }>();
  const rejectHotspots = new Map<string, Totals & { operatorId: string; partNo: string; setup: string; machine: string; machineType: string }>();
  const rejectionTypeTotals = new Map<string, { code: string; name: string; reject: number; entries: number; operators: Set<string>; machines: Set<string>; parts: Set<string>; setups: Set<string> }>();
  const rejectionRemarkTotals = new Map<string, { code: string; name: string; reject: number; entries: number; operators: Set<string>; machines: Set<string>; parts: Set<string>; setups: Set<string> }>();
  const defectTotals = new Map<string, { code: string; name: string; reject: number; entries: number; operators: Set<string>; machines: Set<string>; machineTypes: Set<string>; parts: Set<string>; setups: Set<string>; typeCode: string; typeName: string; remarkCode: string; remarkName: string }>();
  const defectHotspots = new Map<string, { code: string; name: string; typeCode: string; typeName: string; remarkCode: string; remarkName: string; partNo: string; setup: string; machineType: string; reject: number; entries: number; operators: Set<string>; machines: Set<string> }>();
  const monthlyMachineUsage = new Map<string, { monthKey: string; month: string; machines: Set<string>; runtimeHours: number; loggedHours: number; cardEntries: number; downtime: number }>();
  const productionEntriesForGuidance: Array<Record<string, unknown>> = [];
  const allMonths = new Map<string, string>();
  const activeMonths = new Map<string, string>();
  const allMachines = new Set<string>();
  const activeMachines = new Set<string>();
  const allMachineTypes = new Set<string>();

  for (const row of productionRows) {
    const rawOperator = rowText(row, "OPERATOR ID", "OPERATOR NAME");
    const machine = rowText(row, "MACHINE NO", "M/C NO");
    const prodDate = parseDate(rowValue(row, "PRODUCTION DATE", "PROD DATE"));
    if (!rawOperator || !machine || !prodDate) continue;

    const [monthKeyValue, monthLabelValue] = monthKey(prodDate);
    const [dateKeyValue, dateLabelValue] = dateKey(prodDate);
    const output = safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS"));
    const target = safeNumber(rowValue(row, "TARGET QTY (PCS)", "TARGE PCS", "Target Pcs"));
    const reject = rejectionTotalFromRow(row);
    const machineType = rowText(row, "MACHINE TYPE", "MC TYPE") || "Unspecified";
    const partNo = rowText(row, "PART CODE", "PART NO") || "Unspecified";
    const setup = rowText(row, "SETUP CODE", "SETUP", "SET UP") || "Unspecified";
    const remark = rowText(row, "REMARKS", "REMARK");
    const category = rowText(row, "DOWNTIME CATEGORY", "CATEGORY");
    const [reasonValues, effectiveDowntime] = downtimeValuesFromRow(row);
    const loggedHours = elapsedMinutesFromRow(row) / 60;
    const runtimeHours = runtimeHoursFromRow(row, effectiveDowntime);

    allMonths.set(monthKeyValue, monthLabelValue);
    allMachineTypes.add(machineType);
    if (!filters.machineType || machineType === filters.machineType) allMachines.add(machine);

    if (filters.operatorId && rawOperator !== filters.operatorId) continue;
    if (filters.machineType && machineType !== filters.machineType) continue;
    if (filters.machine && machine !== filters.machine) continue;
    if (filters.month && monthKeyValue !== filters.month) continue;
    if (filters.startDate && prodDate < filters.startDate) continue;
    if (filters.endDate && prodDate > filters.endDate) continue;

    activeMonths.set(monthKeyValue, monthLabelValue);
    activeMachines.add(machine);

    const omm = getOrCreate(operatorMachineMonth, [rawOperator, monthKeyValue, machine].join("|"), () => ({
      ...emptyTotals(),
      operatorId: rawOperator,
      monthKey: monthKeyValue,
      month: monthLabelValue,
      machine,
      machineType,
    }));
    addTotals(omm, output, target, reject);

    const operator = getOrCreate(operatorTotals, rawOperator, () => ({ ...emptyTotals(), machines: new Set<string>() }));
    addTotals(operator, output, target, reject);
    operator.machines.add(machine);

    const typeTotal = getOrCreate(machineTypeTotals, [rawOperator, machineType].join("|"), () => ({
      ...emptyTotals(),
      operatorId: rawOperator,
      machineType,
    }));
    addTotals(typeTotal, output, target, reject);

    const monthlyTypeTotal = getOrCreate(monthlyMachineTypeTotals, [monthKeyValue, rawOperator, machineType].join("|"), () => ({
      ...emptyTotals(),
      monthKey: monthKeyValue,
      month: monthLabelValue,
      operatorId: rawOperator,
      machineType,
    }));
    addTotals(monthlyTypeTotal, output, target, reject);

    const machineTotal = getOrCreate(machineTotals, machine, () => ({ ...emptyRichTotals(), machine, machineType, reasons: new Map<string, number>() }));
    addRichTotals(machineTotal, output, target, reject, effectiveDowntime, runtimeHours, loggedHours);

    const typeDowntime = getOrCreate(downtimeByType, machineType, () => ({ ...emptyRichTotals(), machineType, reasons: new Map<string, number>() }));
    addRichTotals(typeDowntime, output, target, reject, effectiveDowntime, runtimeHours, loggedHours);

    const usage = getOrCreate(monthlyMachineUsage, monthKeyValue, () => ({
      monthKey: monthKeyValue,
      month: monthLabelValue,
      machines: new Set<string>(),
      runtimeHours: 0,
      loggedHours: 0,
      cardEntries: 0,
      downtime: 0,
    }));
    usage.machines.add(machine);
    usage.runtimeHours += runtimeHours;
    usage.loggedHours += loggedHours;
    usage.cardEntries += 1;
    usage.downtime += effectiveDowntime;

    for (const [reason, minutes] of reasonValues) {
      machineTotal.reasons.set(reason, (machineTotal.reasons.get(reason) ?? 0) + minutes);
      typeDowntime.reasons.set(reason, (typeDowntime.reasons.get(reason) ?? 0) + minutes);
      const reasonRow = getOrCreate(downtimeReasons, reason, () => ({ reason, downtime: 0, runs: 0, machines: new Set<string>(), machineTypes: new Set<string>() }));
      reasonRow.downtime += minutes;
      reasonRow.runs += 1;
      reasonRow.machines.add(machine);
      reasonRow.machineTypes.add(machineType);
      const detail = getOrCreate(downtimeReasonDetails, [machineType, machine, reason].join("|"), () => ({
        machineType,
        machine,
        reason,
        downtime: 0,
        runs: 0,
        remarks: new Set<string>(),
        categories: new Set<string>(),
      }));
      detail.downtime += minutes;
      detail.runs += 1;
      if (remark && remark !== "-") detail.remarks.add(remark);
      if (category && category !== "-") detail.categories.add(category);
    }

    addTotals(getOrCreate(monthTotals, monthKeyValue, () => ({ ...emptyTotals(), monthKey: monthKeyValue, month: monthLabelValue })), output, target, reject);
    addTotals(getOrCreate(dayTotals, dateKeyValue, () => ({ ...emptyTotals(), dateKey: dateKeyValue, date: dateLabelValue })), output, target, reject);
    addTotals(getOrCreate(operatorDayTotals, [rawOperator, dateKeyValue].join("|"), () => ({ ...emptyTotals(), operatorId: rawOperator, dateKey: dateKeyValue, date: dateLabelValue })), output, target, reject);
    addTotals(getOrCreate(rejectHotspots, [rawOperator, partNo, setup, machine, machineType].join("|"), () => ({
      ...emptyTotals(),
      operatorId: rawOperator,
      partNo,
      setup,
      machine,
      machineType,
    })), output, target, reject);

    for (const rejection of rejectionEntriesFromRow(row)) {
      const typeCode = rowText(rejection, "type").toUpperCase() || "UNSPECIFIED";
      const remarkCode = rowText(rejection, "remark").toUpperCase() || "UNSPECIFIED";
      const defectCode = rowText(rejection, "reason").toUpperCase() || "UNSPECIFIED";
      const rejectQty = safeNumber(rowValue(rejection, "qty"));
      const typeRow = getOrCreate(rejectionTypeTotals, typeCode, () => emptyAnalysisRow(typeCode, typeCode));
      addAnalysisRow(typeRow, rejectQty, rawOperator, machine, partNo, setup);
      const remarkRow = getOrCreate(rejectionRemarkTotals, remarkCode, () => emptyAnalysisRow(remarkCode, remarkCode));
      addAnalysisRow(remarkRow, rejectQty, rawOperator, machine, partNo, setup);
      const defectRow = getOrCreate(defectTotals, defectCode, () => ({
        ...emptyAnalysisRow(defectCode, defectCode),
        machineTypes: new Set<string>(),
        typeCode,
        typeName: typeCode,
        remarkCode,
        remarkName: remarkCode,
      }));
      addAnalysisRow(defectRow, rejectQty, rawOperator, machine, partNo, setup);
      defectRow.machineTypes.add(machineType);
      const hotspot = getOrCreate(defectHotspots, [defectCode, typeCode, remarkCode, partNo, setup, machineType].join("|"), () => ({
        code: defectCode,
        name: defectCode,
        typeCode,
        typeName: typeCode,
        remarkCode,
        remarkName: remarkCode,
        partNo,
        setup,
        machineType,
        reject: 0,
        entries: 0,
        operators: new Set<string>(),
        machines: new Set<string>(),
      }));
      hotspot.reject += rejectQty;
      hotspot.entries += 1;
      hotspot.operators.add(rawOperator);
      hotspot.machines.add(machine);
    }

    productionEntriesForGuidance.push({
      operatorId: rawOperator,
      prodDate,
      machine,
      machineType,
      partNo,
      setup,
      output,
      target,
      reject,
      downtime: effectiveDowntime,
      runtimeHours,
      loggedHours,
    });
  }

  const operatorPerformance = [...operatorTotals.entries()]
    .map(([operatorId, total]) => ({
      operatorId,
      name: employees.get(operatorId) ?? operatorId,
      department: departments.get(operatorId) ?? "",
      output: round(total.output),
      target: round(total.target),
      reject: round(total.reject),
      efficiency: ratio(total.output, total.target),
      rejectRate: ratio(total.reject, total.output),
      runs: total.runs,
      machines: total.machines.size,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  const machineOutputRows = [...operatorMachineMonth.values()]
    .map((row) => ({
      operatorId: row.operatorId,
      operatorName: employees.get(row.operatorId) ?? row.operatorId,
      monthKey: row.monthKey,
      month: row.month,
      machine: row.machine,
      machineType: row.machineType,
      output: round(row.output),
      target: round(row.target),
      reject: round(row.reject),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.machine.localeCompare(b.machine));

  const machineTypeRows = [...machineTypeTotals.values()]
    .map((row) => ({
      operatorId: row.operatorId,
      operatorName: employees.get(row.operatorId) ?? row.operatorId,
      machineType: row.machineType,
      output: round(row.output),
      target: round(row.target),
      reject: round(row.reject),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => b.output - a.output);

  const rejectHotspotRows = [...rejectHotspots.values()]
    .map((row) => ({
      operatorId: row.operatorId,
      operatorName: employees.get(row.operatorId) ?? row.operatorId,
      partNo: row.partNo,
      setup: row.setup,
      machine: row.machine,
      machineType: row.machineType,
      output: round(row.output),
      target: round(row.target),
      reject: round(row.reject),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => b.reject - a.reject || b.rejectRate - a.rejectRate);

  const attendanceRows = buildAttendanceRows(attendanceRecords, employees, filters);
  const pendingTraining = buildPendingTraining(trainingRecords, employees, departments);
  const trainingRecordsByOperator = buildTrainingRecordsByOperator(trainingRecords, employees, departments);
  const totalOutput = sum(operatorPerformance.map((row) => row.output));
  const totalTarget = sum(operatorPerformance.map((row) => row.target));
  const totalReject = sum(operatorPerformance.map((row) => row.reject));
  const trainingByType = countBy(pendingTraining, (row) => text(row.trainingType) || "Unspecified")
    .map(([trainingType, count]) => ({ trainingType, count }))
    .sort((a, b) => b.count - a.count || a.trainingType.localeCompare(b.trainingType));
  const setupAnalytics = buildSetupAnalytics(setupChecklistRows, filters);
  for (const [key, label] of Object.entries(setupAnalytics.monthsForFilter as Record<string, string>)) {
    allMonths.set(key, label);
  }
  const productionControl = buildProductionControl({
    productionRows,
    routeRows,
    cycleRows,
    toolingRows,
    workOrderRows,
    rmInwardRows,
    planningHolidayRows,
    machineRows,
    dispatchRows,
    setupChecklistRows,
    shopFloorStatusRows,
    firstPieceInspectionMasterRows,
    firstPieceInspectionReportRows,
    routeSelections,
    plannerPriorities,
    machineConstraints,
    planOverrides,
    routeChanges,
    dispatchApprovals,
    setupCompletions,
  });
  const routingStatus = buildRoutingStatus(routeRows, productionRows);
  const toolFixtureNumbers = buildToolFixtureNumbers(toolingRows);
  const dataEntry = buildDataEntryContext({ routeRows, cycleRows, toolingRows, workOrderRows, setupChecklistRows, planningHolidayRows, employeeRows, machineRows });

  return {
    updatedAt,
    workbook: workbookName,
    version: { workbook: workbookName, source: "convex" },
    filters: {
      selectedMachineType: filters.machineType ?? "",
      selectedMachine: filters.machine ?? "",
      selectedOperatorId: filters.operatorId ?? "",
      selectedMonth: filters.month ?? "",
      selectedStartDate: filters.startDate ?? "",
      selectedEndDate: filters.endDate ?? "",
      operators: [...employees.entries()]
        .map(([operatorId, name]) => ({ operatorId, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      months: [...allMonths.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label })),
      activeMonths: [...activeMonths.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label })),
      machines: [...allMachines].sort(),
      activeMachines: [...activeMachines].sort(),
      machineTypes: [...allMachineTypes].sort(),
    },
    summary: {
      totalOutput: round(totalOutput),
      totalTarget: round(totalTarget),
      avgEfficiency: ratio(totalOutput, totalTarget),
      rejectRate: ratio(totalReject, totalOutput),
      activeOperators: operatorPerformance.length,
      pendingTraining: pendingTraining.length,
      attendanceScope: attendanceRows.scope,
    },
    operatorPerformance,
    machineRows: machineOutputRows,
    machineTypeRows,
    rejectHotspots: rejectHotspotRows,
    rejectionTypeAnalysis: analysisRows(rejectionTypeTotals),
    rejectionRemarkAnalysis: analysisRows(rejectionRemarkTotals),
    defectAnalysis: [...defectTotals.values()]
      .map((row) => ({
        code: row.code,
        name: row.name,
        typeCode: row.typeCode,
        typeName: row.typeName,
        remarkCode: row.remarkCode,
        remarkName: row.remarkName,
        reject: round(row.reject),
        entries: row.entries,
        operators: row.operators.size,
        machines: row.machines.size,
        machineTypes: row.machineTypes.size,
        parts: row.parts.size,
        setups: row.setups.size,
        inspectionMethod: "",
        classification: "",
      }))
      .sort((a, b) => b.reject - a.reject || b.entries - a.entries),
    defectHotspots: [...defectHotspots.values()]
      .map((row) => ({
        code: row.code,
        name: row.name,
        typeCode: row.typeCode,
        typeName: row.typeName,
        remarkCode: row.remarkCode,
        remarkName: row.remarkName,
        partNo: row.partNo,
        setup: row.setup,
        machineType: row.machineType,
        reject: round(row.reject),
        entries: row.entries,
        operators: row.operators.size,
        machines: row.machines.size,
        inspectionMethod: "",
      }))
      .sort((a, b) => b.reject - a.reject || b.entries - a.entries),
    downtimeByType: [...downtimeByType.values()]
      .map((row) => richDowntimeRow({ machineType: row.machineType }, row))
      .sort((a, b) => b.downtime - a.downtime),
    downtimeByMachine: [...machineTotals.values()]
      .map((row) => richDowntimeRow({ machine: row.machine, machineType: row.machineType }, row))
      .sort((a, b) => b.downtime - a.downtime),
    monthlyMachineUsage: [...monthlyMachineUsage.values()]
      .map((row) => ({
        monthKey: row.monthKey,
        month: row.month,
        machinesUsed: row.machines.size,
        runtimeHours: round(row.runtimeHours),
        loggedHours: round(row.loggedHours),
        cardEntries: row.cardEntries,
        downtime: round(row.downtime),
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    downtimeReasons: [...downtimeReasons.values()]
      .map((row) => ({
        reason: row.reason,
        downtime: round(row.downtime),
        runs: row.runs,
        machines: row.machines.size,
        machineTypes: row.machineTypes.size,
      }))
      .sort((a, b) => b.downtime - a.downtime),
    downtimeReasonDetails: [...downtimeReasonDetails.values()]
      .map((row) => ({
        machineType: row.machineType,
        machine: row.machine,
        reason: row.reason,
        downtime: round(row.downtime),
        runs: row.runs,
        remarks: compactJoin([...row.remarks].sort(), 8) || "-",
        categories: compactJoin([...row.categories].sort(), 8) || "-",
      }))
      .sort((a, b) => b.downtime - a.downtime),
    attendance: attendanceRows.rows,
    pendingTraining,
    trainingByType,
    trainingGuidance: buildTrainingGuidance(
      operatorPerformance,
      attendanceRows.rows,
      machineTypeRows,
      rejectHotspotRows,
      productionEntriesForGuidance,
      trainingRecordsByOperator,
      ratio(totalReject, totalOutput),
    ),
    monthlyTrainingPlan: buildMonthlyTrainingPlan(
      [...monthlyMachineTypeTotals.values()],
      employees,
      trainingRecordsByOperator,
      ratio(totalReject, totalOutput),
    ),
    meetingTracker: buildMeetingTracker(meetingRows, operatorPerformance, employees, filters.month ? allMonths.get(filters.month) || filters.month : ""),
    routingStatus,
    toolFixtureNumbers,
    productionControl,
    setupAnalytics,
    dataEntry,
    monthSeries: [...monthTotals.values()]
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((row) => ({ monthKey: row.monthKey, month: row.month, output: round(row.output), target: round(row.target), reject: round(row.reject), efficiency: ratio(row.output, row.target), runs: row.runs })),
    daySeries: [...dayTotals.values()]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((row) => ({ dateKey: row.dateKey, date: row.date, output: round(row.output), target: round(row.target), reject: round(row.reject), efficiency: ratio(row.output, row.target), rejectRate: ratio(row.reject, row.output), runs: row.runs })),
    operatorDayRows: [...operatorDayTotals.values()]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.operatorId.localeCompare(b.operatorId))
      .map((row) => ({ operatorId: row.operatorId, operatorName: employees.get(row.operatorId) ?? row.operatorId, dateKey: row.dateKey, date: row.date, output: round(row.output), target: round(row.target), reject: round(row.reject), efficiency: ratio(row.output, row.target), rejectRate: ratio(row.reject, row.output), runs: row.runs })),
  };
}

function buildProductionControl({
  productionRows,
  routeRows,
  cycleRows,
  toolingRows,
  workOrderRows,
  rmInwardRows,
  planningHolidayRows,
  machineRows,
  dispatchRows,
  setupChecklistRows,
  shopFloorStatusRows,
  firstPieceInspectionMasterRows,
  firstPieceInspectionReportRows,
  routeSelections,
  plannerPriorities,
  machineConstraints,
  planOverrides,
  routeChanges,
  dispatchApprovals,
  setupCompletions,
}: {
  productionRows: ProductionRow[];
  routeRows: Record<string, unknown>[];
  cycleRows: Record<string, unknown>[];
  toolingRows: Record<string, unknown>[];
  workOrderRows: Record<string, unknown>[];
  rmInwardRows: Record<string, unknown>[];
  planningHolidayRows: Record<string, unknown>[];
  machineRows: Record<string, unknown>[];
  dispatchRows: Record<string, unknown>[];
  setupChecklistRows: Record<string, unknown>[];
  shopFloorStatusRows: Record<string, unknown>[];
  firstPieceInspectionMasterRows: Record<string, unknown>[];
  firstPieceInspectionReportRows: Record<string, unknown>[];
  routeSelections: ActionRow[];
  plannerPriorities: ActionRow[];
  machineConstraints: ActionRow[];
  planOverrides: ActionRow[];
  routeChanges: ActionRow[];
  dispatchApprovals: ActionRow[];
  setupCompletions: ActionRow[];
}) {
  const routeGroups = groupRouteRows(routeRows);
  const dedupedRouteRows = [...routeGroups.values()].flat();
  const planningCalendar = planningCalendarFromRows(planningHolidayRows);
  const routeOptionsByPart = routeOptionSummariesByPart(dedupedRouteRows);
  const cycleKeys = new Set(latestMasterRows(cycleRows).keys());
  const toolingKeys = new Set(latestMasterRows(toolingRows).keys());
  const rmInwardByJc = latestRmInwardByJobCard(rmInwardRows);
  const selectedRouteByJc = latestRouteSelectionByJobCard(routeSelections);
  const routeChangeByTarget = latestRouteChangeByTarget(routeChanges);
  const priorityByTarget = latestPlannerPriorityByTarget(plannerPriorities);
  const rawByJc = new Map<string, { outputQty: number; actualQty: number; rejectQty: number; rows: number; machines: Set<string>; operators: Set<string> }>();
  const rawBySetup = new Map<string, { startDate: string; latestDate: string; outputQty: number; actualQty: number; rows: number; dates: Set<string> }>();
  const rawBySetupAnyMachine = new Map<string, { startDate: string; latestDate: string; outputQty: number; actualQty: number; rows: number; dates: Set<string>; machines: Set<string> }>();
  let latestRawDate = "";
  for (const row of productionRows) {
    const jcNo = rowText(row, "JobCardNo", "JOB CARD NO.", "JC NO.");
    const prodDate = parseDate(rowValue(row, "PROD DATE", "PRODUCTION DATE"));
    if (prodDate && (!latestRawDate || prodDate > latestRawDate)) latestRawDate = prodDate;
    if (!jcNo) continue;
    const rec = getOrCreate(rawByJc, canonicalKey(jcNo), () => ({ outputQty: 0, actualQty: 0, rejectQty: 0, rows: 0, machines: new Set<string>(), operators: new Set<string>() }));
    rec.outputQty += safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS"));
    rec.actualQty += safeNumber(rowValue(row, "ACTUAL QTY IN PCS", "ACTUAL QTY")) || Math.max(safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS")) - rejectionTotalFromRow(row), 0);
    rec.rejectQty += rejectionTotalFromRow(row);
    rec.rows += 1;
    rec.machines.add(rowText(row, "MACHINE NO", "M/C NO"));
    rec.operators.add(rowText(row, "OPERATOR ID", "OPERATOR NAME"));
    const partCode = rowText(row, "PART CODE", "PART NO", "partCode");
    const setupNo = rowText(row, "SETUP CODE", "SETUP NO.", "setupNo");
    const machine = rowText(row, "MACHINE NO", "M/C NO", "machine");
    const setupKey = productionSetupKey({ jcNo, partCode, setupNo, machine });
    const setupAnyMachineKey = productionSetupBaseKey({ jcNo, partCode, setupNo });
    if (setupKey) {
      const setupRec = getOrCreate(rawBySetup, setupKey, () => ({ startDate: "", latestDate: "", outputQty: 0, actualQty: 0, rows: 0, dates: new Set<string>() }));
      if (prodDate && (!setupRec.startDate || prodDate < setupRec.startDate)) setupRec.startDate = prodDate;
      if (prodDate && (!setupRec.latestDate || prodDate > setupRec.latestDate)) setupRec.latestDate = prodDate;
      if (prodDate) setupRec.dates.add(prodDate);
      setupRec.outputQty += safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS"));
      setupRec.actualQty += safeNumber(rowValue(row, "ACTUAL QTY IN PCS", "ACTUAL QTY")) || Math.max(safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS")) - rejectionTotalFromRow(row), 0);
      setupRec.rows += 1;
    }
    if (setupAnyMachineKey) {
      const setupRec = getOrCreate(rawBySetupAnyMachine, setupAnyMachineKey, () => ({ startDate: "", latestDate: "", outputQty: 0, actualQty: 0, rows: 0, dates: new Set<string>(), machines: new Set<string>() }));
      if (prodDate && (!setupRec.startDate || prodDate < setupRec.startDate)) setupRec.startDate = prodDate;
      if (prodDate && (!setupRec.latestDate || prodDate > setupRec.latestDate)) setupRec.latestDate = prodDate;
      if (prodDate) setupRec.dates.add(prodDate);
      setupRec.outputQty += safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS"));
      setupRec.actualQty += safeNumber(rowValue(row, "ACTUAL QTY IN PCS", "ACTUAL QTY")) || Math.max(safeNumber(rowValue(row, "PRODUCTION QTY (PCS)", "PROD QTY IN PCS")) - rejectionTotalFromRow(row), 0);
      setupRec.rows += 1;
      if (machine) setupRec.machines.add(machine);
    }
  }
  const dispatchJcKeys = new Set(dispatchRows.map((row) => canonicalKey(rowText(row, "JC NO.", "JC NO", "jcNo"))).filter(Boolean));
  const workOrderOutputRows = workOrderRows.map((row) => {
    const jcNo = rowText(row, "JC NO.", "JC NO", "jcNo");
    const partCode = rowText(row, "PART CODE", "PART NO", "partCode");
    const plannerPriority = plannerPriorityForWorkOrder(priorityByTarget, jcNo, partCode);
    const plannerPriorityValue = plannerPriority ? rowText(plannerPriority, "priority", "PRIORITY") : "";
    const optionNumber = rowText(row, "OPTION NUMBER", "optionNumber");
    const selectedOptionNumber = rowText(selectedRouteByJc.get(canonicalKey(jcNo)) ?? {}, "optionNumber", "SELECTED ROUTE OPTION", "OPTION NUMBER");
    const routeChange = routeChangeForWorkOrder(routeChangeByTarget, jcNo, partCode);
    const routeChangeOption = rowText(routeChange ?? {}, "newOption", "NEW ROUTE OPTION", "NEW OPTION");
    const routeChangeRemainingSetups = routeChangeRemainingPlan(routeChange);
    const partKey = canonicalKey(partCode);
    const availableOptions = routeOptionsByPart.get(partKey) ?? [];
    const optionNumbers = availableOptions.map((option) => rowText(option, "optionNumber"));
    const effectiveOption = routeChangeOption || optionNumber || selectedOptionNumber || (optionNumbers.length === 1 ? optionNumbers[0]! : "");
    const allSelectedRoutes = routeGroups.get([partKey, effectiveOption].join("|")) ?? [];
    const selectedRoutes = routeChangeRemainingSetups.length
      ? allSelectedRoutes.filter((route) => {
        const setupNo = setupStepKey(rowText(route, "SETUP NO.", "SETUP CODE", "setupNo"), effectiveOption);
        return routeChangeRemainingSetups.some((setup) => setup.plan && safeNumber(setup.quantity) > 0 && canonicalKey(setup.setupNo) === canonicalKey(setupNo));
      })
      : allSelectedRoutes;
    const rmInward = rmInwardByJc.get(canonicalKey(jcNo));
    const routeStatus = !effectiveOption && optionNumbers.length > 1
      ? "Select option"
      : selectedRoutes.length
        ? (routeChange ? "Route change plan" : (optionNumber || selectedOptionNumber ? "Ready" : "Auto single option"))
        : "Route master missing";
    const missingCycleRoutes = selectedRoutes.filter((route) => !cycleKeys.has(masterKey(route)));
    const missingToolingRoutes = selectedRoutes.filter((route) => !toolingKeys.has(masterKey(route)));
    const missingCycle = missingCycleRoutes.map((route) => setupStepKey(rowText(route, "SETUP NO.", "SETUP CODE", "setupNo"), effectiveOption));
    const missingTooling = missingToolingRoutes.map((route) => setupStepKey(rowText(route, "SETUP NO.", "SETUP CODE", "setupNo"), effectiveOption));
    const firstMissingRoute = missingCycleRoutes[0] ?? missingToolingRoutes[0] ?? selectedRoutes[0] ?? {};
    const actual = rawByJc.get(canonicalKey(jcNo));
    const orderPcs = safeNumber(rowValue(row, "ORD. PCS.", "orderPcs"));
    const dispatchStatus = dispatchJcKeys.has(canonicalKey(jcNo)) ? "Shifted to dispatch" : "In production";
    return {
      jcNo,
      fgPoNo: rowText(row, "FG PO NO.", "fgPoNo"),
      rmPoNo: rowText(row, "RM PO NO.", "rmPoNo"),
      poDate: rowText(row, "PO DATE", "poDate"),
      partCode,
      description: rowText(row, "DESCRIPTION", "description"),
      optionNumber: effectiveOption || "Not selected",
      optionSource: routeChange ? "Route change" : (optionNumber ? "Excel" : (selectedOptionNumber ? "Planner selected" : (effectiveOption ? "Auto single route" : "Planner required"))),
      routeChangeRemainingSetups,
      candidateOption: !optionNumber && effectiveOption ? effectiveOption : "-",
      availableOptions,
      orderPcs: round(orderPcs),
      orderKg: round(safeNumber(rowValue(row, "ORD. KG.", "orderKg"))),
      deliveryDate: rowText(row, "DELIVERY DATE", "deliveryDate"),
      missingSetupNo: setupStepKey(rowText(firstMissingRoute, "SETUP NO.", "SETUP CODE", "setupNo"), effectiveOption),
      missingSetupName: rowText(firstMissingRoute, "SETUP NAME", "setupName"),
      machineUsed: rowText(firstMissingRoute, "MACHINE USED", "machineUsed"),
      machineType: rowText(firstMissingRoute, "MACHINE TYPE", "machineType"),
      stageWeight: safeNumber(rowValue(firstMissingRoute, "STAGE WEIGHT (GRAM)", "stageWeight")),
      operationWeight: safeNumber(rowValue(firstMissingRoute, "OPERATION WISE WEIGHT (GRAM)", "operationWeight")) || safeNumber(rowValue(firstMissingRoute, "STAGE WEIGHT (GRAM)", "stageWeight")),
      rmStatus: isRmReceived(row, rmInward) ? "Received" : "Waiting",
      rmInwardDate: rowText(rmInward ?? {}, "RM I/W DATE", "rmInwardDate") || rowText(row, "RM I/W DATE", "rmInwardDate"),
      rmInwardKg: safeNumber(rowValue(rmInward ?? {}, "RM INWARD KG.", "rmInwardKg")) || safeNumber(rowValue(row, "RM INWARD KG.", "rmInwardKg")),
      plannerPriority: priorityLabel(plannerPriorityValue),
      plannerPriorityScore: plannerPriority ? priorityScore(plannerPriorityValue) : 0,
      priorityApprovalMode: plannerPriority ? priorityApprovalMode(plannerPriority) : "idle_queue_only",
      priorityInterruptedJcNo: plannerPriority ? rowText(plannerPriority, "interruptedJcNo", "INTERRUPTED JC NO", "STOPPED JC NO") : "",
      priorityInterruptedSetupNo: plannerPriority ? rowText(plannerPriority, "interruptedSetupNo", "INTERRUPTED SETUP NO", "STOPPED SETUP NO") : "",
      priorityInterruptedMachine: plannerPriority ? rowText(plannerPriority, "interruptedMachine", "INTERRUPTED MACHINE", "STOPPED MACHINE") : "",
      priorityInterruptedFinishedQty: plannerPriority ? safeNumber(rowValue(plannerPriority, "interruptedFinishedQty", "INTERRUPTED FINISHED QTY", "FINISHED QTY")) : 0,
      priorityInterruptedSetups: Array.isArray(plannerPriority?.interruptedSetups) ? plannerPriority.interruptedSetups : [],
      priorityRemark: plannerPriority ? rowText(plannerPriority, "remark", "REMARK") : "",
      routeStatus,
      cycleStatus: missingCycle.length ? `Missing setup ${compactJoin(missingCycle)}` : "Ready",
      toolingStatus: missingTooling.length ? `Missing setup ${compactJoin(missingTooling)}` : "Ready",
      rawOutputQty: round(actual?.outputQty ?? 0),
      rawActualQty: round(actual?.actualQty ?? 0),
      rawRejectQty: round(actual?.rejectQty ?? 0),
      rawRows: actual?.rows ?? 0,
      dispatchStatus,
      planningBlocker: routeStatus === "Ready" || routeStatus === "Auto single option"
        ? (missingCycle.length ? `Add cycle time for setup ${compactJoin(missingCycle)}` : (missingTooling.length ? `Add tooling plan for setup ${compactJoin(missingTooling)}` : "All checks ready"))
        : routeStatus,
    };
  });
  const prioritizedWorkOrderRows = [...workOrderOutputRows].sort(workOrderPlanningSort);
  const allWorkOrderGaps = workOrderOutputRows
    .map((row) => ({
      ...row,
      routeSelectionMissing: row.optionSource === "Planner required",
      routeMasterMissing: row.routeStatus === "Route master missing",
      cycleTimeMissing: row.cycleStatus.startsWith("Missing"),
      toolingPlanMissing: row.toolingStatus.startsWith("Missing"),
      missingAreas: [
        row.optionSource === "Planner required" ? "Route option" : "",
        row.routeStatus === "Route master missing" ? "Route master" : "",
        row.cycleStatus.startsWith("Missing") ? "Cycle time" : "",
        row.toolingStatus.startsWith("Missing") ? "Tooling plan" : "",
      ].filter(Boolean).join(", "),
      nextAction: row.planningBlocker,
    }))
    .filter((row) => row.routeSelectionMissing || row.routeMasterMissing || row.cycleTimeMissing || row.toolingPlanMissing);
  const masterGaps = allWorkOrderGaps.filter((row) => row.rmStatus === "Received");
  const combinedBatches = combinedRows(prioritizedWorkOrderRows, rawByJc, routeGroups, cycleKeys, toolingKeys);
  const machinePlanDetailRows = machinePlanDetails(prioritizedWorkOrderRows, rawByJc, rawBySetup, rawBySetupAnyMachine, routeGroups, cycleRows, toolingRows, machineRows, machineConstraints, planOverrides, shopFloorStatusRows, planningCalendar);
  const workflowExceptionRows = machinePlanDetailRows.filter((row) => row.rawProductionWithoutWorkflow);
  const setupChecklistHistoryRows: Record<string, unknown>[] = [];
  const setupChecklistMismatchRows: Record<string, unknown>[] = [];
  const machinePlanReady = workOrderOutputRows.filter((row) => row.rmStatus === "Received" && !row.routeStatus.includes("missing") && row.cycleStatus === "Ready" && row.toolingStatus === "Ready").length;
  const latestSetupDate = maxDate(setupChecklistRows.map((row) => parseDate(rowValue(row, "SETUP DATE", "setupDate"))));
  const totalOutputQty = sum([...rawByJc.values()].map((row) => row.outputQty));
  const totalActualQty = sum([...rawByJc.values()].map((row) => row.actualQty));
  const totalRejectQty = sum([...rawByJc.values()].map((row) => row.rejectQty));
  const activeMachineConstraints = machineConstraints.length;
  const activePlanOverrides = planOverrides.length;
  const activeRouteChanges = routeChanges.length;
  const plannerActionLog = [
    ...plannerPriorities.map((row) => ({ ...row, actionType: "Priority" })),
    ...machineConstraints.map((row) => ({ ...row, actionType: "Machine Unavailable" })),
    ...planOverrides.map((row) => ({ ...row, actionType: "Machine Switch" })),
    ...routeChanges.map((row) => ({ ...row, actionType: "Route Change" })),
  ].sort((a, b) => rowText(b, "createdAt", "loggedOn").localeCompare(rowText(a, "createdAt", "loggedOn")));

  return {
    sourceMap: productionSourceMap(),
    summary: {
      workOrders: workOrderRows.length,
      totalOrderQty: round(sum(workOrderRows.map((row) => safeNumber(rowValue(row, "ORD. PCS.", "orderPcs"))))),
      rawRows: productionRows.length,
      rawJobCards: rawByJc.size,
      matchedJobCards: workOrderOutputRows.filter((row) => rawByJc.has(canonicalKey(row.jcNo))).length,
      workOrdersWithoutRawActual: workOrderOutputRows.filter((row) => !rawByJc.has(canonicalKey(row.jcNo))).length,
      routeReady: workOrderOutputRows.filter((row) => row.routeStatus === "Ready" || row.routeStatus === "Auto single option").length,
      cycleReady: workOrderOutputRows.filter((row) => row.cycleStatus === "Ready").length,
      toolingReady: workOrderOutputRows.filter((row) => row.toolingStatus === "Ready").length,
      rmReady: workOrderOutputRows.filter((row) => row.rmStatus === "Received").length,
      optionMissing: workOrderOutputRows.filter((row) => row.optionSource === "Planner required").length,
      routeSelectionRequired: workOrderOutputRows.filter((row) => row.optionSource === "Planner required" && row.rmStatus === "Received").length,
      routeSelectionWaitingRm: workOrderOutputRows.filter((row) => row.optionSource === "Planner required" && row.rmStatus !== "Received").length,
      masterGapCount: masterGaps.length,
      awaitingShopFloorApproval: workOrderOutputRows.filter((row) => row.dispatchStatus === "Waiting shop floor approval").length,
      shiftedToDispatch: workOrderOutputRows.filter((row) => row.dispatchStatus === "Shifted to dispatch").length,
      totalActualQty: round(totalActualQty),
      totalOutputQty: round(totalOutputQty),
      totalRejectQty: round(totalRejectQty),
      dispatchShortQty: round(sum(dispatchRows.map((row) => safeNumber(rowValue(row, "DISPATCH SHORT QTY", "dispatchShortQty"))))),
      machinePlanReady,
      machinePlanReadyGroups: new Set(workOrderOutputRows.filter((row) => row.rmStatus === "Received").map((row) => [canonicalKey(row.partCode), row.optionNumber].join("|"))).size,
      parallelSetupNeeded: combinedBatches.filter((row) => Number(row.orders) > 1).length,
      deliveryRiskSetups: 0,
      activeMachineConstraints,
      activePlanOverrides,
      activeRouteChanges,
      plannerActionLog: plannerActionLog.length,
      workflowExceptions: workflowExceptionRows.length,
      setupChecklistMismatches: 0,
      compulsoryMachineShifts: planOverrides.length,
      latestRawDate: dateLabel(latestRawDate),
      latestSetupDate: dateLabel(latestSetupDate),
    },
    validation: {
      summary: {
        issues: masterGaps.length,
        missingRouteOption: masterGaps.filter((row) => row.routeSelectionMissing).length,
        routeSelectionWaitingRm: 0,
        missingRouteMaster: masterGaps.filter((row) => row.routeMasterMissing).length,
        missingCycleTime: masterGaps.filter((row) => row.cycleTimeMissing).length,
        missingTooling: masterGaps.filter((row) => row.toolingPlanMissing).length,
        rawJobCardsNotInWorkOrders: 0,
        rawJobCardsNotInWorkOrdersOrDispatch: 0,
        rawRoutesNotInMaster: 0,
        activeMachineConstraints,
        activeRouteChanges,
      },
      issues: masterGaps.map((row) => ({ severity: "warning", sourceSheet: "Work_Order_Import", key: row.jcNo || row.partCode, message: row.nextAction })),
    },
    workOrders: prioritizedWorkOrderRows,
    jobCardStatusTiles: workOrderOutputRows,
    routeSelectionRequired: workOrderOutputRows.filter((row) => row.optionSource === "Planner required" && row.rmStatus === "Received"),
    routeSelectionWaitingRm: workOrderOutputRows.filter((row) => row.optionSource === "Planner required" && row.rmStatus !== "Received"),
    masterGaps,
    allWorkOrderGaps,
    runningParts: [],
    dispatchHandoff: [],
    jobCardSetupProgress: setupCompletions,
    combinedBatches,
    groupedJobCards: { summary: {}, planningGroups: combinedBatches, productionGroups: [] },
    machinePlanRows: combinedBatches,
    machinePlanningRows: machineRows,
    machinePlanDetailRows,
    planningHolidayRows: planningHolidayViewRows(planningHolidayRows),
    planningCalendar: {
      weeklyHoliday: "Friday",
      holidayDates: [...planningCalendar.holidayDates].sort(),
    },
    workflowExceptionRows,
    machineConstraints,
    machineConstraintRows: machineConstraints,
    machineConstraintImpacts: [],
    planOverrides,
    planOverrideRows: planOverrides,
    planOverrideImpacts: [],
    routeChanges,
    routeChangeRows: routeChanges,
    routeChangeImpacts: [],
    routeMasterRows: dedupedRouteRows.map((row) => ({
      partNo: rowText(row, "PART NO", "PART CODE", "partNo"),
      optionNumber: rowText(row, "OPTION NUMBER", "optionNumber"),
      setupNo: rowText(row, "SETUP NO.", "SETUP CODE", "setupNo"),
      displaySetupNo: setupStepKey(rowText(row, "SETUP NO.", "SETUP CODE", "setupNo"), rowText(row, "OPTION NUMBER", "optionNumber")),
      setupName: rowText(row, "SETUP NAME", "setupName"),
      machineUsed: rowText(row, "MACHINE USED", "machineUsed", "machine"),
      machineType: rowText(row, "MACHINE TYPE", "machineType"),
    })),
    routeOptions: routeSelections,
    plannerActionLog,
    setupFlow: [],
    dispatchRows: dispatchApprovals,
    dispatchLoss: dispatchRows,
    jobCardSetupProgressRows: setupCompletions,
    setupChecklistHistoryRows,
    setupChecklistMismatchRows,
    firstPieceInspectionMasterRows,
    firstPieceInspectionReportRows,
  };
}

function setupChecklistMismatches(setupRows: Array<Record<string, unknown>>, plannedRows: Array<Record<string, unknown>>) {
  const plannedByExactKey = new Set(plannedRows.map((row) => setupChecklistKey({
    jcNo: rowText(row, "jcNo"),
    partCode: rowText(row, "partCode"),
    optionNumber: rowText(row, "optionNumber"),
    setupNo: rowText(row, "setupNo"),
    machine: rowText(row, "machine"),
  })).filter(Boolean));

  return setupRows
    .map((row) => {
      const target = {
        jcNo: rowText(row, "jcNo"),
        partCode: rowText(row, "partCode"),
        optionNumber: rowText(row, "optionNumber"),
        setupNo: rowText(row, "setupNo"),
        machine: rowText(row, "machine"),
      };
      const exactKey = setupChecklistKey(target);
      if (exactKey && plannedByExactKey.has(exactKey)) return null;

      const missingFields = [
        target.jcNo ? "" : "JC number",
        target.partCode ? "" : "Part code",
        target.optionNumber ? "" : "Option number",
        target.setupNo ? "" : "Setup number",
        target.machine ? "" : "Machine number",
      ].filter(Boolean);
      const closest = closestPlannedSetup(target, plannedRows);
      const mismatchFields = closest ? [
        canonicalKey(target.jcNo) === canonicalKey(rowText(closest, "jcNo")) ? "" : `JC expected ${rowText(closest, "jcNo") || "-"}`,
        canonicalKey(target.partCode) === canonicalKey(rowText(closest, "partCode")) ? "" : `Part expected ${rowText(closest, "partCode") || "-"}`,
        canonicalKey(target.optionNumber) === canonicalKey(rowText(closest, "optionNumber")) ? "" : `Option expected ${rowText(closest, "optionNumber") || "-"}`,
        setupStepKey(target.setupNo, target.optionNumber) === setupStepKey(rowText(closest, "setupNo"), rowText(closest, "optionNumber")) ? "" : `Setup expected ${setupStepKey(rowText(closest, "setupNo"), rowText(closest, "optionNumber")) || "-"}`,
        canonicalKey(target.machine) === canonicalKey(rowText(closest, "machine")) ? "" : `Machine expected ${rowText(closest, "machine") || "-"}`,
      ].filter(Boolean) : [];
      const nextAction = missingFields.length
        ? `Correct setup checklist: missing ${compactJoin(missingFields)}`
        : mismatchFields.length
          ? `Review setup checklist: ${compactJoin(mismatchFields)}`
          : "Review setup checklist: no planned setup matches this entry";
      return {
        ...row,
        status: "Needs planner review",
        issueType: "Setup checklist mismatch",
        missingFields: compactJoin(missingFields),
        mismatchFields: compactJoin(mismatchFields),
        plannedJobCard: closest ? rowText(closest, "jcNo") : "",
        plannedPartCode: closest ? rowText(closest, "partCode") : "",
        plannedOptionNumber: closest ? rowText(closest, "optionNumber") : "",
        plannedSetupNo: closest ? rowText(closest, "setupNo") : "",
        plannedMachine: closest ? rowText(closest, "machine") : "",
        nextAction,
      };
    })
    .filter(Boolean);
}

function closestPlannedSetup(target: { jcNo: string; partCode: string; optionNumber: string; setupNo: string; machine: string }, plannedRows: Array<Record<string, unknown>>) {
  let best: { row: Record<string, unknown>; score: number } | undefined;
  for (const row of plannedRows) {
    const score = [
      canonicalKey(target.jcNo) && canonicalKey(target.jcNo) === canonicalKey(rowText(row, "jcNo")),
      canonicalKey(target.partCode) && canonicalKey(target.partCode) === canonicalKey(rowText(row, "partCode")),
      canonicalKey(target.optionNumber) && canonicalKey(target.optionNumber) === canonicalKey(rowText(row, "optionNumber")),
      setupStepKey(target.setupNo, target.optionNumber) && setupStepKey(target.setupNo, target.optionNumber) === setupStepKey(rowText(row, "setupNo"), rowText(row, "optionNumber")),
      canonicalKey(target.machine) && canonicalKey(target.machine) === canonicalKey(rowText(row, "machine")),
    ].filter(Boolean).length;
    if (!best || score > best.score) best = { row, score };
  }
  return best && best.score > 0 ? best.row : undefined;
}

function setupChecklistHistory(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const setupDate = parseDate(rowValue(row, "SETUP DATE", "setupDate"));
    const minutes = settingMinutesFromRow(row);
    return {
      _id: rowText(row, "_id"),
      key: rowText(row, "key"),
      setupDate: dateLabel(setupDate || rowValue(row, "SETUP DATE", "setupDate")),
      setupDateValue: setupDate || rowText(row, "SETUP DATE", "setupDate"),
      setupDateKey: setupDate || "",
      jcNo: rowText(row, "JC NO.", "JC NO", "JobCardNo", "jcNo"),
      machine: rowText(row, "M/C NO", "MACHINE NO", "machineNo"),
      partCode: rowText(row, "PART NO", "PART CODE", "partNo"),
      optionNumber: rowText(row, "OPTION NUMBER", "OPTION NO", "optionNumber"),
      setupNo: rowText(row, "SETUP NO.", "SETUP NO", "SET UP", "setupNo"),
      shift: rowText(row, "SHIFT", "shift"),
      setterCode: rowText(row, "SETTER Code", "SETTER CODE", "setterCode"),
      helperCode: rowText(row, "HELPER Code", "HELPER CODE", "helperCode"),
      settingStartTime: rowText(row, "SETTING START TIME", "settingStartTime"),
      settingEndTime: rowText(row, "SETTING END TIME", "settingEndTime"),
      settingMinutes: minutes,
      qcController: rowText(row, "QC CONTROLLER", "qcController"),
      rimmerAvailability: rowText(row, "RIMMER AVAILABILITY", "rimmerAvailability"),
      modhiyu: rowText(row, "MODHIYU", "modhiyu"),
      remarks: rowText(row, "REMARKS", "REMARK", "remarks"),
      status: "Setup complete",
    };
  }).sort((a, b) =>
    rowText(b, "setupDateKey").localeCompare(rowText(a, "setupDateKey")) ||
    rowText(a, "machine").localeCompare(rowText(b, "machine"), undefined, { numeric: true }) ||
    rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true }) ||
    numericSort(rowText(a, "setupNo"), rowText(b, "setupNo")),
  );
}

function buildSetupAnalytics(rows: Record<string, unknown>[], filters: DashboardFilters) {
  const daily = new Map<string, { dateKey: string; date: string; setter: string; settings: number; totalMinutes: number; machines: Set<string>; itemSetups: Set<string> }>();
  const monthly = new Map<string, { monthKey: string; month: string; setter: string; settings: number; totalMinutes: number; machines: Set<string>; itemSetups: Set<string> }>();
  const setters = new Map<string, { setter: string; settings: number; totalMinutes: number; machines: Set<string>; itemSetups: Set<string> }>();
  const setupCodes = new Map<string, { itemCode: string; setupNo: string; settings: number; totalMinutes: number; setters: Set<string>; machines: Set<string>; rows: Array<{ setter: string; machine: string; minutes: number }> }>();
  const monthsForFilter: Record<string, string> = {};
  const setupRows: Array<Record<string, unknown>> = [];
  let filteredRows = 0;
  for (const row of rows) {
    const settingDate = parseDate(rowValue(row, "DATE", "SETUP DATE", "SETTING DATE", "setupDate"));
    if (!settingDate) continue;
    const [monthKeyValue, monthLabelValue] = monthKey(settingDate);
    monthsForFilter[monthKeyValue] = monthLabelValue;
    if (filters.month && monthKeyValue !== filters.month) continue;
    if (filters.startDate && settingDate < filters.startDate) continue;
    if (filters.endDate && settingDate > filters.endDate) continue;
    const machine = rowText(row, "MACHINE NO.", "M/C NO", "MACHINE NO", "machineNo");
    if (filters.machine && machine !== filters.machine) continue;
    const setter = rowText(row, "SETTER Code", "SETTER CODE", "SETTING PERSON CODE", "SETTING PERSON", "SETTER NAME", "setterCode") || "Unspecified";
    const itemCode = rowText(row, "ITEM CODE", "PART NO", "PART CODE", "partNo") || "Unspecified";
    const setupNo = rowText(row, "SETUP NO.", "SETUP NO", "SET UP", "setupNo") || "Unspecified";
    const itemSetupKey = `${itemCode} | ${setupNo}`;
    const minutes = settingMinutesFromRow(row);
    const [dateKeyValue, dateLabelValue] = dateKey(settingDate);
    filteredRows += 1;
    setupRows.push({
      dateKey: dateKeyValue,
      date: dateLabelValue,
      monthKey: monthKeyValue,
      month: monthLabelValue,
      setter,
      machine,
      itemCode,
      setupNo,
      minutes,
      shift: rowText(row, "SHIFT", "Shift", "shift"),
      location: rowText(row, "LOCATION", "Location", "location"),
      jcNo: rowText(row, "JC NO.", "JC NO", "JobCardNo", "jcNo"),
    });

    addSetupTotal(getOrCreate(daily, [dateKeyValue, setter].join("|"), () => ({ dateKey: dateKeyValue, date: dateLabelValue, setter, settings: 0, totalMinutes: 0, machines: new Set<string>(), itemSetups: new Set<string>() })), minutes, machine, itemSetupKey);
    addSetupTotal(getOrCreate(monthly, [monthKeyValue, setter].join("|"), () => ({ monthKey: monthKeyValue, month: monthLabelValue, setter, settings: 0, totalMinutes: 0, machines: new Set<string>(), itemSetups: new Set<string>() })), minutes, machine, itemSetupKey);
    addSetupTotal(getOrCreate(setters, setter, () => ({ setter, settings: 0, totalMinutes: 0, machines: new Set<string>(), itemSetups: new Set<string>() })), minutes, machine, itemSetupKey);
    const setupCode = getOrCreate(setupCodes, [itemCode, setupNo].join("|"), () => ({ itemCode, setupNo, settings: 0, totalMinutes: 0, setters: new Set<string>(), machines: new Set<string>(), rows: [] }));
    setupCode.settings += 1;
    setupCode.totalMinutes += minutes;
    setupCode.setters.add(setter);
    setupCode.machines.add(machine);
    setupCode.rows.push({ setter, machine, minutes });
  }
  const setterPerformance = [...setters.values()].map(setupAggregateRow).sort((a, b) => b.settings - a.settings);
  const totalMinutes = sum(setterPerformance.map((row) => row.totalMinutes));
  const totalSettings = sum(setterPerformance.map((row) => row.settings));
  return {
    summary: {
      totalSettings,
      avgMinutes: ratio(totalMinutes, totalSettings),
      totalMinutes: round(totalMinutes),
      activeSetters: setterPerformance.length,
      uniqueItemSetups: setupCodes.size,
      filteredRows,
    },
    dailyBySetter: [...daily.values()].map(setupAggregateRow).sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.settings - a.settings),
    monthlyBySetter: [...monthly.values()].map(setupAggregateRow).sort((a, b) => b.monthKey.localeCompare(a.monthKey) || b.settings - a.settings),
    setterPerformance,
    rows: setupRows,
    setupRows,
    sameSetupComparison: [...setupCodes.values()]
      .filter((row) => row.settings >= 2 && row.rows.some((item) => item.minutes > 0))
      .map((row) => {
        const valid = row.rows.filter((item) => item.minutes > 0).sort((a, b) => a.minutes - b.minutes);
        const fastest = valid[0]!;
        const slowest = valid[valid.length - 1]!;
        const minutes = valid.map((item) => item.minutes);
        return {
          itemCode: row.itemCode,
          setupNo: row.setupNo,
          settings: row.settings,
          setters: row.setters.size,
          machines: row.machines.size,
          avgMinutes: ratio(sum(minutes), minutes.length),
          minMinutes: Math.min(...minutes),
          maxMinutes: Math.max(...minutes),
          spreadMinutes: Math.max(...minutes) - Math.min(...minutes),
          fastestSetter: fastest.setter,
          fastestMachine: fastest.machine,
          slowestSetter: slowest.setter,
          slowestMachine: slowest.machine,
        };
      })
      .sort((a, b) => b.spreadMinutes - a.spreadMinutes || b.settings - a.settings),
    monthsForFilter,
  };
}

function normalizedRawSoftwareRows(rows: Record<string, unknown>[], routeLookup: Map<string, Record<string, string>>) {
  return rows
    .filter((row) => Number.isFinite(Number(rowValue(row, "Sr"))))
    .map((row) => {
      const partNo = rowValue(row, "PART NO");
      const setup = rowValue(row, "SET UP");
      const route = routeLookup.get(routeKey(partNo, setup)) ?? {};
      const mapped: Record<string, unknown> = {
        "PRODUCTION DATE": rowValue(row, "PROD DATE"),
        SHIFT: rowValue(row, "Shift"),
        LOCATION: rowValue(row, "Location"),
        "MACHINE NO": rowValue(row, "M/C NO"),
        "OPERATOR ID": rowValue(row, "OPERATOR NAME"),
        "PART CODE": partNo,
        "SETUP CODE": setup,
        "MACHINE TYPE": route.machineType || "Unspecified",
        "MACHINE START TIME": rowValue(row, "M/C START TIME"),
        "MACHINE END TIME": rowValue(row, "M/C END TIME"),
        "TOTAL DOWNTIME MINUTES": rowValue(row, "M/C DOWN TIME", "DownTime"),
        "PRODUCTION QTY (PCS)": rowValue(row, "PROD QTY IN PCS"),
        "TARGET QTY (PCS)": rowValue(row, "Target Pcs"),
        "EFFICIENCY %": rowValue(row, "Efficiency"),
        REMARKS: rowValue(row, "REMARKS"),
        "QC APPROVAL DOWNTIME (MIN)": rowValue(row, "QCDown"),
        "MACHINE SETTING DOWNTIME (MIN)": rowValue(row, "SettingDown"),
        "NO RAW MATERIAL DOWNTIME (MIN)": rowValue(row, "NoRMDown"),
        "NO OPERATOR DOWNTIME (MIN)": rowValue(row, "NoOpDown"),
        "NO ELECTRICITY DOWNTIME (MIN)": rowValue(row, "NoElecDown"),
        "OTHER DOWNTIME (MIN)": rowValue(row, "OtherDown"),
        "SCHEDULED BREAK TIME (MINUTES)": rowValue(row, "Breaks"),
        JobCardNo: rowValue(row, "JobCardNo"),
        "ACTUAL QTY IN PCS": rowValue(row, "ACTUAL QTY IN PCS"),
      };
      for (let index = 1; index <= rejectionEntryCount; index += 1) {
        mapped[`REJECTION ${index} TYPE OF REJECTION`] = rowValue(row, `RejType${index}`);
        mapped[`REJECTION ${index} REASON FOR REJECTION`] = rowValue(row, `RejReason${index}`);
        mapped[`REJECTION ${index} REMARK`] = rowValue(row, `RejRemarks${index}`);
        mapped[`REJECTION ${index} QUANTITY (PCS)`] = rowValue(row, `RejQty${index}`);
      }
      return mapped;
    });
}

function normalizedProductionEntries(entries: ProductionEntry[]) {
  return entries.map((entry) => ({
    "PRODUCTION DATE": entry.prodDate,
    "MACHINE NO": entry.machine,
    "OPERATOR ID": entry.operatorId,
    "PART CODE": entry.partCode,
    "SETUP CODE": entry.setupNo,
    "MACHINE TYPE": entry.machineType,
    "PRODUCTION QTY (PCS)": entry.outputQty,
    "TARGET QTY (PCS)": entry.targetQty,
    "REJECTION 1 TYPE OF REJECTION": entry.rejectionType,
    "REJECTION 1 REMARK": entry.rejectionRemark,
    "REJECTION 1 REASON FOR REJECTION": entry.rejectionRemark,
    "REJECTION 1 QUANTITY (PCS)": entry.rejectQty,
    "TOTAL DOWNTIME MINUTES": entry.downtimeMinutes,
    JobCardNo: entry.jobCard,
    "ACTUAL QTY IN PCS": entry.actualQty,
  }));
}

function bucketDataEntries(entries: DataEntry[]) {
  const buckets = new Map<string, Array<Record<string, unknown>>>();
  for (const entry of entries) {
    const payload = asRecord(entry.payload);
    const row = { ...payload, _id: entry._id, key: entry.key, entryType: entry.entryType, createdAt: entry.createdAt };
    const bucket = buckets.get(entry.entryType) ?? [];
    bucket.push(row);
    buckets.set(entry.entryType, bucket);
  }
  return buckets;
}

function entryRows(buckets: Map<string, Array<Record<string, unknown>>>, entryType: string) {
  return buckets.get(entryType) ?? [];
}

function latestEntryRowsByKey(
  rows: Array<Record<string, unknown>>,
  keyForRow: (row: Record<string, unknown>) => string,
) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = keyForRow(row) || rowText(row, "key") || rowText(row, "_id");
    if (!key) continue;
    const current = latest.get(key);
    if (!current || latestEntryTimestamp(row) >= latestEntryTimestamp(current)) latest.set(key, row);
  }
  return [...latest.values()];
}

function latestEntryTimestamp(row: Record<string, unknown>) {
  return rowText(row, "taskCompletedAt", "completedAt", "createdAt");
}

function shopFloorStatusEntryKey(row: Record<string, unknown>) {
  return setupChecklistKey({
    jcNo: rowText(row, "jcNo", "JC NO.", "JC NO"),
    partCode: rowText(row, "partCode", "partNo", "PART CODE", "PART NO"),
    optionNumber: rowText(row, "optionNumber", "OPTION NUMBER", "OPTION NO"),
    setupNo: rowText(row, "setupNo", "SETUP NO.", "SETUP NO", "SET UP"),
    machine: rowText(row, "machine", "machineNo", "M/C NO", "MACHINE NO", "MACHINE NO."),
  });
}

function firstPieceReportEntryKey(row: Record<string, unknown>) {
  return setupChecklistKey({
    jcNo: rowText(row, "jcNo", "JC NO.", "JC NO"),
    partCode: rowText(row, "partCode", "partNo", "PART CODE", "PART NO"),
    optionNumber: rowText(row, "optionNumber", "OPTION NUMBER", "OPTION NO"),
    setupNo: rowText(row, "setupNo", "SETUP NO.", "SETUP NO", "SET UP"),
    machine: rowText(row, "machine", "machineNo", "M/C NO", "MACHINE NO", "MACHINE NO."),
  });
}

function planningHolidayEntryKey(row: Record<string, unknown>) {
  return [
    parseDate(rowValue(row, "date", "holidayDate", "fromDate", "startDate")) || rowText(row, "date", "holidayDate", "fromDate", "startDate"),
    canonicalKey(rowText(row, "scope")),
    canonicalKey(rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO")),
    canonicalKey(rowText(row, "department")),
  ].join("|");
}

function loadRouteLookup(rows: Record<string, unknown>[]) {
  const lookup = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const partNo = rowValue(row, "PART CODE", "PART NO", "partNo");
    const setupNo = rowValue(row, "SETUP CODE", "SETUP NO.", "SET UP", "setupNo");
    const key = routeKey(partNo, setupNo);
    if (!key || lookup.has(key)) continue;
    lookup.set(key, {
      machineType: rowText(row, "MACHINE TYPE", "machineType"),
      machineUsed: rowText(row, "MACHINE USED", "machineUsed"),
      setupName: rowText(row, "SETUP NAME", "setupName"),
    });
  }
  return lookup;
}

function buildAttendanceRows(records: AttendanceRecord[], employees: Map<string, string>, filters: DashboardFilters) {
  const totals = new Map<string, { workingDays: number; presentDays: number; records: number; score: number }>();
  const monthsInScope = new Map<string, string>();
  for (const row of records) {
    if (filters.month && row.monthKey !== filters.month) continue;
    if (filters.startDate || filters.endDate) {
      const [start, end] = attendanceMonthBounds(row.monthKey);
      if (filters.startDate && end && end <= filters.startDate) continue;
      if (filters.endDate && start && start > filters.endDate) continue;
    }
    monthsInScope.set(row.monthKey, monthLabelFromKey(row.monthKey));
    const rec = getOrCreate(totals, row.operatorId, () => ({ workingDays: 0, presentDays: 0, records: 0, score: 0 }));
    rec.workingDays += safeNumber(row.workingDays);
    rec.presentDays += safeNumber(row.presentDays);
    rec.score += safeNumber(row.score);
    rec.records += 1;
  }
  return {
    rows: [...totals.entries()]
      .map(([operatorId, row]) => ({
        operatorId,
        name: employees.get(operatorId) ?? operatorId,
        attendancePct: ratio(row.presentDays, row.workingDays),
        workingDays: row.workingDays,
        presentDays: row.presentDays,
        avgScore: ratio(row.score, row.records),
      }))
      .sort((a, b) => b.attendancePct - a.attendancePct),
    scope: [...monthsInScope.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label).join(", ") || "No attendance records for selected filter",
  };
}

function buildPendingTraining(records: TrainingRecord[], employees: Map<string, string>, departments: Map<string, string>) {
  return records
    .filter((row) => !["complete", "completed", "done", "closed"].includes(row.status.trim().toLowerCase()))
    .map((row) => ({
      operatorId: row.operatorId,
      name: row.operatorName || employees.get(row.operatorId) || row.operatorId,
      department: row.department || departments.get(row.operatorId) || "",
      date: row.date || "",
      trainingType: row.trainingType,
      reason: row.reason || "",
      trainer: row.trainer || "",
      status: row.status || "Pending",
    }));
}

function buildTrainingRecordsByOperator(records: TrainingRecord[], employees: Map<string, string>, departments: Map<string, string>) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const record of records) {
    const row = record as Record<string, unknown>;
    const operatorId = record.operatorId;
    const completionDate = parseDate(rowValue(row, "completionDate", "Completion Date", "date"));
    const trainingRecord = {
      operatorId,
      name: record.operatorName || employees.get(operatorId) || operatorId,
      department: record.department || departments.get(operatorId) || "",
      trainingType: record.trainingType || "Unspecified",
      status: record.status || "Pending",
      completionDate,
      effectiveness: rowText(row, "effectiveness", "Effectiveness"),
    };
    const list = grouped.get(operatorId) ?? [];
    list.push(trainingRecord);
    grouped.set(operatorId, list);
  }
  return grouped;
}

function buildTrainingGuidance(
  operatorPerformance: Array<Record<string, unknown>>,
  attendanceRows: Array<Record<string, unknown>>,
  machineTypeRows: Array<Record<string, unknown>>,
  rejectHotspots: Array<Record<string, unknown>>,
  productionEntries: Array<Record<string, unknown>>,
  trainingRecordsByOperator: Map<string, Array<Record<string, unknown>>>,
  overallRejectRate: number,
) {
  const efficiencyThreshold = 0.9;
  const attendanceThreshold = 0.9;
  const rejectThreshold = Math.max(0.01, overallRejectRate * 2);
  const minPostTrainingRuns = 5;
  const attendanceById = new Map(attendanceRows.map((row) => [rowText(row, "operatorId"), row]));
  const hotspotsById = groupByRecord(rejectHotspots, (row) => rowText(row, "operatorId"));
  const machineTypesById = groupByRecord(machineTypeRows, (row) => rowText(row, "operatorId"));
  const productionById = groupByRecord(productionEntries, (row) => rowText(row, "operatorId"));

  const guidanceRows = [];
  for (const operator of operatorPerformance) {
    const operatorId = rowText(operator, "operatorId");
    const reasons: string[] = [];
    const recommended: string[] = [];
    const efficiency = safeNumber(rowValue(operator, "efficiency"));
    const rejectRate = safeNumber(rowValue(operator, "rejectRate"));
    const reject = safeNumber(rowValue(operator, "reject"));
    const runs = safeNumber(rowValue(operator, "runs"));

    if (efficiency < efficiencyThreshold && runs >= 5) {
      reasons.push(`Efficiency ${percentText(efficiency)} below 90%`);
      recommended.push("Target achievement and work-method training");
    }

    if (rejectRate > rejectThreshold && reject >= 50) {
      const topReject = (hotspotsById.get(operatorId) ?? [])[0];
      if (topReject) {
        reasons.push(`High rejection: ${round(safeNumber(rowValue(topReject, "reject")), 0)} pcs on part ${rowText(topReject, "partNo")} setup ${rowText(topReject, "setup")}`);
        recommended.push(`Quality training for part ${rowText(topReject, "partNo")} / setup ${rowText(topReject, "setup")}`);
      } else {
        reasons.push(`Reject rate ${percentText(rejectRate)} above threshold`);
        recommended.push("Quality and rejection-control training");
      }
    }

    const attendance = attendanceById.get(operatorId);
    const attendancePct = attendance ? safeNumber(rowValue(attendance, "attendancePct")) : 0;
    if (attendance && attendancePct < attendanceThreshold) {
      reasons.push(`Attendance ${percentText(attendancePct)} below 90%`);
      recommended.push("Attendance counselling and support discussion");
    }

    const weakMachineType = (machineTypesById.get(operatorId) ?? [])
      .sort((a, b) => safeNumber(rowValue(a, "efficiency")) - safeNumber(rowValue(b, "efficiency")))
      .find((row) => safeNumber(rowValue(row, "runs")) >= 3 && safeNumber(rowValue(row, "efficiency")) < efficiencyThreshold);
    if (weakMachineType) {
      reasons.push(`Weak on ${rowText(weakMachineType, "machineType")}: ${percentText(safeNumber(rowValue(weakMachineType, "efficiency")))} efficiency`);
      recommended.push(`${rowText(weakMachineType, "machineType")} machine SOP and setup training`);
    }

    if (!reasons.length) continue;

    const records = trainingRecordsByOperator.get(operatorId) ?? [];
    const completed = records.filter((record) => isCompletedTraining(record) && rowText(record, "completionDate"));
    const pending = records.filter((record) => !isCompletedTraining(record));
    const latestCompleted = completed.sort((a, b) => rowText(b, "completionDate").localeCompare(rowText(a, "completionDate")))[0];
    let postTraining: ReturnType<typeof summarizeEntries> | null = null;
    let action = "Training Required First";
    if (pending.length) action = "Training Pending";
    if (latestCompleted) {
      const completionDate = rowText(latestCompleted, "completionDate");
      postTraining = summarizeEntries((productionById.get(operatorId) ?? []).filter((entry) => rowText(entry, "prodDate") > completionDate));
      if (postTraining.runs < minPostTrainingRuns) {
        action = "Monitor After Training";
      } else if (postTraining.efficiency < efficiencyThreshold || postTraining.rejectRate > rejectThreshold) {
        action = "Management Review After Training";
      } else {
        action = "Improved / Continue Monitoring";
      }
    }

    guidanceRows.push({
      operatorId,
      name: rowText(operator, "name"),
      output: safeNumber(rowValue(operator, "output")),
      efficiency,
      reject,
      rejectRate,
      attendancePct,
      recommendedTraining: [...new Set(recommended)].sort(),
      reasons,
      trainingRecords: records.length,
      pendingTraining: pending.length,
      completedTraining: completed.length,
      latestCompletedTraining: latestCompleted ? rowText(latestCompleted, "trainingType") : "",
      latestCompletionDate: latestCompleted ? dateLabel(rowText(latestCompleted, "completionDate")) : "",
      postTraining,
      action,
    });
  }

  const actionOrder: Record<string, number> = {
    "Management Review After Training": 0,
    "Training Required First": 1,
    "Training Pending": 2,
    "Monitor After Training": 3,
    "Improved / Continue Monitoring": 4,
  };
  guidanceRows.sort((a, b) => (actionOrder[a.action] ?? 9) - (actionOrder[b.action] ?? 9) || a.efficiency - b.efficiency || b.rejectRate - a.rejectRate);

  return {
    summary: {
      trainingRequired: guidanceRows.filter((row) => row.action === "Training Required First").length,
      trainingPending: guidanceRows.filter((row) => row.action === "Training Pending").length,
      monitorAfterTraining: guidanceRows.filter((row) => row.action === "Monitor After Training").length,
      managementReviewAfterTraining: guidanceRows.filter((row) => row.action === "Management Review After Training").length,
      improvedAfterTraining: guidanceRows.filter((row) => row.action === "Improved / Continue Monitoring").length,
      rejectThreshold,
      efficiencyThreshold,
    },
    rows: guidanceRows,
    note: "This is a decision-support view. It flags training and post-training management review; it is not an automatic termination recommendation.",
  };
}

function buildMonthlyTrainingPlan(
  monthlyMachineTypeTotals: MonthlyMachineTypeTotal[],
  employees: Map<string, string>,
  trainingRecordsByOperator: Map<string, Array<Record<string, unknown>>>,
  overallRejectRate: number,
) {
  const efficiencyThreshold = 0.9;
  const rejectThreshold = Math.max(0.01, overallRejectRate * 2);
  const monthKeys = [...new Set(monthlyMachineTypeTotals.map((row) => row.monthKey).filter(Boolean))].sort();
  if (!monthKeys.length) return [];
  const currentMonth = monthKeys[monthKeys.length - 1]!;
  const previousMonth = previousMonthKey(currentMonth);
  const allowedMonths = new Set([previousMonth, currentMonth]);
  const byOperator = new Map<string, Record<string, unknown> & { priority: PriorityTuple }>();

  for (const row of monthlyMachineTypeTotals) {
    if (!allowedMonths.has(row.monthKey)) continue;
    const efficiency = ratio(row.output, row.target);
    const rejectRate = ratio(row.reject, row.output);
    if (row.runs < 3) continue;
    if (efficiency >= efficiencyThreshold && rejectRate <= rejectThreshold) continue;

    const reasons: string[] = [];
    const training: string[] = [];
    if (efficiency < efficiencyThreshold) {
      reasons.push(`Efficiency ${percentText(efficiency)} below 90%`);
      training.push(`${row.machineType} machine SOP and target achievement`);
    }
    if (rejectRate > rejectThreshold && row.reject >= 10) {
      reasons.push(`Reject rate ${percentText(rejectRate)} above threshold`);
      training.push(`${row.machineType} quality and rejection-control training`);
    }
    if (!reasons.length) continue;

    const records = trainingRecordsByOperator.get(row.operatorId) ?? [];
    const pending = records.filter((record) => !isCompletedTraining(record));
    const completed = records.filter(isCompletedTraining);
    const candidate = {
      monthKey: row.monthKey,
      month: row.month,
      operatorId: row.operatorId,
      name: employees.get(row.operatorId) ?? row.operatorId,
      machineType: row.machineType,
      output: round(row.output),
      target: round(row.target),
      reject: round(row.reject),
      efficiency,
      rejectRate,
      runs: row.runs,
      recommendedTraining: [...new Set(training)].sort(),
      reason: reasons,
      trainingStatus: pending.length ? "Pending in tracker" : completed.length ? "Completed in tracker" : "Not recorded",
      priority: [row.monthKey === currentMonth ? 1 : 0, efficiency < efficiencyThreshold ? 1 : 0, rejectRate, -efficiency] as PriorityTuple,
    };
    const existing = byOperator.get(row.operatorId);
    if (!existing || comparePriority(candidate.priority, existing.priority) > 0) {
      byOperator.set(row.operatorId, candidate);
    }
  }

  return [...byOperator.values()]
    .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "priority")))
    .sort((a, b) => (rowText(a, "monthKey") === currentMonth ? 0 : 1) - (rowText(b, "monthKey") === currentMonth ? 0 : 1) || safeNumber(rowValue(a, "efficiency")) - safeNumber(rowValue(b, "efficiency")) || safeNumber(rowValue(b, "rejectRate")) - safeNumber(rowValue(a, "rejectRate")));
}

function isCompletedTraining(record: Record<string, unknown>) {
  return ["complete", "completed", "done", "closed"].includes(rowText(record, "status").toLowerCase());
}

function summarizeEntries(entries: Array<Record<string, unknown>>) {
  const output = sum(entries.map((entry) => safeNumber(rowValue(entry, "output"))));
  const target = sum(entries.map((entry) => safeNumber(rowValue(entry, "target"))));
  const reject = sum(entries.map((entry) => safeNumber(rowValue(entry, "reject"))));
  return {
    output: round(output),
    target: round(target),
    reject: round(reject),
    efficiency: ratio(output, target),
    rejectRate: ratio(reject, output),
    runs: entries.length,
  };
}

function groupByRecord(rows: Array<Record<string, unknown>>, key: (row: Record<string, unknown>) => string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const groupKey = key(row);
    const list = grouped.get(groupKey) ?? [];
    list.push(row);
    grouped.set(groupKey, list);
  }
  return grouped;
}

function comparePriority(left: PriorityTuple, right: PriorityTuple) {
  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index]! - right[index]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function previousMonthKey(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  return monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

function percentText(value: number) {
  return `${round(value * 100, 1)}%`;
}

function buildToolFixtureNumbers(rows: Record<string, unknown>[]) {
  const usedByPrefix = new Map<string, Set<number>>();
  const rowCountByPrefix = new Map<string, number>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const field of ["FIXTURE", "TOOLING", "FOAM TOOL", "fixture", "tooling", "foamTool"]) {
      for (const [prefix, number] of toolCodesFromText(rowValue(row, field))) {
        const used = getOrCreate(usedByPrefix, prefix, () => new Set<number>());
        used.add(number);
        seen.add(prefix);
      }
    }
    for (const prefix of seen) rowCountByPrefix.set(prefix, (rowCountByPrefix.get(prefix) ?? 0) + 1);
  }
  const known = new Map(toolFixtureCategories.map(([category, prefix]) => [prefix, category]));
  const categories = [...toolFixtureCategories];
  for (const prefix of [...usedByPrefix.keys()].sort()) {
    if (!known.has(prefix)) categories.push([`UNMAPPED PREFIX ${prefix}`, prefix]);
  }
  const toolRows = categories.map(([category, prefix]) => {
    const usedNumberSet = usedByPrefix.get(prefix) ?? new Set<number>();
    const usedNumbers = [...usedNumberSet].sort((a, b) => a - b);
    const highest = usedNumbers.length ? Math.max(...usedNumbers) : 0;
    let firstFree = "";
    for (let number = 1; number <= highest; number += 1) {
      if (!usedNumberSet.has(number)) {
        firstFree = `${prefix}${number}`;
        break;
      }
    }
    const nextNew = `${prefix}${highest ? highest + 1 : 1}`;
    return {
      category,
      prefix,
      usedCount: usedNumbers.length,
      usedRows: rowCountByPrefix.get(prefix) ?? 0,
      highestUsed: highest ? `${prefix}${highest}` : "",
      firstFree: firstFree || "No gap found",
      nextNew,
      recommendedNumber: firstFree || nextNew,
      recommendationType: firstFree ? "Missing gap" : "Next new",
    };
  });
  return {
    summary: {
      categories: toolRows.length,
      activePrefixes: toolRows.filter((row) => row.usedCount > 0).length,
    },
    rows: toolRows,
  };
}

function buildRoutingStatus(routeRows: Record<string, unknown>[], productionRows: ProductionRow[]) {
  const routeByPart = new Map<string, Array<Record<string, unknown>>>();
  const productionParts = new Map<string, { entries: number; latestDate: string }>();
  for (const row of routeRows) {
    const partCode = rowText(row, "PART CODE", "PART NO", "partNo");
    if (!partCode) continue;
    const list = routeByPart.get(partCode) ?? [];
    list.push({
      option: rowText(row, "OPTION NUMBER", "optionNumber"),
      setupCode: rowText(row, "SETUP CODE", "SETUP NO.", "setupNo"),
      setupName: rowText(row, "SETUP NAME", "setupName"),
      machineUsed: rowText(row, "MACHINE USED", "machineUsed"),
      machineType: rowText(row, "MACHINE TYPE", "machineType"),
      stageWeight: safeNumber(rowValue(row, "STAGE WEIGHT (GRAM)", "stageWeight")),
      rodSize: rowText(row, "ROD SIZE", "rodSize"),
      cuttingLength: rowText(row, "CUTTING LENGTH", "cuttingLength"),
    });
    routeByPart.set(partCode, list);
  }
  for (const row of productionRows) {
    const partCode = rowText(row, "PART NO", "PART CODE");
    if (!partCode) continue;
    const rec = getOrCreate(productionParts, partCode, () => ({ entries: 0, latestDate: "" }));
    rec.entries += 1;
    const prodDate = parseDate(rowValue(row, "PROD DATE", "PRODUCTION DATE"));
    if (prodDate && (!rec.latestDate || prodDate > rec.latestDate)) rec.latestDate = prodDate;
  }
  const pendingFromProduction = [...productionParts.entries()]
    .filter(([partCode]) => !routeByPart.has(partCode))
    .map(([partCode, row]) => ({ partCode, entries: row.entries, latestDate: dateLabel(row.latestDate) }))
    .sort((a, b) => b.entries - a.entries || b.partCode.localeCompare(a.partCode));
  const routeParts = [...routeByPart.entries()]
    .map(([partCode, rows]) => ({
      partCode,
      routeRows: rows.length,
      options: [...new Set(rows.map((row) => rowText(row, "option")).filter(Boolean))].sort(numericSort),
      setups: rows,
    }))
    .sort((a, b) => a.partCode.localeCompare(b.partCode));
  return {
    partCodes: [...new Set([...routeByPart.keys(), ...productionParts.keys()])].sort(),
    routeParts,
    pendingFromProduction,
    rows: routeParts,
  };
}

function buildDataEntryContext({
  routeRows,
  cycleRows,
  toolingRows,
  workOrderRows,
  setupChecklistRows,
  planningHolidayRows,
  employeeRows,
  machineRows,
}: {
  routeRows: Record<string, unknown>[];
  cycleRows: Record<string, unknown>[];
  toolingRows: Record<string, unknown>[];
  workOrderRows: Record<string, unknown>[];
  setupChecklistRows: Record<string, unknown>[];
  planningHolidayRows: Record<string, unknown>[];
  employeeRows: Record<string, unknown>[];
  machineRows: Record<string, unknown>[];
}) {
  const partCodes = new Set<string>();
  const jobCards = new Set<string>();
  const setupNumbers = new Set<string>();
  const machineNumbers = new Set<string>();
  const machineTypes = new Set<string>();
  const employeeIds = new Set<string>();
  const setupSourceRows = routeRows.length ? routeRows : [...cycleRows, ...toolingRows];
  for (const row of [...setupSourceRows, ...workOrderRows, ...setupChecklistRows]) {
    const part = rowText(row, "PART NO", "PART CODE", "partNo", "partCode");
    const jcNo = rowText(row, "JC NO.", "JC NO", "jcNo");
    const setup = rowText(row, "SETUP NO.", "SETUP NO", "SETUP CODE", "SET UP", "setupNo");
    const machine = rowText(row, "MACHINE USED", "M/C NO", "MACHINE NO", "machineNo");
    const machineType = rowText(row, "MACHINE TYPE", "machineType");
    if (part) partCodes.add(part);
    if (jcNo) jobCards.add(jcNo);
    if (setup) setupNumbers.add(setup);
    if (machine) machineNumbers.add(machine);
    if (machineType) machineTypes.add(machineType);
  }
  for (const row of machineRows) {
    const machine = rowText(row, "M/C NO", "MACHINE NO", "machine", "machineNo");
    const machineType = rowText(row, "MACHINE TYPE", "machineType");
    if (machine) machineNumbers.add(machine);
    if (machineType) machineTypes.add(machineType);
  }
  for (const row of employeeRows) {
    const empId = rowText(row, "Emp ID", "EMP ID", "empId");
    if (empId) employeeIds.add(empId);
  }
  return {
    templates: [],
    keySummary: [],
    entryTypes: [],
    partCodes: [...partCodes].sort(),
    jobCards: [...jobCards].sort(),
    routeOptions: {},
    setupNumbers: [...setupNumbers].sort(numericSort),
    machineNumbers: [...machineNumbers].sort(),
    machineTypes: [...machineTypes].sort(),
    employeeIds: [...employeeIds].sort(),
    planningHolidayCount: planningHolidayRows.length,
  };
}

function buildMeetingTracker(rows: Record<string, unknown>[], operatorPerformance: Array<Record<string, unknown>>, employees: Map<string, string>, selectedMonthLabel: string) {
  const monthLabel = selectedMonthLabel || latestMeetingMonthLabel(rows);
  const answerFields = [
    "How is work going?",
    "What slows your work down most?",
    "Any machine/tool/material issues?",
    "Are the targets realistic?",
    "Where is time getting wasted?",
    "What can improve efficiency?",
    "Do you need any training/support?",
    "What do you like about working here?",
    "What frustrates you most?",
    "What would make you more motivated?",
  ];
  const completed = rows.filter((row) => meetingMonthMatches(row, monthLabel) && (rowText(row, "Emp ID") || rowText(row, "Employee Name")));
  const completedIds = new Set<string>();
  const completedNames = new Set<string>();
  const themes = new Map<string, number>();
  const slowdownThemes = new Map<string, number>();
  const machineIssueThemes = new Map<string, number>();
  const trainingNeedThemes = new Map<string, number>();
  const frustrationThemes = new Map<string, number>();
  let machineIssueCount = 0;
  let trainingNeedCount = 0;
  let targetConcernCount = 0;
  let frustrationCount = 0;
  let motivationCount = 0;

  for (const row of completed) {
    const employeeId = rowText(row, "Emp ID");
    const name = rowText(row, "Employee Name");
    for (const candidate of employeeIdCandidates(employeeId)) completedIds.add(candidate);
    if (name) completedNames.add(name.toLowerCase());

    for (const field of answerFields) {
      incrementTheme(themes, meetingThemeFor(field, rowValue(row, field)));
    }
    incrementTheme(slowdownThemes, meetingThemeFor("What slows your work down most?", rowValue(row, "What slows your work down most?")));
    const machineTheme = meetingThemeFor("Any machine/tool/material issues?", rowValue(row, "Any machine/tool/material issues?"));
    if (machineTheme) {
      incrementTheme(machineIssueThemes, machineTheme);
      machineIssueCount += 1;
    }
    const trainingTheme = meetingThemeFor("Do you need any training/support?", rowValue(row, "Do you need any training/support?"));
    if (trainingTheme) {
      incrementTheme(trainingNeedThemes, trainingTheme);
      trainingNeedCount += 1;
    }
    if (meetingThemeFor("Are the targets realistic?", rowValue(row, "Are the targets realistic?")) === "Target concern") {
      targetConcernCount += 1;
    }
    if (!isBlankish(rowValue(row, "What frustrates you most?"))) {
      frustrationCount += 1;
      incrementTheme(frustrationThemes, meetingThemeFor("What frustrates you most?", rowValue(row, "What frustrates you most?")));
    }
    if (!isBlankish(rowValue(row, "What would make you more motivated?"))) {
      motivationCount += 1;
    }
  }

  const pendingOperators = operatorPerformance
    .filter((row) => {
      const id = rowText(row, "operatorId");
      const name = rowText(row, "name");
      return ![...employeeIdCandidates(id)].some((candidate) => completedIds.has(candidate)) && !completedNames.has(name.toLowerCase());
    })
    .map((row) => ({
      operatorId: rowText(row, "operatorId"),
      name: rowText(row, "name") || employees.get(rowText(row, "operatorId")) || rowText(row, "operatorId"),
      efficiency: safeNumber(rowValue(row, "efficiency")),
      rejectRate: safeNumber(rowValue(row, "rejectRate")),
      output: safeNumber(rowValue(row, "output")),
    }))
    .sort((a, b) => a.efficiency - b.efficiency || b.rejectRate - a.rejectRate);

  const completedMeetings = completed.map((row) => {
    const flags = [];
    if (!isBlankish(rowValue(row, "Any machine/tool/material issues?"))) flags.push("Machine/tool issue");
    if (!isBlankish(rowValue(row, "Do you need any training/support?"))) flags.push("Training/support");
    if (meetingThemeFor("Are the targets realistic?", rowValue(row, "Are the targets realistic?")) === "Target concern") flags.push("Target concern");
    const keyIssue = [
      "What slows your work down most?",
      "Any machine/tool/material issues?",
      "Where is time getting wasted?",
      "What frustrates you most?",
      "Do you need any training/support?",
    ].map((field) => rowText(row, field)).find((value) => !isBlankish(value)) ?? "";
    return {
      date: dateLabel(parseDate(rowValue(row, "Meeting Date"))),
      operatorId: rowText(row, "Emp ID"),
      name: rowText(row, "Employee Name"),
      manager: rowText(row, "Manager"),
      flags,
      keyIssue,
      slowdown: rowText(row, "What slows your work down most?"),
      machineIssue: rowText(row, "Any machine/tool/material issues?"),
      targetRealistic: rowText(row, "Are the targets realistic?"),
      wastedTime: rowText(row, "Where is time getting wasted?"),
      efficiencyIdea: rowText(row, "What can improve efficiency?"),
      trainingNeed: rowText(row, "Do you need any training/support?"),
      frustration: rowText(row, "What frustrates you most?"),
      motivation: rowText(row, "What would make you more motivated?"),
    };
  });

  return {
    month: monthLabel,
    completedCount: completed.length,
    pendingCount: pendingOperators.length,
    pendingOperators,
    summary: {
      machineIssueCount,
      trainingNeedCount,
      targetConcernCount,
      frustrationCount,
      motivationCount,
    },
    themes: themeRows(themes),
    slowdownThemes: themeRows(slowdownThemes),
    machineIssueThemes: themeRows(machineIssueThemes),
    trainingNeedThemes: themeRows(trainingNeedThemes),
    frustrationThemes: themeRows(frustrationThemes),
    completedMeetings,
  };
}

function productionSourceMap() {
  return [
    { sheet: "Work_Order_Import", purpose: "Purchase orders and production job cards", usedFor: "Order qty, JC traceability, selected route option, RM dates, setup completion snapshots" },
    { sheet: "Planning_Route_Master", purpose: "Approved route options", usedFor: "Setup sequence, setup name, machine type, machine used, stage weight" },
    { sheet: "Planning_Cycle_Time_Master", purpose: "Cycle-time standard", usedFor: "Per-hour production, per-hour target, planning capacity checks" },
    { sheet: "Planning_Tooling_Master", purpose: "Tools and fixtures by part/setup", usedFor: "Tooling readiness and next tool/fixture number" },
    { sheet: "Machine_Master", purpose: "Active physical machine list", usedFor: "Parallel-machine recommendations for 25-day dispatch target" },
    { sheet: "Software_Raw_Import", purpose: "Actual production export", usedFor: "Production qty, target, operator, machine, rejection, downtime, job-card actuals" },
    { sheet: "Setup_Checklist", purpose: "Daily setting entry", usedFor: "JC-linked setup completion, machinist load, setting time, repeat setup comparison" },
    { sheet: "Main_Floor_Dispatch", purpose: "Finished quantity dispatch", usedFor: "Short quantity and dispatch loss analysis" },
  ];
}

function combinedRows(workOrderRows: Array<Record<string, unknown>>, rawByJc: Map<string, { outputQty: number }>, routeGroups: Map<string, Record<string, unknown>[]>, cycleKeys: Set<string>, toolingKeys: Set<string>) {
  const groups = new Map<string, { partCode: string; optionNumber: string; jobCards: string[]; fgPos: Set<string>; orderPcs: number; orders: number; rmReady: number; plannerPriority: string; plannerPriorityScore: number; priorityRemark: string }>();
  for (const row of workOrderRows) {
    const partCode = rowText(row, "partCode");
    const optionNumber = rowText(row, "optionNumber") || "Not selected";
    const group = getOrCreate(groups, [canonicalKey(partCode), optionNumber].join("|"), () => ({ partCode, optionNumber, jobCards: [], fgPos: new Set<string>(), orderPcs: 0, orders: 0, rmReady: 0, plannerPriority: "Normal", plannerPriorityScore: 0, priorityRemark: "" }));
    group.jobCards.push(rowText(row, "jcNo"));
    group.fgPos.add(rowText(row, "fgPoNo"));
    group.orderPcs += safeNumber(rowValue(row, "orderPcs"));
    group.orders += 1;
    if (rowText(row, "rmStatus") === "Received") group.rmReady += 1;
    const rowPriorityScore = safeNumber(rowValue(row, "plannerPriorityScore"));
    if (rowPriorityScore > group.plannerPriorityScore) {
      group.plannerPriority = rowText(row, "plannerPriority") || "Normal";
      group.plannerPriorityScore = rowPriorityScore;
      group.priorityRemark = rowText(row, "priorityRemark");
    }
  }
  return [...groups.values()].map((group) => {
    const routeKeyValue = [canonicalKey(group.partCode), group.optionNumber === "Not selected" ? "" : group.optionNumber].join("|");
    const routes = routeGroups.get(routeKeyValue) ?? [];
    const missingCycle = routes.filter((row) => !cycleKeys.has(masterKey(row)));
    const missingTooling = routes.filter((row) => !toolingKeys.has(masterKey(row)));
    const rawOutputAllSetups = sum(group.jobCards.map((jcNo) => rawByJc.get(canonicalKey(jcNo))?.outputQty ?? 0));
    const action = group.optionNumber === "Not selected"
      ? "Select route option"
      : !routes.length
        ? "Create route master"
        : missingCycle.length
          ? `Add cycle time: setup ${compactJoin(missingCycle.map((row) => rowText(row, "SETUP NO.", "setupNo")))}`
          : missingTooling.length
            ? `Add tooling plan: setup ${compactJoin(missingTooling.map((row) => rowText(row, "SETUP NO.", "setupNo")))}`
            : group.rmReady < group.orders
              ? "Wait for RM inward"
              : "Can combine planning";
    return {
      partCode: group.partCode,
      optionNumber: group.optionNumber,
      jobCards: compactJoin(group.jobCards, 5),
      fgPoNos: compactJoin([...group.fgPos].filter(Boolean), 4) || "-",
      orders: group.orders,
      orderPcs: round(group.orderPcs),
      routeSetups: routes.length,
      candidateOption: "",
      rmReady: `${group.rmReady}/${group.orders}`,
      rawOutputAllSetups: round(rawOutputAllSetups),
      plannerPriority: group.plannerPriority,
      plannerPriorityScore: group.plannerPriorityScore,
      priorityRemark: group.priorityRemark,
      action,
    };
  }).sort((a, b) => b.plannerPriorityScore - a.plannerPriorityScore || (a.action === "Can combine planning" ? 0 : 1) - (b.action === "Can combine planning" ? 0 : 1) || b.orderPcs - a.orderPcs);
}

function latestRmInwardByJobCard(rows: Array<Record<string, unknown>>) {
  const byJc = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = canonicalKey(rowText(row, "JC NO.", "JC NO", "jcNo"));
    if (!key) continue;
    const current = byJc.get(key);
    if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
      byJc.set(key, row);
    }
  }
  return byJc;
}

function latestRouteSelectionByJobCard(rows: Array<Record<string, unknown>>) {
  const byJc = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = canonicalKey(rowText(row, "JC NO.", "JC NO", "jcNo"));
    if (!key) continue;
    const current = byJc.get(key);
    if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
      byJc.set(key, row);
    }
  }
  return byJc;
}

function latestRouteChangeByTarget(rows: Array<Record<string, unknown>>) {
  const byTarget = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isActivePlannerDecision(rowText(row, "status", "STATUS"))) continue;
    const target = rowText(row, "target", "jcNo", "JC NO.", "JC NO", "partCode", "PART CODE", "PART NO");
    const key = canonicalKey(target);
    if (!key) continue;
    const current = byTarget.get(key);
    if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
      byTarget.set(key, row);
    }
  }
  return byTarget;
}

function latestPlannerPriorityByTarget(rows: Array<Record<string, unknown>>) {
  const byTarget = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isActivePlannerDecision(rowText(row, "status", "STATUS"))) continue;
    const jcNo = canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO"));
    const partCode = canonicalKey(rowText(row, "partCode", "PART CODE", "PART NO"));
    const target = canonicalKey(rowText(row, "target", "TARGET"));
    const keys = [
      jcNo ? `jc:${jcNo}` : "",
      partCode && !jcNo ? `part:${partCode}` : "",
      target ? `target:${target}` : "",
    ].filter(Boolean);
    for (const key of keys) {
      const current = byTarget.get(key);
      if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
        byTarget.set(key, row);
      }
    }
  }
  return byTarget;
}

function plannerPriorityForWorkOrder(byTarget: Map<string, Record<string, unknown>>, jcNo: string, partCode: string) {
  const jcKey = canonicalKey(jcNo);
  const partKey = canonicalKey(partCode);
  return byTarget.get(`jc:${jcKey}`)
    ?? byTarget.get(`part:${partKey}`)
    ?? byTarget.get(`target:${jcKey}`)
    ?? byTarget.get(`target:${partKey}`);
}

function priorityApprovalMode(row: Record<string, unknown>) {
  const value = rowText(row, "approvalMode", "priorityApprovalMode", "PRIORITY APPROVAL MODE").toLowerCase();
  if (value === "allow_started_not_running" || value === "allow_stop_running") return value;
  return "idle_queue_only";
}

function workOrderPlanningSort(a: Record<string, unknown>, b: Record<string, unknown>) {
  return safeNumber(rowValue(b, "plannerPriorityScore")) - safeNumber(rowValue(a, "plannerPriorityScore"))
    || compareDateValues(rowText(a, "deliveryDate"), rowText(b, "deliveryDate"))
    || compareDateValues(rowText(a, "rmInwardDate"), rowText(b, "rmInwardDate"))
    || rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true });
}

function compareDateValues(a: unknown, b: unknown) {
  const aDate = parseDate(a);
  const bDate = parseDate(b);
  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;
  return aDate.localeCompare(bDate);
}

function routeChangeForWorkOrder(byTarget: Map<string, Record<string, unknown>>, jcNo: string, partCode: string) {
  return byTarget.get(canonicalKey(jcNo)) ?? byTarget.get(canonicalKey(partCode));
}

function routeChangeRemainingPlan(routeChange: Record<string, unknown> | undefined) {
  const rows = routeChange?.remainingSetups ?? routeChange?.routeChangeRemainingSetups;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const setup = asRecord(row);
    return {
      setupNo: rowText(setup, "setupNo", "SETUP NO.", "SETUP NO"),
      plan: rowValue(setup, "plan") !== false && rowText(setup, "plan").toLowerCase() !== "no",
      quantity: safeNumber(rowValue(setup, "quantity", "qty", "remainingQty")),
      remark: rowText(setup, "remark", "REMARK"),
    };
  }).filter((row) => row.setupNo);
}

function isRmReceived(workOrder: Record<string, unknown>, rmInward?: Record<string, unknown>) {
  const status = rowText(rmInward ?? {}, "status", "STATUS").toLowerCase();
  if (status && !["waiting", "pending", "not received", "not_received"].includes(status)) return true;
  return Boolean(
    rowText(workOrder, "RM I/W DATE", "rmInwardDate") ||
    rowText(rmInward ?? {}, "RM I/W DATE", "rmInwardDate") ||
    safeNumber(rowValue(workOrder, "RM INWARD KG.", "rmInwardKg")) ||
    safeNumber(rowValue(rmInward ?? {}, "RM INWARD KG.", "rmInwardKg")),
  );
}

function machinePlanDetails(
  workOrderRows: Array<Record<string, unknown>>,
  rawByJc: Map<string, { outputQty: number; actualQty: number; rejectQty: number; rows: number; machines?: Set<string> }>,
  rawBySetup: Map<string, { startDate: string; latestDate: string; outputQty: number; actualQty: number; rows: number; dates: Set<string> }>,
  rawBySetupAnyMachine: Map<string, { startDate: string; latestDate: string; outputQty: number; actualQty: number; rows: number; dates: Set<string>; machines: Set<string> }>,
  routeGroups: Map<string, Record<string, unknown>[]>,
  cycleRows: Array<Record<string, unknown>>,
  toolingRows: Array<Record<string, unknown>>,
  machineRows: Array<Record<string, unknown>>,
  machineConstraints: ActionRow[],
  planOverrides: ActionRow[],
  shopFloorStatusRows: Record<string, unknown>[],
  planningCalendar: PlanningCalendar,
) {
  const details: Array<Record<string, unknown>> = [];
  const cycleByKey = latestMasterRows(cycleRows);
  const shopFloorStatusBySetup = latestShopFloorStatusBySetup(shopFloorStatusRows);
  const unavailableMachines = new Set(machineConstraints
    .filter((row) => isActivePlannerDecision(rowText(row, "status", "STATUS")))
    .map((row) => canonicalKey(rowText(row, "machineNo", "machine", "MACHINE NO.", "MACHINE NO", "M/C NO")))
    .filter(Boolean));
  const machineLoad = new Map<string, number>();
  const machineNextSetupDate = new Map<string, string>();
  const machinePlannedDays = new Map<string, number>();
  const machinePlannedQty = new Map<string, number>();
  for (const row of workOrderRows) {
    const partCode = rowText(row, "partCode");
    const optionNumber = rowText(row, "optionNumber");
    if (!partCode || !optionNumber || optionNumber === "Not selected") continue;
    if (rowText(row, "rmStatus") !== "Received") continue;
    if (!workOrderPlanningMastersReady(row, { hasCycleMaster: cycleRows.length > 0, hasToolingMaster: toolingRows.length > 0 })) continue;

    const routeKeyValue = [canonicalKey(partCode), optionNumber].join("|");
    const remainingSetups = routeChangeRemainingPlan(row).filter((setup) => setup.plan && safeNumber(setup.quantity) > 0);
    const remainingQtyBySetup = new Map(remainingSetups.map((setup) => [canonicalKey(setup.setupNo), setup.quantity]));
    const allRoutes = routeGroups.get(routeKeyValue) ?? [];
    const routes = remainingSetups.length
      ? allRoutes.filter((route) => remainingQtyBySetup.has(canonicalKey(setupStepKey(rowText(route, "SETUP NO.", "SETUP CODE", "setupNo"), optionNumber))))
      : allRoutes;
    const rmInwardDate = rowText(row, "rmInwardDate");
    const dispatchDeadlineDate = dispatchTargetDate(rmInwardDate, planningCalendar);
    let operationReadyDate = addDays(parseDate(rmInwardDate) || rmInwardDate, 0, planningCalendar);
    let operationReadyCanPullForward = true;
    for (const [routeIndex, route] of routes.entries()) {
      const routeMachine = rowText(route, "MACHINE USED", "machineUsed", "machine", "M/C NO", "MACHINE NO");
      if (!routeMachine) continue;
      const setupNo = rowText(route, "SETUP NO.", "SETUP CODE", "setupNo");
      const displaySetupNo = setupStepKey(setupNo, optionNumber) || setupNo;
      const setupOrderPcs = remainingQtyBySetup.get(canonicalKey(displaySetupNo)) ?? safeNumber(rowValue(row, "orderPcs"));
      const machineType = rowText(route, "MACHINE TYPE", "machineType");
      const override = planOverrideForSetup(planOverrides, row, setupNo);
      const cycle = cycleByKey.get(masterKey(route));
      const productionActualAnyMachine = rawBySetupAnyMachine.get(productionSetupBaseKey({
        jcNo: rowText(row, "jcNo"),
        partCode,
        setupNo: displaySetupNo,
      })) ?? rawBySetupAnyMachine.get(productionSetupBaseKey({
        jcNo: rowText(row, "jcNo"),
        partCode,
        setupNo,
      }));
      const assignedMachines = assignedPhysicalMachines({
        routeMachine,
        machineType,
        orderPcs: setupOrderPcs,
        cycle,
        machineRows,
        unavailableMachines,
        machineLoad,
        machineNextSetupDate,
        machinePlannedDays,
        machinePlannedQty,
        readyDate: operationReadyDate || plannedSetupDate(rmInwardDate, routeIndex, planningCalendar),
        deadlineDate: dispatchDeadlineDate,
        override,
        actualMachines: productionActualAnyMachine?.machines,
        planningCalendar,
      });
      const machineOrderPcs = assignedMachineOrderPcs(setupOrderPcs, assignedMachines.length);
      const routeProductionEndDates: string[] = [];
      const routeProductionStartDates: string[] = [];
      const routeProductionActuals: Array<{ latestDate: string; outputQty: number; actualQty: number; dates: Set<string> }> = [];
      for (const machine of assignedMachines) {
        const shopFloorStatus = findShopFloorStatus(shopFloorStatusBySetup, {
          jcNo: rowText(row, "jcNo"),
          partCode,
          optionNumber,
          setupNo,
          machine,
        });
        const productionActual = rawBySetup.get(productionSetupKey({
          jcNo: rowText(row, "jcNo"),
          partCode,
          setupNo: displaySetupNo,
          machine,
        })) ?? rawBySetup.get(productionSetupKey({
          jcNo: rowText(row, "jcNo"),
          partCode,
          setupNo,
          machine,
        })) ?? (productionActualAnyMachine?.machines.has(machine) ? productionActualAnyMachine : undefined);
        const taskWorkflowStage = normalizeSetupLifecycleStage(shopFloorStatus ? rowText(shopFloorStatus, "stage") : "");
        const taskWorkflowStarted = setupLifecycleStageRank(taskWorkflowStage) >= setupLifecycleStageRank("operator_started");
        const rawProductionWithoutWorkflow = Boolean(productionActual?.rows && !taskWorkflowStarted);
        const effectiveStage = effectiveShopFloorStage(shopFloorStatus, productionActual);
        const effectiveStageLabel = setupLifecycleStageLabel(effectiveStage);
        const settingDone = setupLifecycleStageRank(effectiveStage) >= setupLifecycleStageRank("setting");
        const machineStarted = setupLifecycleStageRank(effectiveStage) >= setupLifecycleStageRank("operator_started");
        const itemComplete = effectiveStage === "item_complete";
        const shopFloorCompletedAt = shopFloorStatus ? rowText(shopFloorStatus, "completedAt", "createdAt") : "";
        const shopFloorDoneBy = shopFloorStatus ? rowText(shopFloorStatus, "doneBy") : "";
        const staticBaseReadyDate = routeIndex === 0 ? addDays(parseDate(rmInwardDate) || rmInwardDate, 0, planningCalendar) : plannedSetupDate(rmInwardDate, routeIndex, planningCalendar);
        const baseSetupDate = operationReadyDate || staticBaseReadyDate;
        const machineKeyValue = canonicalKey(machine);
        const plannedStartDate = maxDateValue(baseSetupDate, machineNextSetupDate.get(machineKeyValue) ?? "");
        const plannedCompletionDate = plannedStartDate;
        const setupCompletionDate = settingDone ? parseDate(shopFloorCompletedAt) || shopFloorCompletedAt : "";
        const plannedProductionStartDate = plannedCompletionDate;
        const plannedProductionEndDate = plannedProductionEnd(plannedProductionStartDate, machineOrderPcs, cycle, productionActual, planningCalendar);
        if (plannedProductionStartDate) routeProductionStartDates.push(parseDate(plannedProductionStartDate) || plannedProductionStartDate);
        if (plannedProductionEndDate) routeProductionEndDates.push(parseDate(plannedProductionEndDate) || plannedProductionEndDate);
        if (productionActual?.rows) routeProductionActuals.push(productionActual);
        const actualStartDate = productionActual?.startDate ?? (machineStarted ? parseDate(shopFloorCompletedAt) || shopFloorCompletedAt : "");
        const actualCompletionDate = itemComplete ? parseDate(shopFloorCompletedAt) || shopFloorCompletedAt : "";
        if (machineKeyValue) {
          machineLoad.set(machineKeyValue, (machineLoad.get(machineKeyValue) ?? 0) + 1);
          machinePlannedDays.set(machineKeyValue, (machinePlannedDays.get(machineKeyValue) ?? 0) + plannedProductionDays(plannedProductionStartDate, plannedProductionEndDate, planningCalendar));
          machinePlannedQty.set(machineKeyValue, (machinePlannedQty.get(machineKeyValue) ?? 0) + machineOrderPcs);
        }
        if (machineKeyValue && plannedProductionEndDate) machineNextSetupDate.set(machineKeyValue, nextMachineAvailableDate(plannedProductionEndDate, planningCalendar));
        const taskReadiness = shopFloorTaskReadiness(operationReadyCanPullForward, plannedStartDate);
        const detail = {
        machine,
        routeMachine,
        machineType,
        setupNo: displaySetupNo,
        routeSetupNo: setupNo,
        setupName: rowText(route, "SETUP NAME", "setupName"),
        partCode,
        description: rowText(row, "description"),
        jcNo: rowText(row, "jcNo"),
        fgPoNo: rowText(row, "fgPoNo"),
        optionNumber,
        orderPcs: machineOrderPcs,
        totalOrderPcs: setupOrderPcs,
        rmStatus: rowText(row, "rmStatus"),
        routeStatus: rowText(row, "routeStatus"),
        cycleStatus: rowText(row, "cycleStatus"),
        toolingStatus: rowText(row, "toolingStatus"),
        plannerPriority: rowText(row, "plannerPriority"),
        plannerPriorityScore: safeNumber(rowValue(row, "plannerPriorityScore")),
        priorityApprovalMode: rowText(row, "priorityApprovalMode"),
        priorityInterruptedJcNo: rowText(row, "priorityInterruptedJcNo"),
        priorityInterruptedSetupNo: rowText(row, "priorityInterruptedSetupNo"),
        priorityInterruptedMachine: rowText(row, "priorityInterruptedMachine"),
        priorityInterruptedFinishedQty: safeNumber(rowValue(row, "priorityInterruptedFinishedQty")),
        priorityInterruptedSetups: Array.isArray(row.priorityInterruptedSetups) ? row.priorityInterruptedSetups : [],
        priorityRemark: rowText(row, "priorityRemark"),
        rawOutputQty: round(productionActual?.outputQty ?? 0),
        rawActualQty: round(productionActual?.actualQty ?? 0),
        rawRejectQty: 0,
        rawRows: productionActual?.rows ?? 0,
        runningStatus: itemComplete ? "Complete" : (productionActual?.rows || machineStarted ? "Running" : (settingDone ? "Setup complete" : "Planned")),
        plannedDate: dateLabel(plannedStartDate),
        completionDate: dateLabel(setupCompletionDate),
        setupPlannedDate: dateLabel(plannedStartDate),
        setupCompletionDate: dateLabel(setupCompletionDate),
        plannedProductionStartDate: dateLabel(plannedProductionStartDate),
        plannedProductionEndDate: dateLabel(plannedProductionEndDate),
        actualProductionStartDate: dateLabel(actualStartDate),
        actualProductionEndDate: dateLabel(actualCompletionDate),
        plannedStartDate: dateLabel(plannedStartDate),
        plannedCompletionDate: dateLabel(plannedCompletionDate),
        actualStartDate: dateLabel(actualStartDate),
        actualCompletionDate: dateLabel(actualCompletionDate),
        setupCompletedOn: dateLabel(setupCompletionDate),
        setupCompletedBy: settingDone ? shopFloorDoneBy : "",
        setupChecklistRemark: "",
        shopFloorStage: effectiveStage,
        shopFloorStageLabel: effectiveStageLabel,
        shopFloorDoneBy,
        shopFloorWorker: shopFloorStatus ? rowText(shopFloorStatus, "worker") : "",
        shopFloorRemark: shopFloorStatus ? rowText(shopFloorStatus, "remark") : "",
        shopFloorUpdatedAt: shopFloorStatus ? rowText(shopFloorStatus, "completedAt", "createdAt") : "",
        rawProductionWithoutWorkflow,
        plannerActionRequired: rawProductionWithoutWorkflow ? "Raw production exists but machinist start task is missing" : "",
        shopFloorTaskReady: taskReadiness.ready,
        shopFloorTaskBlocker: taskReadiness.blocker,
        planVsActual: setupPlanVsActual(plannedCompletionDate, setupCompletionDate),
        planOverrideReason: override ? rowText(override, "reason", "REASON") : "",
          machineAssignment: machine === routeMachine ? "Route family fallback" : assignedMachines.length > 1 ? "Parallel 25-day plan" : "Assigned physical machine",
          parallelMachineCount: assignedMachines.length,
          planningAssumption: `${planningHoursPerDay} hrs/day; Friday is plant shutdown; manual planning holidays are skipped; next setup waits for WIP quantity plus ${wipAvailabilityBufferDays} buffer day; downstream setup end includes ${interSetupTransferBufferDays} handoff buffer day after previous setup end; parallel machines require at least ${minimumParallelMachineWorkDays} production days each; compatible machines are selected by lower planned utilization first`,
        };
        Object.defineProperty(detail, "__planningMeta", {
          enumerable: false,
          value: {
            readyDate: baseSetupDate,
            baseReadyDate: staticBaseReadyDate,
            canPullForward: operationReadyCanPullForward,
            orderPcs: machineOrderPcs,
            totalOrderPcs: setupOrderPcs,
            cycle,
            productionActual,
          },
        });
        details.push(detail);
      }
      const nextRoute = routes[routeIndex + 1];
      const nextCycle = nextRoute ? cycleByKey.get(masterKey(nextRoute)) : undefined;
      const bufferArgs = {
        productionStartDates: routeProductionStartDates,
        orderPcs: setupOrderPcs,
        previousCycle: cycle,
        nextCycle,
        actuals: routeProductionActuals,
        planningCalendar,
      };
      const bufferReadyDate = plannedWipBufferReadyDate(bufferArgs);
      operationReadyDate = maxDateValue(operationReadyDate, bufferReadyDate || maxDateValue(...routeProductionEndDates));
      operationReadyCanPullForward = actualWipBufferAvailable(bufferArgs);
    }
  }
  return applyPlannedDateTaskReadiness(finalizeMachineAndSetupSchedule(details, planningCalendar)).sort((a, b) =>
    rowText(a, "machine").localeCompare(rowText(b, "machine"), undefined, { numeric: true }) ||
    rowText(a, "partCode").localeCompare(rowText(b, "partCode"), undefined, { numeric: true }) ||
    numericSort(rowText(a, "setupNo"), rowText(b, "setupNo")),
  );
}

function workOrderPlanningMastersReady(row: Record<string, unknown>, masters: { hasCycleMaster: boolean; hasToolingMaster: boolean }) {
  const routeStatus = rowText(row, "routeStatus");
  return (routeStatus === "Ready" || routeStatus === "Auto single option" || routeStatus === "Route change plan") &&
    (!masters.hasCycleMaster || rowText(row, "cycleStatus") === "Ready") &&
    (!masters.hasToolingMaster || rowText(row, "toolingStatus") === "Ready");
}

function shopFloorTaskReadiness(previousOperationReady: boolean, plannedStartDate: string) {
  const dateReady = setupPlannedDateIsDue(plannedStartDate);
  return {
    ready: previousOperationReady && dateReady,
    blocker: [
      previousOperationReady ? "" : "Previous setup WIP buffer is not ready",
      dateReady ? "" : `Planned date not due until ${dateLabel(plannedStartDate)}`,
    ].filter(Boolean).join("; "),
  };
}

function applyPlannedDateTaskReadiness(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const plannedDate = parseDate(rowText(row, "plannedStartDate", "setupPlannedDate", "plannedDate"));
    const dateReady = setupPlannedDateIsDue(plannedDate);
    const blockers = taskBlockersWithoutPlannedDate(rowText(row, "shopFloorTaskBlocker"));
    if (!dateReady) blockers.push(`Planned date not due until ${dateLabel(plannedDate)}`);
    return {
      ...row,
      shopFloorTaskReady: blockers.length === 0,
      shopFloorTaskBlocker: uniqueTextValues(blockers).join("; "),
    };
  });
}

function setupPlannedDateIsDue(plannedDate: string) {
  return !plannedDate || plannedDate <= localIsoDate(new Date());
}

function uniqueTextValues(values: string[]) {
  return [...new Set(values.flatMap((value) => cleanText(value).split(";").map((part) => part.trim())).filter(Boolean))];
}

function taskBlockersWithoutPlannedDate(value: string) {
  return uniqueTextValues([value]).filter((blocker) => !blocker.toLowerCase().startsWith("planned date not due until"));
}

function finalizeMachineAndSetupSchedule(details: Array<Record<string, unknown>>, planningCalendar: PlanningCalendar) {
  let previousSignature = "";
  for (let iteration = 0; iteration < 50; iteration += 1) {
    refreshSetupDependencyReadyDates(details, planningCalendar);
    rescheduleMachineQueues(details, planningCalendar);
    if (revertInvalidFamilyIdleGapMoves(details)) {
      previousSignature = "";
      continue;
    }
    if (balanceMachineFamilyIdleGaps(details, planningCalendar)) {
      previousSignature = "";
      continue;
    }
    const signature = planningScheduleSignature(details);
    if (signature === previousSignature) break;
    previousSignature = signature;
  }
  refreshSetupDependencyReadyDates(details, planningCalendar);
  rescheduleMachineQueues(details, planningCalendar);
  revertInvalidFamilyIdleGapMoves(details);
  refreshSetupDependencyReadyDates(details, planningCalendar);
  rescheduleMachineQueues(details, planningCalendar);
  return details;
}

function balanceMachineFamilyIdleGaps(details: Array<Record<string, unknown>>, planningCalendar: PlanningCalendar) {
  const byMachine = new Map<string, Array<Record<string, unknown>>>();
  for (const row of details) {
    const machine = rowText(row, "machine");
    if (!machine) continue;
    const rows = byMachine.get(machine) ?? [];
    rows.push(row);
    byMachine.set(machine, rows);
  }

  for (const [machine, machineRows] of [...byMachine.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const sorted = machineRows
      .filter((row) => parseDate(rowText(row, "setupPlannedDate", "plannedDate")))
      .sort((a, b) => machineQueueSortDate(a).localeCompare(machineQueueSortDate(b)) || rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true }));
    const first = sorted[0];
    if (first) {
      const firstStart = parseDate(rowText(first, "setupPlannedDate", "plannedDate"));
      const leadingGapEnd = firstStart ? addDays(firstStart, -1, planningCalendar) : "";
      const leadingCandidate = leadingFamilyIdleGapCandidate(details, {
        targetMachine: machine,
        targetMachineType: rowText(first, "machineType"),
        gapEnd: leadingGapEnd,
        excludedKeys: new Set([scheduleRowKey(first)]),
        planningCalendar,
      });
      if (leadingCandidate) {
        const fromMachine = rowText(leadingCandidate, "machine");
        const gapStart = queueReadyDate(leadingCandidate);
        leadingCandidate.machine = machine;
        leadingCandidate.machineAssignment = "Family idle gap balance";
        leadingCandidate.familyIdleGapFromMachine = fromMachine;
        leadingCandidate.familyIdleGapTargetStart = gapStart;
        leadingCandidate.familyIdleGapTargetEnd = leadingGapEnd;
        leadingCandidate.familyIdleGapReason = `Moved from ${fromMachine} to fill ${machine} idle gap from ${dateLabel(gapStart)} to ${dateLabel(leadingGapEnd)}`;
        return true;
      }
    }
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index]!;
      const next = sorted[index + 1]!;
      const gapStart = nextMachineAvailableDate(parseDate(rowText(current, "plannedProductionEndDate", "setupPlannedDate", "plannedDate")) || "", planningCalendar);
      const nextStart = parseDate(rowText(next, "setupPlannedDate", "plannedDate"));
      const gapEnd = nextStart ? addDays(nextStart, -1, planningCalendar) : "";
      if (!gapStart || !gapEnd || gapEnd < gapStart) continue;
      const gapDays = plannedProductionDays(gapStart, gapEnd, planningCalendar);
      if (gapDays <= 0) continue;

      const candidate = familyIdleGapCandidate(details, {
        targetMachine: machine,
        targetMachineType: rowText(current, "machineType"),
        gapStart,
        gapDays,
        excludedKeys: new Set([scheduleRowKey(current), scheduleRowKey(next)]),
        planningCalendar,
      });
      if (!candidate) continue;

      const fromMachine = rowText(candidate, "machine");
      candidate.machine = machine;
      candidate.machineAssignment = "Family idle gap balance";
      candidate.familyIdleGapFromMachine = fromMachine;
      candidate.familyIdleGapTargetStart = gapStart;
      candidate.familyIdleGapTargetEnd = gapEnd;
      candidate.familyIdleGapReason = `Moved from ${fromMachine} to fill ${machine} idle gap from ${dateLabel(gapStart)} to ${dateLabel(gapEnd)}`;
      return true;
    }
  }
  return false;
}

function familyIdleGapCandidate(
  details: Array<Record<string, unknown>>,
  gap: { targetMachine: string; targetMachineType: string; gapStart: string; gapDays: number; excludedKeys: Set<string>; planningCalendar: PlanningCalendar },
) {
  return details
    .filter((row) => isFamilyIdleGapCandidate(row, gap))
    .filter((row) => !setupAlreadyOnMachine(details, row, gap.targetMachine))
    .sort((a, b) =>
      (safeNumber(rowValue(b, "plannerPriorityScore")) - safeNumber(rowValue(a, "plannerPriorityScore"))) ||
      queueReadyDate(a).localeCompare(queueReadyDate(b)) ||
      parseDate(rowText(a, "setupPlannedDate", "plannedDate")).localeCompare(parseDate(rowText(b, "setupPlannedDate", "plannedDate"))) ||
      rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true }),
    )[0];
}

function leadingFamilyIdleGapCandidate(
  details: Array<Record<string, unknown>>,
  gap: { targetMachine: string; targetMachineType: string; gapEnd: string; excludedKeys: Set<string>; planningCalendar: PlanningCalendar },
) {
  if (!gap.gapEnd) return undefined;
  return details
    .filter((row) => isLeadingFamilyIdleGapCandidate(row, gap))
    .filter((row) => !setupAlreadyOnMachine(details, row, gap.targetMachine))
    .sort((a, b) =>
      (safeNumber(rowValue(b, "plannerPriorityScore")) - safeNumber(rowValue(a, "plannerPriorityScore"))) ||
      queueReadyDate(a).localeCompare(queueReadyDate(b)) ||
      parseDate(rowText(a, "setupPlannedDate", "plannedDate")).localeCompare(parseDate(rowText(b, "setupPlannedDate", "plannedDate"))) ||
      rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true }),
    )[0];
}

function isLeadingFamilyIdleGapCandidate(row: Record<string, unknown>, gap: { targetMachine: string; targetMachineType: string; gapEnd: string; excludedKeys: Set<string>; planningCalendar: PlanningCalendar }) {
  if (gap.excludedKeys.has(scheduleRowKey(row))) return false;
  if (familyIdleGapRejectedForMachine(row, gap.targetMachine)) return false;
  if (!isMovablePlannedRow(row)) return false;
  const currentMachine = rowText(row, "machine");
  if (!currentMachine || currentMachine === gap.targetMachine) return false;
  if (!machineCodeMatches(rowText(row, "routeMachine", "machine"), gap.targetMachine)) return false;
  if (!machineTypeCompatible(rowText(row, "machineType"), gap.targetMachineType)) return false;
  const currentStart = parseDate(rowText(row, "setupPlannedDate", "plannedDate"));
  const readyDate = queueReadyDate(row);
  if (!currentStart || !readyDate || currentStart <= readyDate || readyDate > gap.gapEnd) return false;
  const durationDays = plannedProductionDays(
    parseDate(rowText(row, "setupPlannedDate", "plannedDate")),
    parseDate(rowText(row, "plannedProductionEndDate", "setupPlannedDate", "plannedDate")),
    gap.planningCalendar,
  );
  const gapDays = plannedProductionDays(readyDate, gap.gapEnd, gap.planningCalendar);
  return durationDays > 0 && gapDays > 0 && durationDays <= gapDays;
}

function isFamilyIdleGapCandidate(row: Record<string, unknown>, gap: { targetMachine: string; targetMachineType: string; gapStart: string; gapDays: number; excludedKeys: Set<string>; planningCalendar: PlanningCalendar }) {
  if (gap.excludedKeys.has(scheduleRowKey(row))) return false;
  if (familyIdleGapRejectedForMachine(row, gap.targetMachine)) return false;
  if (!isMovablePlannedRow(row)) return false;
  const currentMachine = rowText(row, "machine");
  if (!currentMachine || currentMachine === gap.targetMachine) return false;
  if (!machineCodeMatches(rowText(row, "routeMachine", "machine"), gap.targetMachine)) return false;
  if (!machineTypeCompatible(rowText(row, "machineType"), gap.targetMachineType)) return false;
  const currentStart = parseDate(rowText(row, "setupPlannedDate", "plannedDate"));
  if (!currentStart || currentStart <= gap.gapStart) return false;
  const readyDate = queueReadyDate(row);
  if (!readyDate || readyDate > gap.gapStart) return false;
  const durationDays = plannedProductionDays(
    parseDate(rowText(row, "setupPlannedDate", "plannedDate")),
    parseDate(rowText(row, "plannedProductionEndDate", "setupPlannedDate", "plannedDate")),
    gap.planningCalendar,
  );
  return durationDays > 0 && durationDays <= gap.gapDays;
}

function isMovablePlannedRow(row: Record<string, unknown>) {
  if (rowText(row, "machineAssignment") === "Family idle gap balance") return false;
  if (priorityQueueState(row) !== "idle") return false;
  if (actualProductionStartDate(planningMeta(row))) return false;
  return rowText(row, "runningStatus").toLowerCase() === "planned";
}

function revertInvalidFamilyIdleGapMoves(details: Array<Record<string, unknown>>) {
  let reverted = false;
  for (const row of details) {
    if (rowText(row, "machineAssignment") !== "Family idle gap balance") continue;
    const targetEnd = parseDate(rowText(row, "familyIdleGapTargetEnd"));
    const finalEnd = parseDate(rowText(row, "plannedProductionEndDate", "setupPlannedDate", "plannedDate"));
    if (!targetEnd || !finalEnd || finalEnd <= targetEnd) continue;
    const targetMachine = rowText(row, "machine");
    const fromMachine = rowText(row, "familyIdleGapFromMachine");
    if (!fromMachine) continue;
    row.machine = fromMachine;
    row.machineAssignment = "Assigned physical machine";
    const rejectedMachines = new Set(rowText(row, "familyIdleGapRejectedMachines").split(",").map((value) => canonicalKey(value)).filter(Boolean));
    rejectedMachines.add(canonicalKey(targetMachine));
    row.familyIdleGapRejectedMachines = [...rejectedMachines].join(",");
    row.familyIdleGapFromMachine = "";
    row.familyIdleGapTargetStart = "";
    row.familyIdleGapTargetEnd = "";
    row.familyIdleGapReason = "";
    reverted = true;
  }
  return reverted;
}

function familyIdleGapRejectedForMachine(row: Record<string, unknown>, machine: string) {
  const machineKey = canonicalKey(machine);
  if (!machineKey) return false;
  return rowText(row, "familyIdleGapRejectedMachines").split(",").map((value) => canonicalKey(value)).includes(machineKey);
}

function machineTypeCompatible(sourceType: string, targetType: string) {
  const source = canonicalKey(sourceType);
  const target = canonicalKey(targetType);
  return !source || !target || source === target;
}

function setupAlreadyOnMachine(details: Array<Record<string, unknown>>, candidate: Record<string, unknown>, targetMachine: string) {
  const key = [rowText(candidate, "jcNo"), canonicalKey(rowText(candidate, "partCode")), rowText(candidate, "optionNumber"), rowText(candidate, "setupNo"), canonicalKey(targetMachine)].join("|");
  return details.some((row) => scheduleRowKey(row) === key);
}

function scheduleRowKey(row: Record<string, unknown>) {
  return [rowText(row, "jcNo"), canonicalKey(rowText(row, "partCode")), rowText(row, "optionNumber"), rowText(row, "setupNo"), canonicalKey(rowText(row, "machine"))].join("|");
}

function refreshSetupDependencyReadyDates(details: Array<Record<string, unknown>>, planningCalendar: PlanningCalendar) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of details) {
    const key = [rowText(row, "jcNo"), canonicalKey(rowText(row, "partCode")), rowText(row, "optionNumber")].join("|");
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  for (const rows of grouped.values()) {
    const bySetup = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const setup = setupStepKey(rowText(row, "setupNo"), rowText(row, "optionNumber"));
      const setupRows = bySetup.get(setup) ?? [];
      setupRows.push(row);
      bySetup.set(setup, setupRows);
    }
    const setupGroups = [...bySetup.entries()]
      .map(([setup, setupRows]) => ({ setup, rows: setupRows }))
      .sort((a, b) => numericSort(a.setup, b.setup));

    let operationReadyDate = "";
    let previousSetupEndDate = "";
    for (const [index, group] of setupGroups.entries()) {
      const baseReadyDate = maxDateValue(...group.rows.map((row) => planningMeta(row).baseReadyDate ?? ""));
      const groupReadyDate = maxDateValue(operationReadyDate, baseReadyDate);
      for (const row of group.rows) {
        planningMeta(row).readyDate = groupReadyDate;
        planningMeta(row).minimumProductionEndDate = practicalSetupHandoffEndDate(previousSetupEndDate, planningCalendar);
      }

      const nextGroup = setupGroups[index + 1];
      const currentCycle = planningMeta(group.rows[0] ?? {}).cycle;
      const nextCycle = nextGroup ? planningMeta(nextGroup.rows[0] ?? {}).cycle : undefined;
      const productionStartDates = group.rows.map((row) => parseDate(rowText(row, "plannedProductionStartDate", "setupPlannedDate", "plannedStartDate"))).filter(Boolean);
      const productionEndDates = group.rows.map((row) => parseDate(rowText(row, "plannedProductionEndDate"))).filter(Boolean);
      const actuals = uniqueProductionActuals(group.rows.map((row) => planningMeta(row).productionActual).filter(Boolean) as Array<{ latestDate: string; outputQty: number; actualQty: number; dates: Set<string> }>);
      const setupOrderPcs = Math.max(...group.rows.map((row) => planningMeta(row).totalOrderPcs ?? planningMeta(row).orderPcs ?? 0), 0);
      const bufferReadyDate = nextGroup ? plannedWipBufferReadyDate({
        productionStartDates,
        orderPcs: setupOrderPcs,
        previousCycle: currentCycle,
        nextCycle,
        actuals,
        planningCalendar,
      }) : "";
      const groupEndDate = maxDateValue(...productionEndDates);
      operationReadyDate = maxDateValue(groupReadyDate, bufferReadyDate || groupEndDate);
      previousSetupEndDate = maxDateValue(previousSetupEndDate, groupEndDate);
    }
  }
}

function practicalSetupHandoffEndDate(previousSetupEndDate: string, planningCalendar: PlanningCalendar) {
  const normalizedEndDate = parseDate(previousSetupEndDate) || previousSetupEndDate;
  return normalizedEndDate ? addDays(normalizedEndDate, interSetupTransferBufferDays, planningCalendar) : "";
}

function uniqueProductionActuals(actuals: Array<{ startDate?: string; latestDate: string; outputQty: number; actualQty: number; dates: Set<string> }>) {
  const seen = new Set<string>();
  return actuals.filter((actual) => {
    const key = [actual.startDate, actual.latestDate, actual.outputQty, actual.actualQty, [...actual.dates].sort().join(",")].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function planningScheduleSignature(details: Array<Record<string, unknown>>) {
  return details.map((row) => [
    rowText(row, "jcNo"),
    rowText(row, "partCode"),
    rowText(row, "optionNumber"),
    rowText(row, "setupNo"),
    rowText(row, "machine"),
    rowText(row, "setupPlannedDate"),
    rowText(row, "plannedProductionEndDate"),
    planningMeta(row).readyDate ?? "",
  ].join("|")).join("\n");
}

function rescheduleMachineQueues(details: Array<Record<string, unknown>>, planningCalendar: PlanningCalendar) {
  applyPriorityInterruptionQuantities(details);
  const byMachine = new Map<string, Array<Record<string, unknown>>>();
  for (const row of details) {
    const machine = rowText(row, "machine");
    if (!machine) continue;
    const rows = byMachine.get(machine) ?? [];
    rows.push(row);
    byMachine.set(machine, rows);
  }

  for (const rows of byMachine.values()) {
    const queue = [...rows].sort(machineQueueSort);
    let machineNextDate = "";
    while (queue.length) {
      const row = takeNextMachineQueueRow(queue, machineNextDate);
      const meta = planningMeta(row);
      const actualStartDate = actualProductionStartDate(meta);
      const readyDate = actualStartDate || meta.readyDate || parseDate(rowText(row, "setupPlannedDate")) || "";
      const plannedStartDate = actualStartDate || maxDateValue(readyDate, machineNextDate);
      const plannedProductionEndDate = maxDateValue(
        plannedProductionEnd(plannedStartDate, meta.orderPcs ?? 0, meta.cycle, meta.productionActual, planningCalendar),
        meta.minimumProductionEndDate ?? "",
      );
      row.plannedDate = dateLabel(plannedStartDate);
      row.setupPlannedDate = dateLabel(plannedStartDate);
      row.plannedStartDate = dateLabel(plannedStartDate);
      row.plannedCompletionDate = dateLabel(plannedStartDate);
      row.plannedProductionStartDate = dateLabel(plannedStartDate);
      row.plannedProductionEndDate = dateLabel(plannedProductionEndDate);
      row.planVsActual = setupPlanVsActual(plannedStartDate, parseDate(rowText(row, "setupCompletionDate")) || rowText(row, "setupCompletionDate"));
      machineNextDate = nextMachineAvailableDate(plannedProductionEndDate || plannedStartDate, planningCalendar);
    }
  }
  return details;
}

function machineQueueSort(a: Record<string, unknown>, b: Record<string, unknown>) {
  const aActualStart = actualProductionStartDate(planningMeta(a));
  const bActualStart = actualProductionStartDate(planningMeta(b));
  const priorityDiff = safeNumber(rowValue(b, "plannerPriorityScore")) - safeNumber(rowValue(a, "plannerPriorityScore"));
  if (priorityDiff > 0 && canPriorityPreempt(a, b)) return priorityDiff;
  if (priorityDiff < 0 && canPriorityPreempt(b, a)) return priorityDiff;
  if (aActualStart || bActualStart) {
    if (aActualStart && bActualStart) return aActualStart.localeCompare(bActualStart);
    return aActualStart ? -1 : 1;
  }
  const familyTargetDiff = compareFamilyIdleGapSortDates(a, b);
  return priorityQueueStateRank(a) - priorityQueueStateRank(b) ||
    familyTargetDiff ||
    priorityDiff ||
    machineQueueSortDate(a).localeCompare(machineQueueSortDate(b)) ||
    rowText(a, "jcNo").localeCompare(rowText(b, "jcNo"), undefined, { numeric: true }) ||
    numericSort(rowText(a, "setupNo"), rowText(b, "setupNo"));
}

function applyPriorityInterruptionQuantities(details: Array<Record<string, unknown>>) {
  const stopApprovals = details.filter((row) => priorityApprovalMode(row) === "allow_stop_running" && priorityApprovalHasFinishedQty(row));
  for (const approval of stopApprovals) {
    const setupInterruptions = priorityInterruptedSetups(approval);
    const defaultFinishedQty = safeNumber(rowValue(approval, "priorityInterruptedFinishedQty"));
    for (const row of details) {
      if (!priorityInterruptsRow(approval, row)) continue;
      const meta = planningMeta(row);
      const currentActual = meta.productionActual ?? {
        latestDate: actualProductionStartDate(meta) || parseDate(rowText(row, "setupPlannedDate")) || "",
        outputQty: 0,
        actualQty: 0,
        dates: new Set<string>(),
      };
      const matchingInterruption = setupInterruptions.find((interruption) => priorityInterruptionMatchesRow(interruption, row));
      const finishedQty = matchingInterruption?.finishedQty || defaultFinishedQty;
      const actualQty = Math.max(currentActual.actualQty ?? 0, finishedQty);
      const outputQty = Math.max(currentActual.outputQty ?? 0, finishedQty);
      meta.productionActual = {
        ...currentActual,
        latestDate: currentActual.latestDate || currentActual.startDate || parseDate(rowText(row, "setupPlannedDate")) || "",
        outputQty,
        actualQty,
      };
      row.rawOutputQty = round(outputQty);
      row.rawActualQty = round(actualQty);
      row.priorityStoppedByJcNo = rowText(approval, "jcNo");
      row.priorityRemainingQty = round(Math.max((meta.totalOrderPcs ?? meta.orderPcs ?? safeNumber(rowValue(row, "orderPcs"))) - actualQty, 0));
    }
  }
}

function canPriorityPreempt(blockingRow: Record<string, unknown>, priorityRow: Record<string, unknown>) {
  if (safeNumber(rowValue(priorityRow, "plannerPriorityScore")) <= safeNumber(rowValue(blockingRow, "plannerPriorityScore"))) return false;
  if (familyIdleGapSortDate(blockingRow) && !familyIdleGapSortDate(priorityRow)) return false;
  const state = priorityQueueState(blockingRow);
  if (state === "idle") return true;
  const mode = priorityApprovalMode(priorityRow);
  if (state === "started_not_running") {
    if (mode !== "allow_started_not_running" && mode !== "allow_stop_running") return false;
    return priorityInterruptedSetups(priorityRow).length ? priorityInterruptsRow(priorityRow, blockingRow) : true;
  }
  return mode === "allow_stop_running" && priorityInterruptsRow(priorityRow, blockingRow) && priorityInterruptionHasFinishedQty(priorityRow, blockingRow);
}

function priorityInterruptsRow(priorityRow: Record<string, unknown>, row: Record<string, unknown>) {
  const setupInterruptions = priorityInterruptedSetups(priorityRow);
  if (setupInterruptions.length) return setupInterruptions.some((interruption) => priorityInterruptionMatchesRow(interruption, row));

  const stoppedJc = canonicalKey(rowText(priorityRow, "priorityInterruptedJcNo", "interruptedJcNo", "STOPPED JC NO"));
  if (!stoppedJc || stoppedJc !== canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO"))) return false;
  const stoppedSetup = canonicalKey(rowText(priorityRow, "priorityInterruptedSetupNo", "interruptedSetupNo", "STOPPED SETUP NO"));
  const stoppedMachine = canonicalKey(rowText(priorityRow, "priorityInterruptedMachine", "interruptedMachine", "STOPPED MACHINE"));
  if (stoppedSetup && stoppedSetup !== canonicalKey(rowText(row, "setupNo", "SETUP NO", "SETUP"))) return false;
  if (stoppedMachine && stoppedMachine !== canonicalKey(rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO"))) return false;
  return true;
}

function priorityInterruptedSetups(priorityRow: Record<string, unknown>) {
  const raw = priorityRow.interruptedSetups || priorityRow.priorityInterruptedSetups;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => typeof item === "object" && item !== null && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      jcNo: canonicalKey(rowText(item, "jcNo", "JC NO", "jobCard")),
      setupNo: canonicalKey(rowText(item, "setupNo", "SETUP NO", "setup")),
      machine: canonicalKey(rowText(item, "machine", "machineNo", "MACHINE NO", "M/C NO")),
      finishedQty: safeNumber(rowValue(item, "finishedQty", "FINISHED QTY")),
    }))
    .filter((item) => item.jcNo && item.setupNo);
}

function priorityInterruptionMatchesRow(interruption: ReturnType<typeof priorityInterruptedSetups>[number], row: Record<string, unknown>) {
  return interruption.jcNo === canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO"))
    && interruption.setupNo === canonicalKey(rowText(row, "setupNo", "SETUP NO", "SETUP"))
    && (!interruption.machine || interruption.machine === canonicalKey(rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO")));
}

function priorityApprovalHasFinishedQty(priorityRow: Record<string, unknown>) {
  const setupInterruptions = priorityInterruptedSetups(priorityRow);
  if (!setupInterruptions.length) return safeNumber(rowValue(priorityRow, "priorityInterruptedFinishedQty")) > 0;
  return setupInterruptions.some((interruption) => interruption.finishedQty > 0);
}

function priorityInterruptionHasFinishedQty(priorityRow: Record<string, unknown>, blockingRow: Record<string, unknown>) {
  const setupInterruptions = priorityInterruptedSetups(priorityRow);
  if (!setupInterruptions.length) return safeNumber(rowValue(priorityRow, "priorityInterruptedFinishedQty")) > 0;
  return setupInterruptions.some((interruption) => interruption.finishedQty > 0 && priorityInterruptionMatchesRow(interruption, blockingRow));
}

function priorityQueueStateRank(row: Record<string, unknown>) {
  const state = priorityQueueState(row);
  if (state === "running") return 0;
  if (state === "started_not_running") return 1;
  return 2;
}

function priorityQueueState(row: Record<string, unknown>) {
  if (rowText(row, "runningStatus").toLowerCase() === "complete") return "idle";
  if (actualProductionStartDate(planningMeta(row)) || rowText(row, "runningStatus").toLowerCase() === "running") return "running";
  const stage = rowText(row, "shopFloorStage").toLowerCase();
  const runningStatus = rowText(row, "runningStatus").toLowerCase();
  if (stage && stage !== "planned" && stage !== "item_complete") return "started_not_running";
  if (runningStatus === "setup complete") return "started_not_running";
  return "idle";
}

function machineQueueSortDate(row: Record<string, unknown>) {
  const meta = planningMeta(row);
  return actualProductionStartDate(meta) || parseDate(rowText(row, "familyIdleGapTargetStart")) || queueReadyDate(row) || parseDate(rowText(row, "setupPlannedDate")) || "";
}

function familyIdleGapSortDate(row: Record<string, unknown>) {
  return parseDate(rowText(row, "familyIdleGapTargetStart")) || "";
}

function compareFamilyIdleGapSortDates(a: Record<string, unknown>, b: Record<string, unknown>) {
  const aDate = familyIdleGapSortDate(a);
  const bDate = familyIdleGapSortDate(b);
  if (aDate && bDate) return aDate.localeCompare(bDate);
  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
}

function actualProductionStartDate(meta: ReturnType<typeof planningMeta>) {
  return parseDate(meta.productionActual?.startDate) || "";
}

function nextMachineAvailableDate(dateValue: string, planningCalendar: PlanningCalendar) {
  const date = parseDate(dateValue);
  return date ? addDays(date, 1, planningCalendar) : "";
}

function takeNextMachineQueueRow(queue: Array<Record<string, unknown>>, machineNextDate: string) {
  const first = queue[0]!;
  const currentSlotDate = machineNextDate || earliestQueueReadyDate(queue) || queueReadyDate(first);
  if (isQueueReady(first, currentSlotDate)) return queue.shift()!;
  const readyIndex = queue.findIndex((row, index) => {
    const meta = planningMeta(row);
    return index > 0 && meta.canPullForward !== false && isQueueReady(row, currentSlotDate);
  });
  if (readyIndex > 0) {
    const [readyRow] = queue.splice(readyIndex, 1);
    return readyRow!;
  }
  return queue.shift()!;
}

function isQueueReady(row: Record<string, unknown>, currentSlotDate: string) {
  const readyDate = queueReadyDate(row);
  return Boolean(readyDate && currentSlotDate && readyDate <= currentSlotDate);
}

function queueReadyDate(row: Record<string, unknown>) {
  const meta = planningMeta(row);
  return meta.readyDate || parseDate(rowText(row, "setupPlannedDate")) || "";
}

function earliestQueueReadyDate(queue: Array<Record<string, unknown>>) {
  return queue.map(queueReadyDate).filter(Boolean).sort().at(0) ?? "";
}

function planningMeta(row: Record<string, unknown>) {
  return ((row as Record<string, unknown>).__planningMeta ?? {}) as {
    readyDate?: string;
    baseReadyDate?: string;
    minimumProductionEndDate?: string;
    canPullForward?: boolean;
    orderPcs?: number;
    totalOrderPcs?: number;
    cycle?: Record<string, unknown>;
    productionActual?: { startDate?: string; latestDate: string; outputQty: number; actualQty: number; dates: Set<string> };
  };
}

function setupChecklistBySetup(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const jcNo = rowText(row, "JC NO.", "JC NO", "JobCardNo", "jcNo");
    const partCode = rowText(row, "PART NO", "PART CODE", "partNo");
    const optionNumber = rowText(row, "OPTION NUMBER", "OPTION NO", "optionNumber");
    const setupNo = rowText(row, "SETUP NO.", "SETUP NO", "SET UP", "setupNo");
    const machine = rowText(row, "M/C NO", "MACHINE NO", "machineNo");
    const key = setupChecklistKey({ jcNo, partCode, optionNumber, setupNo, machine });
    if (!key) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }
  return grouped;
}

function latestShopFloorStatusBySetup(rows: Record<string, unknown>[]) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = setupChecklistKey({
      jcNo: rowText(row, "jcNo", "JC NO.", "JC NO"),
      partCode: rowText(row, "partCode", "partNo", "PART CODE", "PART NO"),
      optionNumber: rowText(row, "optionNumber", "OPTION NUMBER", "OPTION NO"),
      setupNo: rowText(row, "setupNo", "SETUP NO.", "SETUP NO", "SET UP"),
      machine: rowText(row, "machine", "machineNo", "M/C NO", "MACHINE NO", "MACHINE NO."),
    });
    if (!key) continue;
    const current = latest.get(key);
    const currentAt = current ? rowText(current, "completedAt", "createdAt") : "";
    const nextAt = rowText(row, "completedAt", "createdAt");
    if (!current || nextAt >= currentAt) latest.set(key, row);
  }
  return latest;
}

function findShopFloorStatus(
  latest: Map<string, Record<string, unknown>>,
  target: { jcNo: string; partCode: string; optionNumber: string; setupNo: string; machine: string },
) {
  const key = setupChecklistKey(target);
  return key ? latest.get(key) : undefined;
}

const setupLifecycleStages = [
  "raw_material_at_machine",
  "presetting",
  "setting",
  "quality_approval",
  "operator_started",
  "item_complete",
] as const;

type SetupLifecycleStage = typeof setupLifecycleStages[number];

function effectiveShopFloorStage(
  shopFloorStatus: Record<string, unknown> | undefined,
  productionActual: { rows: number } | undefined,
): SetupLifecycleStage | "" {
  const candidates: Array<SetupLifecycleStage | ""> = [
    normalizeSetupLifecycleStage(shopFloorStatus ? rowText(shopFloorStatus, "stage") : ""),
    productionActual?.rows ? "operator_started" : "",
  ];
  return candidates.sort((a, b) => setupLifecycleStageRank(b) - setupLifecycleStageRank(a))[0] ?? "";
}

function normalizeSetupLifecycleStage(stage: string): SetupLifecycleStage | "" {
  const normalized = ({
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
  } as Record<string, SetupLifecycleStage>)[stage];
  return normalized ?? "";
}

function setupLifecycleStageRank(stage: string) {
  const index = setupLifecycleStages.indexOf(normalizeSetupLifecycleStage(stage) as SetupLifecycleStage);
  return index >= 0 ? index : -1;
}

function setupLifecycleStageLabel(stage: string) {
  return ({
    raw_material_at_machine: "Raw material at the machine",
    presetting: "Pre setting done",
    setting: "Setting done",
    quality_approval: "Quality approval",
    operator_started: "Operator assigned and machine started",
    item_complete: "Item complete",
  } as Record<string, string>)[stage] ?? "";
}

function findSetupChecklistEntry(
  grouped: Map<string, Record<string, unknown>[]>,
  target: { jcNo: string; partCode: string; optionNumber: string; setupNo: string; machine: string },
) {
  const key = setupChecklistKey(target);
  return key ? grouped.get(key)?.[0] : undefined;
}

function setupChecklistKey({
  jcNo,
  partCode,
  optionNumber,
  setupNo,
  machine,
}: {
  jcNo: string;
  partCode: string;
  optionNumber: string;
  setupNo: string;
  machine: string;
}) {
  const parts = [canonicalKey(jcNo), canonicalKey(partCode), canonicalKey(optionNumber), setupStepKey(setupNo, optionNumber), canonicalKey(machine)];
  return parts.every(Boolean) ? parts.join("|") : "";
}

function productionSetupKey({
  jcNo,
  partCode,
  setupNo,
  machine,
}: {
  jcNo: string;
  partCode: string;
  setupNo: string;
  machine: string;
}) {
  const parts = [canonicalKey(jcNo), canonicalKey(partCode), canonicalKey(setupNo), canonicalKey(machine)];
  return parts.every(Boolean) ? parts.join("|") : "";
}

function productionSetupBaseKey({
  jcNo,
  partCode,
  setupNo,
}: {
  jcNo: string;
  partCode: string;
  setupNo: string;
}) {
  const parts = [canonicalKey(jcNo), canonicalKey(partCode), canonicalKey(setupNo)];
  return parts.every(Boolean) ? parts.join("|") : "";
}

function setupStepKey(setupNo: string, optionNumber: string) {
  const setupKey = canonicalKey(setupNo);
  const optionKey = canonicalKey(optionNumber);
  if (!setupKey) return "";
  const match = setupKey.match(/^(\d+)\.(\d+)$/);
  if (match && match[1] === optionKey) return match[2] ?? "";
  return setupKey;
}

function plannedSetupDate(rmInwardDate: string, setupIndex: number, planningCalendar: PlanningCalendar) {
  const start = parseDate(rmInwardDate);
  return start ? addDays(start, setupIndex, planningCalendar) : "";
}

function setupPlanVsActual(plannedCompletionDate: string, actualCompletionDate: string) {
  const planned = parseDate(plannedCompletionDate);
  const actual = parseDate(actualCompletionDate);
  if (!planned) return "Plan date missing";
  if (!actual) return "Pending actual";
  if (actual < planned) return "Early";
  if (actual === planned) return "On time";
  return "Delayed";
}

function addCalendarDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue: string, days: number, planningCalendar: PlanningCalendar = defaultPlanningCalendar) {
  const start = parseDate(dateValue) || dateValue;
  if (!start) return "";
  const step = days < 0 ? -1 : 1;
  if (days === 0) return isPlanningDate(start, planningCalendar) ? start : moveToPlanningDate(start, planningCalendar, step);
  let current = start;
  let remaining = Math.abs(days);
  let guard = 0;
  while (remaining > 0 && guard < 5000) {
    current = addCalendarDays(current, step);
    if (isPlanningDate(current, planningCalendar)) remaining -= 1;
    guard += 1;
  }
  return remaining === 0 ? current : "";
}

function moveToPlanningDate(dateValue: string, planningCalendar: PlanningCalendar, step: 1 | -1) {
  let current = parseDate(dateValue) || dateValue;
  let guard = 0;
  while (current && !isPlanningDate(current, planningCalendar) && guard < 370) {
    current = addCalendarDays(current, step);
    guard += 1;
  }
  return current;
}

function isPlanningDate(dateValue: string, planningCalendar: PlanningCalendar) {
  const normalized = parseDate(dateValue) || dateValue;
  if (!normalized || planningCalendar.holidayDates.has(normalized)) return false;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && isPlanningWorkday(date);
}

function planningCalendarFromRows(rows: Record<string, unknown>[]): PlanningCalendar {
  return {
    holidayDates: new Set(rows
      .map((row) => parseDate(rowValue(row, "date", "holidayDate", "fromDate", "startDate")))
      .filter(Boolean)),
  };
}

function planningHolidayViewRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const date = parseDate(rowValue(row, "date", "holidayDate", "fromDate", "startDate")) || rowText(row, "date", "holidayDate", "fromDate", "startDate");
    return {
      date: dateLabel(date),
      dateValue: date,
      reason: rowText(row, "reason", "holidayReason") || "Plant holiday",
      scope: rowText(row, "scope") || "Plant",
      machine: rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO"),
      department: rowText(row, "department"),
      remark: rowText(row, "remark", "remarks"),
    };
  }).sort((a, b) => rowText(a, "dateValue").localeCompare(rowText(b, "dateValue")));
}

function planOverrideForSetup(planOverrides: ActionRow[], workOrder: Record<string, unknown>, setupNo: string) {
  const jcKey = canonicalKey(rowText(workOrder, "jcNo", "JC NO.", "JC NO"));
  const partKey = canonicalKey(rowText(workOrder, "partCode", "PART CODE", "PART NO"));
  const setupKey = canonicalKey(setupNo);
  return planOverrides.find((row) => {
    if (!isActivePlannerDecision(rowText(row, "status", "STATUS"))) return false;
    const targetKey = canonicalKey(rowText(row, "target", "jcNo", "JC NO.", "JC NO", "partCode", "PART CODE", "PART NO"));
    const rowJcKey = canonicalKey(rowText(row, "jcNo", "JC NO.", "JC NO"));
    const rowPartKey = canonicalKey(rowText(row, "partCode", "PART CODE", "PART NO"));
    const rowSetupKey = canonicalKey(rowText(row, "setupNo", "SETUP NO.", "SETUP NO"));
    const targetMatches = Boolean(targetKey && (targetKey === jcKey || targetKey === partKey));
    const rowMatches = Boolean((rowJcKey && rowJcKey === jcKey) || (rowPartKey && rowPartKey === partKey));
    const setupMatches = !rowSetupKey || rowSetupKey === setupKey;
    return (targetMatches || rowMatches) && setupMatches;
  });
}

function assignedPhysicalMachines({
  routeMachine,
  machineType,
  orderPcs,
  cycle,
  machineRows,
  unavailableMachines,
  machineLoad,
  machineNextSetupDate,
  machinePlannedDays,
  machinePlannedQty,
  readyDate,
  deadlineDate,
  override,
  actualMachines,
  planningCalendar,
}: {
  routeMachine: string;
  machineType: string;
  orderPcs: number;
  cycle?: Record<string, unknown>;
  machineRows: Array<Record<string, unknown>>;
  unavailableMachines: Set<string>;
  machineLoad: Map<string, number>;
  machineNextSetupDate: Map<string, string>;
  machinePlannedDays: Map<string, number>;
  machinePlannedQty: Map<string, number>;
  readyDate: string;
  deadlineDate: string;
  override?: ActionRow;
  actualMachines?: Set<string>;
  planningCalendar: PlanningCalendar;
}) {
  const overrideMachine = override ? rowText(override, "toMachine", "TO MACHINE", "PLAN ON MACHINE", "TARGET MACHINE") : "";
  const candidates = candidatePhysicalMachines(routeMachine, machineType, machineRows, unavailableMachines, machineLoad, machineNextSetupDate, machinePlannedDays, machinePlannedQty);
  const actualMachineList = [...(actualMachines ?? new Set<string>())].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (actualMachineList.length) return actualMachineList;
  if (overrideMachine) {
    const exactOverride = candidates.find((row) => canonicalKey(row.machine) === canonicalKey(overrideMachine));
    if (exactOverride) return [exactOverride.machine];
  }
  if (!candidates.length) return [routeMachine];
  const machineCount = requiredMachineCountForTarget({
    orderPcs,
    cycle,
    candidates,
    readyDate,
    deadlineDate,
    machineNextSetupDate,
    planningCalendar,
  });
  return candidates.slice(0, machineCount).map((row) => row.machine);
}

function requiredMachineCountForTarget({
  orderPcs,
  cycle,
  candidates,
  readyDate,
  deadlineDate,
  machineNextSetupDate,
  planningCalendar,
}: {
  orderPcs: number;
  cycle: Record<string, unknown> | undefined;
  candidates: Array<{ machine: string }>;
  readyDate: string;
  deadlineDate: string;
  machineNextSetupDate: Map<string, string>;
  planningCalendar: PlanningCalendar;
}) {
  const availableMachineCount = candidates.length;
  const cycleSeconds = safeNumber(rowValue(cycle ?? {}, "cycleTime", "CYCLE TIME")) + safeNumber(rowValue(cycle ?? {}, "loadingUnloading", "LOADING AND UNLOADING"));
  if (!orderPcs || !cycleSeconds || availableMachineCount <= 1) return 1;
  const estimatedHours = (orderPcs * cycleSeconds) / 3600;
  const productionDays = Math.max(1, Math.ceil(estimatedHours / planningHoursPerDay));
  const availableProductionDays = Math.max(1, planningDispatchTargetDays - planningSetupBufferDays);
  const parallelMachineLimit = Math.min(availableMachineCount, Math.max(1, Math.floor(productionDays / minimumParallelMachineWorkDays)));
  const durationCount = Math.min(parallelMachineLimit, Math.max(1, Math.ceil(productionDays / availableProductionDays)));
  const normalizedReadyDate = parseDate(readyDate) || readyDate;
  const normalizedDeadlineDate = parseDate(deadlineDate) || deadlineDate;
  if (!normalizedReadyDate || !normalizedDeadlineDate) return durationCount;

  for (let machineCount = durationCount; machineCount <= parallelMachineLimit; machineCount += 1) {
    const machineQty = assignedMachineOrderPcs(orderPcs, machineCount);
    const latestEnd = maxDateValue(...candidates.slice(0, machineCount).map((candidate) => {
      const machineReadyDate = machineNextSetupDate.get(canonicalKey(candidate.machine)) ?? "";
      const startDate = maxDateValue(normalizedReadyDate, machineReadyDate);
      return plannedProductionEnd(startDate, machineQty, cycle, undefined, planningCalendar);
    }));
    if (latestEnd && latestEnd <= normalizedDeadlineDate) return machineCount;
  }

  return durationCount;
}

function assignedMachineOrderPcs(orderPcs: number, machineCount: number) {
  if (!orderPcs || machineCount <= 1) return orderPcs;
  return Math.ceil(orderPcs / machineCount);
}

function plannedProductionDays(startDate: string, endDate: string, planningCalendar: PlanningCalendar = defaultPlanningCalendar) {
  const start = parseDate(startDate) || startDate;
  const end = parseDate(endDate) || endDate;
  if (!start || !end) return 0;
  if (end < start) return 0;
  let current = start;
  let days = 0;
  let guard = 0;
  while (current && current <= end && guard < 1000) {
    if (isPlanningDate(current, planningCalendar)) days += 1;
    current = addCalendarDays(current, 1);
    guard += 1;
  }
  return Math.max(1, days);
}

function dispatchTargetDate(rmInwardDate: string, planningCalendar: PlanningCalendar) {
  const rmDate = parseDate(rmInwardDate) || rmInwardDate;
  return rmDate ? addDays(rmDate, planningDispatchTargetDays, planningCalendar) : "";
}

function plannedProductionEnd(
  startDate: string,
  orderPcs: number,
  cycle: Record<string, unknown> | undefined,
  actual?: { latestDate: string; outputQty: number; actualQty: number; dates: Set<string> },
  planningCalendar: PlanningCalendar = defaultPlanningCalendar,
) {
  const normalizedStartDate = addDays(parseDate(startDate) || startDate, 0, planningCalendar);
  if (!normalizedStartDate) return "";
  if (actual?.latestDate && actual.dates.size) {
    if (actual.actualQty >= orderPcs) return maxDateValue(normalizedStartDate, actual.latestDate);
    const dailyOutput = Math.max(actual.actualQty || actual.outputQty, 0) / actual.dates.size;
    if (dailyOutput > 0) {
      const remainingQty = Math.max(orderPcs - actual.actualQty, 0);
      const remainingDays = Math.max(1, Math.ceil(remainingQty / dailyOutput));
      return maxDateValue(normalizedStartDate, addDays(parseDate(actual.latestDate) || actual.latestDate, remainingDays, planningCalendar));
    }
  }
  const cycleSeconds = safeNumber(rowValue(cycle ?? {}, "cycleTime", "CYCLE TIME")) + safeNumber(rowValue(cycle ?? {}, "loadingUnloading", "LOADING AND UNLOADING"));
  if (!orderPcs || !cycleSeconds) return normalizedStartDate;
  const estimatedHours = (orderPcs * cycleSeconds) / 3600;
  const productionDays = Math.max(1, Math.ceil(estimatedHours / planningHoursPerDay));
  return addDays(normalizedStartDate, productionDays - 1, planningCalendar);
}

function plannedWipBufferReadyDate({
  productionStartDates,
  orderPcs,
  previousCycle,
  nextCycle,
  actuals = [],
  planningCalendar = defaultPlanningCalendar,
}: {
  productionStartDates: string[];
  orderPcs: number;
  previousCycle: Record<string, unknown> | undefined;
  nextCycle: Record<string, unknown> | undefined;
  actuals?: Array<{ latestDate: string; outputQty: number; actualQty: number; dates: Set<string> }>;
  planningCalendar?: PlanningCalendar;
}) {
  const starts = productionStartDates.map(parseDate).filter(Boolean).sort();
  if ((!starts.length && !actuals.length) || !orderPcs || !nextCycle) return "";
  const previousDailyQty = cycleDailyQty(previousCycle);
  const nextDailyQty = cycleDailyQty(nextCycle);
  if (!previousDailyQty || !nextDailyQty) return "";

  const actualDailyQty = sum(actuals.map((actual) => {
    const dateCount = actual.dates.size || 1;
    return Math.max(actual.actualQty || actual.outputQty, 0) / dateCount;
  }));
  const effectivePreviousDailyQty = actualDailyQty || previousDailyQty;
  const bufferDays = effectivePreviousDailyQty < nextDailyQty ? 3 : 2;
  const requiredBufferQty = Math.min(orderPcs, nextDailyQty * bufferDays);
  if (actuals.length && actualDailyQty > 0) {
    const actualQty = Math.min(orderPcs, sum(actuals.map((actual) => Math.max(actual.actualQty || actual.outputQty, 0))));
    const latestActualDate = maxDateValue(...actuals.map((actual) => actual.latestDate));
    if (actualQty >= requiredBufferQty) return addDays(latestActualDate, wipAvailabilityBufferDays, planningCalendar);
    const remainingQty = Math.max(requiredBufferQty - actualQty, 0);
    const remainingDays = Math.max(1, Math.ceil(remainingQty / actualDailyQty));
    return addDays(latestActualDate, remainingDays + wipAvailabilityBufferDays, planningCalendar);
  }

  let producedQty = 0;
  const firstStart = starts[0];
  if (!firstStart) return "";
  let date = firstStart;
  const lastPossibleDate = addDays(date, Math.max(365, Math.ceil(orderPcs / effectivePreviousDailyQty) + starts.length + 30), planningCalendar);

  while (date && date <= lastPossibleDate) {
    const activeMachineCount = starts.filter((start) => start <= date).length;
    producedQty = Math.min(orderPcs, producedQty + activeMachineCount * effectivePreviousDailyQty);
    if (producedQty >= requiredBufferQty) return addDays(date, wipAvailabilityBufferDays, planningCalendar);
    date = addDays(date, 1, planningCalendar);
  }
  return "";
}

function actualWipBufferAvailable({
  orderPcs,
  previousCycle,
  nextCycle,
  actuals = [],
}: {
  orderPcs: number;
  previousCycle: Record<string, unknown> | undefined;
  nextCycle: Record<string, unknown> | undefined;
  actuals?: Array<{ latestDate: string; outputQty: number; actualQty: number; dates: Set<string> }>;
}) {
  if (!orderPcs || !nextCycle || !actuals.length) return false;
  const previousDailyQty = cycleDailyQty(previousCycle);
  const nextDailyQty = cycleDailyQty(nextCycle);
  if (!previousDailyQty || !nextDailyQty) return false;
  const actualDailyQty = sum(actuals.map((actual) => {
    const dateCount = actual.dates.size || 1;
    return Math.max(actual.actualQty || actual.outputQty, 0) / dateCount;
  }));
  const effectivePreviousDailyQty = actualDailyQty || previousDailyQty;
  const bufferDays = effectivePreviousDailyQty < nextDailyQty ? 3 : 2;
  const requiredBufferQty = Math.min(orderPcs, nextDailyQty * bufferDays);
  const actualQty = Math.min(orderPcs, sum(actuals.map((actual) => Math.max(actual.actualQty || actual.outputQty, 0))));
  return actualQty >= requiredBufferQty;
}

function cycleDailyQty(cycle: Record<string, unknown> | undefined) {
  const cycleSeconds = safeNumber(rowValue(cycle ?? {}, "cycleTime", "CYCLE TIME")) + safeNumber(rowValue(cycle ?? {}, "loadingUnloading", "LOADING AND UNLOADING"));
  return cycleSeconds ? (planningHoursPerDay * 3600) / cycleSeconds : 0;
}

function maxDateValue(...values: string[]) {
  return values.map(parseDate).filter(Boolean).sort().at(-1) ?? "";
}

function candidatePhysicalMachines(
  routeMachine: string,
  machineType: string,
  machineRows: Array<Record<string, unknown>>,
  unavailableMachines: Set<string>,
  machineLoad: Map<string, number>,
  machineNextSetupDate: Map<string, string>,
  machinePlannedDays: Map<string, number>,
  machinePlannedQty: Map<string, number>,
) {
  const typeKey = canonicalKey(machineType);
  return machineRows
    .map((row) => ({
      machine: rowText(row, "machine", "machineNo", "MACHINE NO", "M/C NO", "MACHINE NO."),
      machineType: rowText(row, "machineType", "MACHINE TYPE", "type", "TYPE"),
      status: rowText(row, "status", "activeStatus", "isActive", "ACTIVE", "active", "Active"),
    }))
    .filter((row) => row.machine)
    .filter((row) => isMachineActive(row.status))
    .filter((row) => !unavailableMachines.has(canonicalKey(row.machine)))
    .filter((row) => machineCodeMatches(routeMachine, row.machine))
    .filter((row) => !typeKey || !canonicalKey(row.machineType) || canonicalKey(row.machineType) === typeKey)
    .sort((a, b) =>
      (machinePlannedDays.get(canonicalKey(a.machine)) ?? 0) - (machinePlannedDays.get(canonicalKey(b.machine)) ?? 0) ||
      (machinePlannedQty.get(canonicalKey(a.machine)) ?? 0) - (machinePlannedQty.get(canonicalKey(b.machine)) ?? 0) ||
      (machineNextSetupDate.get(canonicalKey(a.machine)) ?? "").localeCompare(machineNextSetupDate.get(canonicalKey(b.machine)) ?? "") ||
      (machineLoad.get(canonicalKey(a.machine)) ?? 0) - (machineLoad.get(canonicalKey(b.machine)) ?? 0) ||
      a.machine.localeCompare(b.machine, undefined, { numeric: true }),
    );
}

function isMachineActive(status: string) {
  const normalized = status.toLowerCase();
  return !normalized || ["active", "yes", "true", "running", "available"].includes(normalized);
}

function groupRouteRows(rows: Record<string, unknown>[]) {
  const groups = new Map<string, Map<string, Record<string, unknown>>>();
  for (const row of rows) {
    const key = [canonicalKey(rowText(row, "PART NO", "PART CODE", "partNo")), rowText(row, "OPTION NUMBER", "optionNumber")].join("|");
    const setupKey = masterKey(row);
    if (!setupKey) continue;
    const list = groups.get(key) ?? new Map<string, Record<string, unknown>>();
    const current = list.get(setupKey);
    if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
      list.set(setupKey, row);
    }
    groups.set(key, list);
  }
  const dedupedGroups = new Map<string, Record<string, unknown>[]>();
  for (const [key, rowsInGroup] of groups.entries()) {
    const rows = [...rowsInGroup.values()];
    rows.sort((a, b) => numericSort(setupStepKey(rowText(a, "SETUP NO.", "SETUP CODE", "setupNo"), rowText(a, "OPTION NUMBER", "optionNumber")), setupStepKey(rowText(b, "SETUP NO.", "SETUP CODE", "setupNo"), rowText(b, "OPTION NUMBER", "optionNumber"))));
    dedupedGroups.set(key, rows);
  }
  return dedupedGroups;
}

function routeOptionSummaries(rows: Record<string, unknown>[], partKey: string) {
  return routeOptionSummariesByPart(rows).get(partKey) ?? [];
}

function routeOptionSummariesByPart(rows: Record<string, unknown>[]) {
  const summaries = new Map<string, {
    partKey: string;
    optionNumber: string;
    setupCount: number;
    machines: Set<string>;
    setupNames: Set<string>;
  }>();
  for (const row of latestMasterRows(rows).values()) {
    const partKey = canonicalKey(rowText(row, "PART NO", "PART CODE", "partNo"));
    if (!partKey) continue;
    const optionNumber = rowText(row, "OPTION NUMBER", "optionNumber");
    if (!optionNumber) continue;
    const key = [partKey, optionNumber].join("|");
    const summary = summaries.get(key) ?? {
      partKey,
      optionNumber,
      setupCount: 0,
      machines: new Set<string>(),
      setupNames: new Set<string>(),
    };
    summary.setupCount += 1;
    const machine = rowText(row, "MACHINE USED", "machineUsed", "MACHINE TYPE", "machineType");
    const setupName = rowText(row, "SETUP NAME", "setupName", "SETUP NO.", "setupNo");
    if (machine) summary.machines.add(machine);
    if (setupName) summary.setupNames.add(setupName);
    summaries.set(key, summary);
  }
  const byPart = new Map<string, Array<Record<string, unknown>>>();
  for (const summary of summaries.values()) {
    const rowsForPart = byPart.get(summary.partKey) ?? [];
    rowsForPart.push({
      optionNumber: summary.optionNumber,
      setupCount: summary.setupCount,
      machineUsed: compactJoin([...summary.machines], 3),
      setupName: compactJoin([...summary.setupNames], 3),
    });
    byPart.set(summary.partKey, rowsForPart);
  }
  for (const rowsForPart of byPart.values()) {
    rowsForPart.sort((a, b) => numericSort(rowText(a, "optionNumber"), rowText(b, "optionNumber")));
  }
  return byPart;
}

function masterKey(row: Record<string, unknown>) {
  const optionNumber = rowText(row, "OPTION NUMBER", "optionNumber");
  return [
    canonicalKey(rowText(row, "PART NO", "PART CODE", "partNo", "partCode")),
    optionNumber,
    setupStepKey(rowText(row, "SETUP NO.", "SETUP CODE", "setupNo"), optionNumber),
  ].join("|");
}

function latestMasterRows(rows: Record<string, unknown>[]) {
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = masterKey(row);
    if (!key || key.split("|").some((part) => !part)) continue;
    const current = latest.get(key);
    if (!current || rowText(row, "createdAt") >= rowText(current, "createdAt")) {
      latest.set(key, row);
    }
  }
  return latest;
}

function routeKey(partNo: unknown, setup: unknown) {
  const partText = keyText(partNo);
  const setupText = keyText(setup);
  return partText && setupText ? `${partText}|${setupText}` : "";
}

const normalizedRowCache = new WeakMap<Record<string, unknown>, Map<string, unknown>>();

function rowValue(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  let normalized = normalizedRowCache.get(row);
  if (!normalized) {
    normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
    normalizedRowCache.set(row, normalized);
  }
  for (const name of names) {
    const value = normalized.get(normalizeHeader(name));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function rowText(row: Record<string, unknown>, ...names: string[]) {
  return cleanText(rowValue(row, ...names));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeHeader(value: string) {
  return value.toUpperCase().replace(/\s+/g, " ").trim();
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function keyText(value: unknown) {
  return cleanText(value);
}

function text(value: unknown) {
  return cleanText(value);
}

function canonicalKey(value: unknown) {
  return cleanText(value).replace(/\s+/g, "").toLowerCase();
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function emptyTotals(): Totals {
  return { output: 0, target: 0, reject: 0, runs: 0 };
}

function emptyRichTotals(): RichTotals {
  return { ...emptyTotals(), downtime: 0, runtimeHours: 0, loggedHours: 0 };
}

function addTotals(target: Totals, output: number, totalTarget: number, reject: number) {
  target.output += output;
  target.target += totalTarget;
  target.reject += reject;
  target.runs += 1;
}

function addRichTotals(target: RichTotals, output: number, totalTarget: number, reject: number, downtime: number, runtimeHours: number, loggedHours: number) {
  addTotals(target, output, totalTarget, reject);
  target.downtime += downtime;
  target.runtimeHours += runtimeHours;
  target.loggedHours += loggedHours;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V) {
  const existing = map.get(key);
  if (existing) return existing;
  const value = create();
  map.set(key, value);
  return value;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localIsoDate(value);
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialIsoDate(value);
  const raw = cleanText(value);
  if (!raw) return "";
  if (/^\d{4,6}(?:\.\d+)?$/.test(raw)) return excelSerialIsoDate(Number(raw));
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const namedDayFirstMatch = raw.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2}|\d{4})(?:\s|$)/);
  if (namedDayFirstMatch) {
    const [, dayText, monthText, yearText] = namedDayFirstMatch;
    const day = Number(dayText);
    const month = monthText ? monthNames[monthText.toLowerCase()] : undefined;
    const rawYear = Number(yearText);
    const year = yearText && yearText.length === 2 ? 2000 + rawYear : rawYear;
    if (day >= 1 && day <= 31 && month !== undefined && month >= 1 && month <= 12 && Number.isFinite(year)) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        return date.toISOString().slice(0, 10);
      }
    }
  }
  const dayFirstMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s|$)/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      day >= 1 && day <= 31 &&
      month >= 1 && month <= 12 &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return localIsoDate(parsed);
  return "";
}

function excelSerialIsoDate(value: number) {
  const wholeDays = Math.floor(value);
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + wholeDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(value: string) {
  const date = parseDate(value);
  if (!date) return ["", cleanText(value)] as const;
  const monthIndex = Number(date.slice(5, 7)) - 1;
  return [date.slice(0, 7), `${monthShortLegacy[monthIndex]}-${date.slice(2, 4)}`] as const;
}

function dateKey(value: string) {
  const date = parseDate(value);
  return [date, dateLabel(date)] as const;
}

function dateLabel(value: unknown) {
  const date = parseDate(value);
  if (!date) return cleanText(value);
  const day = Number(date.slice(8, 10));
  const monthIndex = Number(date.slice(5, 7)) - 1;
  return `${day}-${monthShort[monthIndex]}-${date.slice(2, 4)}`;
}

function monthLabelFromKey(key: string) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return `${monthShortLegacy[monthIndex]}-${key.slice(2, 4)}`;
}

function attendanceMonthBounds(key: string) {
  if (!/^\d{4}-\d{2}$/.test(key)) return ["", ""] as const;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return [start, `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`] as const;
}

function durationMinutes(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return 0;
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    return Number(timeMatch[1]) * 60 + Number(timeMatch[2]) + Number(timeMatch[3] ?? 0) / 60;
  }
  const numeric = safeNumber(value);
  return numeric <= 1 && numeric > 0 ? numeric * 24 * 60 : numeric;
}

function timeRangeMinutes(start: unknown, end: unknown) {
  const startMinutes = durationMinutes(start);
  let endMinutes = durationMinutes(end);
  if (!startMinutes || !endMinutes) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(endMinutes - startMinutes, 0);
}

function elapsedMinutesFromRow(row: Record<string, unknown>) {
  const totalMinutes = timeRangeMinutes(rowValue(row, "MACHINE START TIME", "M/C START TIME"), rowValue(row, "MACHINE END TIME", "M/C END TIME"));
  if (totalMinutes) return Math.max(totalMinutes - durationMinutes(rowValue(row, "SCHEDULED BREAK TIME (MINUTES)", "BREAK TIME (MINUTES)", "Breaks")), 0);
  const hours = safeNumber(rowValue(row, "AVAILABLE RUN HOURS", "LOGGED HOURS AFTER LUNCH", "LOGGED HOURS", "TOTAL HOUR"));
  const minutes = safeNumber(rowValue(row, "AVAILABLE RUN MINUTES REMAINING", "LOGGED MINUTES AFTER LUNCH", "LOGGED MINUTES", "TOTAL MIN"));
  if (hours || minutes) return hours * 60 + minutes;
  return durationMinutes(rowValue(row, "AVAILABLE MACHINE TIME (MINUTES)", "AVAILABLE RUN TIME (MINUTES)", "LOGGED TIME IN MINUTES AFTER LUNCH", "LOGGED TIME IN MINUTES", "TOTAL MACHINE RUN TIME IN MIN"));
}

function downtimeValuesFromRow(row: Record<string, unknown>) {
  const values: Array<[string, number]> = [];
  for (const [label, aliases] of downtimeReasonFields) {
    const minutes = durationMinutes(rowValue(row, ...aliases));
    if (minutes > 0) values.push([label, minutes]);
  }
  const reasonTotal = sum(values.map(([, minutes]) => minutes));
  const totalDowntime = durationMinutes(rowValue(row, "TOTAL DOWNTIME MINUTES", "M/C DOWN TIME", "DownTime"));
  const effectiveDowntime = Math.max(reasonTotal, totalDowntime);
  const missingReasonMinutes = Math.max(totalDowntime - reasonTotal, 0);
  if (missingReasonMinutes > 0) values.push([unassignedDowntimeReason, missingReasonMinutes]);
  return [values, effectiveDowntime] as const;
}

function runtimeHoursFromRow(row: Record<string, unknown>, downtimeMinutes: number) {
  const elapsed = elapsedMinutesFromRow(row);
  return Math.max(elapsed - downtimeMinutes, 0) / 60;
}

function rejectionEntriesFromRow(row: Record<string, unknown>) {
  const entries: Array<Record<string, unknown>> = [];
  for (let index = 1; index <= rejectionEntryCount; index += 1) {
    const qty = safeNumber(rowValue(row, `REJECTION ${index} QUANTITY (PCS)`, `REJECTION ${index} REJECTION QUANTITY`, `REJECTION ${index} QTY (PCS)`, `RejQty${index}`));
    if (qty <= 0) continue;
    entries.push({
      type: rowText(row, `REJECTION ${index} TYPE OF REJECTION`, `REJECTION ${index} TYPE`, `RejType${index}`),
      reason: rowText(row, `REJECTION ${index} REASON FOR REJECTION`, `REJECTION ${index} REASON`, `RejReason${index}`),
      remark: rowText(row, `REJECTION ${index} REMARK`, `REJECTION ${index} REJECTION REMARK`, `RejRemarks${index}`),
      qty,
    });
  }
  if (!entries.length) {
    const legacyReject = safeNumber(rowValue(row, "REJECTION QTY (PCS)", "REJ QTY IN PCS"));
    if (legacyReject > 0) {
      entries.push({ type: "Unclassified Rejection", reason: "Legacy rejection quantity", remark: rowText(row, "REMARKS", "REMARK"), qty: legacyReject });
    }
  }
  return entries;
}

function rejectionTotalFromRow(row: Record<string, unknown>) {
  return sum(rejectionEntriesFromRow(row).map((entry) => safeNumber(rowValue(entry, "qty"))));
}

function emptyAnalysisRow(code: string, name: string) {
  return { code, name, reject: 0, entries: 0, operators: new Set<string>(), machines: new Set<string>(), parts: new Set<string>(), setups: new Set<string>() };
}

function addAnalysisRow(row: ReturnType<typeof emptyAnalysisRow>, rejectQty: number, operator: string, machine: string, part: string, setup: string) {
  row.reject += rejectQty;
  row.entries += 1;
  row.operators.add(operator);
  row.machines.add(machine);
  row.parts.add(part);
  row.setups.add(setup);
}

function analysisRows(rows: Map<string, ReturnType<typeof emptyAnalysisRow>>) {
  return [...rows.values()]
    .map((row) => ({
      code: row.code,
      name: row.name,
      reject: round(row.reject),
      entries: row.entries,
      operators: row.operators.size,
      machines: row.machines.size,
      parts: row.parts.size,
      setups: row.setups.size,
    }))
    .sort((a, b) => b.reject - a.reject || b.entries - a.entries);
}

function richDowntimeRow(prefix: Record<string, unknown>, row: RichTotals & { reasons: Map<string, number> }) {
  return {
    ...prefix,
    downtime: round(row.downtime),
    runtimeHours: round(row.runtimeHours),
    loggedHours: round(row.loggedHours),
    cardEntries: row.runs,
    topReason: topReason(row.reasons),
    output: round(row.output),
    target: round(row.target),
    reject: round(row.reject),
    efficiency: ratio(row.output, row.target),
    rejectRate: ratio(row.reject, row.output),
    runs: row.runs,
  };
}

function topReason(reasons: Map<string, number>) {
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (${round(top[1])} min)` : "-";
}

function settingMinutesFromRow(row: Record<string, unknown>) {
  const explicit = durationMinutes(rowValue(row, "SETTING TIME (MIN)", "SETTING MINUTES", "SETTING DURATION"));
  if (explicit) return explicit;
  return timeRangeMinutes(rowValue(row, "SETTING START TIME", "START TIME", "settingStartTime"), rowValue(row, "SETTING END TIME", "END TIME", "settingEndTime"));
}

function addSetupTotal(row: { settings: number; totalMinutes: number; machines: Set<string>; itemSetups: Set<string> }, minutes: number, machine: string, itemSetupKey: string) {
  row.settings += 1;
  row.totalMinutes += minutes;
  row.machines.add(machine);
  row.itemSetups.add(itemSetupKey);
}

type WithoutSetFields<T> = {
  [K in keyof T as T[K] extends Set<unknown> ? never : K]: T[K];
};

type SetupAggregateBase = Record<string, unknown> & {
  settings: number;
  totalMinutes: number;
  machines: Set<string>;
  itemSetups: Set<string>;
};

function setupAggregateRow<T extends SetupAggregateBase>(row: T): WithoutSetFields<T> & {
  settings: number;
  totalMinutes: number;
  avgMinutes: number;
  machines: number;
  itemSetups: number;
} {
  return {
    ...withoutSets(row),
    settings: row.settings,
    totalMinutes: round(row.totalMinutes),
    avgMinutes: ratio(row.totalMinutes, row.settings),
    machines: row.machines.size,
    itemSetups: row.itemSetups.size,
  };
}

function withoutSets<T extends Record<string, unknown>>(row: T): WithoutSetFields<T> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => !(value instanceof Set))) as WithoutSetFields<T>;
}

function toolCodesFromText(value: unknown) {
  const source = cleanText(value).toUpperCase();
  if (!source || ["-", "NA", "N/A", "NONE", "NIL", "NOT APPLICABLE"].includes(source)) return [];
  return [...source.matchAll(/\b([A-Z]{1,3})\s*-?\s*(\d+)\b/g)].map((match) => [match[1]!, Number(match[2])] as [string, number]);
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()];
}

function compactJoin(values: unknown[], limit = 4) {
  const cleaned = values.map(cleanText).filter(Boolean);
  if (cleaned.length <= limit) return cleaned.join(", ");
  return `${cleaned.slice(0, limit).join(", ")} +${cleaned.length - limit}`;
}

function numericSort(a: string, b: string) {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return a.localeCompare(b, undefined, { numeric: true });
}

function maxDate(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function latestMeetingMonthLabel(rows: Record<string, unknown>[]) {
  const labels = rows.map((row) => meetingMonthLabelFromRow(row)).filter(Boolean);
  return labels.sort().at(-1) ?? "";
}

function meetingMonthLabelFromRow(row: Record<string, unknown>) {
  const raw = rowText(row, "Month");
  if (!raw) return "";
  if (raw.includes("-")) return raw;
  const month = monthNames[raw.toLowerCase()];
  if (!month) return raw;
  const meetingDate = parseDate(rowValue(row, "Meeting Date"));
  const year = meetingDate ? meetingDate.slice(2, 4) : new Date().getFullYear().toString().slice(2, 4);
  return `${monthShortLegacy[month - 1]}-${year}`;
}

function meetingMonthMatches(row: Record<string, unknown>, monthLabel: string) {
  const rowLabel = meetingMonthLabelFromRow(row);
  if (!monthLabel) return true;
  return rowLabel.toLowerCase() === monthLabel.toLowerCase() || rowLabel.slice(0, 3).toLowerCase() === monthLabel.slice(0, 3).toLowerCase();
}

function isBlankish(value: unknown) {
  return ["", "-", "na", "n/a", "no", "none", "nil", "nothing", "no issue", "no issues"].includes(cleanText(value).toLowerCase());
}

function employeeIdCandidates(value: unknown) {
  const employeeId = cleanText(value);
  if (!employeeId) return new Set<string>();
  const candidates = new Set([employeeId, employeeId.toUpperCase()]);
  if (/^\d+$/.test(employeeId)) {
    candidates.add(`E${employeeId}`);
    candidates.add(`E${employeeId.padStart(3, "0")}`);
  }
  if (/^E\d+$/i.test(employeeId)) {
    const numeric = employeeId.slice(1);
    candidates.add(numeric);
    candidates.add(String(Number(numeric)));
  }
  return candidates;
}

function meetingThemeFor(field: string, answer: unknown) {
  const value = cleanText(answer);
  if (isBlankish(value)) return "";
  const lowered = value.toLowerCase();
  if (field === "Are the targets realistic?") {
    return ["no", "not", "high", "unrealistic", "difficult", "hard"].some((word) => lowered.includes(word))
      ? "Target concern"
      : "Targets acceptable";
  }
  const groups: Array<[string, string[]]> = [
    ["Machine / tool issue", ["machine", "tool", "maintenance", "breakdown", "wear", "downtime", "mc"]],
    ["Setup / setting delay", ["setup", "setting", "changeover"]],
    ["Material / RM issue", ["material", "rm", "raw material", "brass"]],
    ["Waiting / planning delay", ["waiting", "wait", "planning", "plan", "approval"]],
    ["Training / support need", ["training", "support", "learn", "skill", "cnc", "help"]],
    ["Quality / rejection issue", ["quality", "qc", "reject", "rejection", "inspection"]],
    ["People / staffing issue", ["operator", "staff", "helper", "team"]],
    ["Motivation / growth", ["motivat", "growth", "promotion", "salary", "increment", "recognition"]],
    ["Work environment", ["frustrat", "pressure", "stress", "environment"]],
  ];
  return groups.find(([, keywords]) => keywords.some((keyword) => lowered.includes(keyword)))?.[0] ?? "Other";
}

function incrementTheme(counts: Map<string, number>, theme: string) {
  if (!theme) return;
  counts.set(theme, (counts.get(theme) ?? 0) + 1);
}

function themeRows(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({ theme, count }));
}
