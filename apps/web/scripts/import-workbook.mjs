/* global process */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import XLSX from "xlsx";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const defaultWorkbook = path.resolve(appDir, "../../..", "Advanced_Employee_Performance_System.xlsx");
const args = parseArgs(process.argv.slice(2));
const workbookPath = path.resolve(args.workbook ?? defaultWorkbook);
const apply = Boolean(args.apply);
const replace = args.replace !== false;
const entryTypeFilter = args.entryType ? text(args.entryType) : "";
const includePlannerActions = Boolean(args.includePlannerActions);

loadEnv(path.join(appDir, ".env.local"));

function parseArgs(argv) {
  const parsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      parsedArgs.apply = true;
    } else if (arg === "--no-replace") {
      parsedArgs.replace = false;
    } else if (arg === "--replace") {
      parsedArgs.replace = true;
    } else if (arg === "--workbook") {
      parsedArgs.workbook = argv[++index];
    } else if (arg === "--entry-type") {
      parsedArgs.entryType = argv[++index];
    } else if (arg === "--include-planner-actions") {
      parsedArgs.includePlannerActions = true;
    }
  }
  return parsedArgs;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*?)(?:\s+#.*)?$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = String(rawValue ?? "").replace(/^["']|["']$/g, "");
  }
}

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const employeeLookup = buildEmployeeLookup(workbook);
  // Software_Raw_Import is historical construction data and must not seed shop-floor output.
  const productionEntries = [];
  const dataEntries = [
    ...parseRawSheetEntries(workbook, "machine_master", "Machine_Master", (row) => text(rowValue(row, "M/C NO", "MACHINE NO", "MACHINE NUMBER"))),
    ...parseRawSheetEntries(workbook, "dispatch", "Main_Floor_Dispatch", (row) => text(rowValue(row, "JC NO.", "JC NO", "JOB CARD NO.", "JobCardNo"))),
    ...parseRawSheetEntries(workbook, "rejection_classification", "Rejection Classification", (row) => text(rowValue(row, "CODE", "Rejection Reason"))),
    ...parseRawSheetEntries(workbook, "raw_material_plan", "Raw_Material_Date_Plan", (row) => text(rowValue(row, "RM Date Plan ID", "Production Job Card No.", "PART NO"))),
    ...parseRawSheetEntries(workbook, "machine_planning", "FG_Machine_Planning", (row) => text(rowValue(row, "Plan ID", "Production Job Card No.", "PART NO"))),
    ...parseRawSheetEntries(workbook, "quality_inspection", "Quality_Inspection", (row) => text(rowValue(row, "Inspection ID", "PART NO"))),
    ...parseDataEntries(workbook, "route", "Planning_Route_Master", routeMap),
    ...parseDataEntries(workbook, "cycle", "Planning_Cycle_Time_Master", cycleMap),
    ...parseDataEntries(workbook, "tooling", "Planning_Tooling_Master", toolingMap),
    ...parseDataEntries(workbook, "work_order", "Work_Order_Import", workOrderMap),
    ...parseRmInwardEntries(workbook),
    ...parseDataEntries(workbook, "employee", "Employee_Master", employeeMap),
  ];
  dataEntries.push({
    entryType: "_summary",
    key: "counts",
    payload: { counts: countDataEntriesByType(dataEntries) },
  });

  return {
    productionEntries,
    attendanceRecords: [],
    trainingRecords: [],
    routeSelections: parseRouteSelections(workbook),
    plannerPriorities: parsePlannerPriorities(workbook),
    machineConstraints: parseMachineConstraints(workbook),
    planOverrides: parsePlanOverrides(workbook),
    routeChanges: parseRouteChanges(workbook),
    dispatchApprovals: [],
    setupCompletions: parseSetupCompletions(workbook),
    dataEntries,
  };
}

function parseEntryTypeWorkbook(filePath, entryType) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const parser = dataEntryParsers[entryType];
  if (!parser) {
    throw new Error(`Unsupported --entry-type "${entryType}". Supported values: ${Object.keys(dataEntryParsers).join(", ")}`);
  }
  const dataEntries = parser(workbook);
  dataEntries.push({
    entryType: "_summary",
    key: "counts",
    payload: { counts: countDataEntriesByType(dataEntries) },
  });
  return { dataEntries };
}

const dataEntryParsers = {
  machine_master: (workbook) => parseRawSheetEntries(workbook, "machine_master", "Machine_Master", (row) => text(rowValue(row, "M/C NO", "MACHINE NO", "MACHINE NUMBER"))),
  dispatch: (workbook) => parseRawSheetEntries(workbook, "dispatch", "Main_Floor_Dispatch", (row) => text(rowValue(row, "JC NO.", "JC NO", "JOB CARD NO.", "JobCardNo"))),
  rejection_classification: (workbook) => parseRawSheetEntries(workbook, "rejection_classification", "Rejection Classification", (row) => text(rowValue(row, "CODE", "Rejection Reason"))),
  raw_material_plan: (workbook) => parseRawSheetEntries(workbook, "raw_material_plan", "Raw_Material_Date_Plan", (row) => text(rowValue(row, "RM Date Plan ID", "Production Job Card No.", "PART NO"))),
  machine_planning: (workbook) => parseRawSheetEntries(workbook, "machine_planning", "FG_Machine_Planning", (row) => text(rowValue(row, "Plan ID", "Production Job Card No.", "PART NO"))),
  quality_inspection: (workbook) => parseRawSheetEntries(workbook, "quality_inspection", "Quality_Inspection", (row) => text(rowValue(row, "Inspection ID", "PART NO"))),
  route: (workbook) => parseDataEntries(workbook, "route", "Planning_Route_Master", routeMap),
  cycle: (workbook) => parseDataEntries(workbook, "cycle", "Planning_Cycle_Time_Master", cycleMap),
  tooling: (workbook) => parseDataEntries(workbook, "tooling", "Planning_Tooling_Master", toolingMap),
  work_order: (workbook) => parseDataEntries(workbook, "work_order", "Work_Order_Import", workOrderMap),
  rm_inward: parseRmInwardEntries,
  employee: (workbook) => parseDataEntries(workbook, "employee", "Employee_Master", employeeMap),
  setup_checklist: (workbook) => parseDataEntries(workbook, "setup_checklist", "Setup_Checklist", setupChecklistMap),
};

const routeMap = {
  partNo: ["PART NO", "PART CODE", "ITEM CODE"],
  optionNumber: ["OPTION NUMBER"],
  setupNo: ["SETUP NO.", "SETUP NO", "SETUP CODE"],
  numberOfSetups: ["NO. OF SETUP", "NUMBER OF SETUP"],
  setupName: ["SETUP NAME"],
  machineUsed: ["MACHINE USED"],
  machineType: ["MACHINE TYPE"],
  stageWeight: ["STAGE WEIGHT (GRAM)"],
  rodSize: ["ROD SIZE"],
  cuttingLength: ["CUTTING LENGTH"],
  finishedGoodsLength: ["FINISHED GOODS LENGTH"],
};

const cycleMap = {
  partNo: ["PART NO", "PART CODE", "ITEM CODE"],
  optionNumber: ["OPTION NUMBER"],
  setupNo: ["SETUP NO.", "SETUP NO", "SETUP CODE"],
  setupName: ["SETUP NAME"],
  machineUsed: ["MACHINE USED"],
  operationWeight: ["OPERATION WISE WEIGHT (GRAM)"],
  cycleTime: ["CYCLE TIME"],
  loadingUnloading: ["LOADING AND UNLOADING"],
};

const toolingMap = {
  partNo: ["PART NO", "PART CODE", "ITEM CODE"],
  optionNumber: ["OPTION NUMBER"],
  setupNo: ["SETUP NO.", "SETUP NO", "SETUP CODE"],
  setupName: ["SETUP NAME"],
  machineUsed: ["MACHINE USED"],
  fixture: ["FIXTURE"],
  fixtureQty: ["FIXTURE QTY"],
  tooling: ["TOOLING"],
  toolingQty: ["TOOLING QTY"],
  foamTool: ["FOAM TOOL"],
  foamToolQty: ["FOAM TOOL QTY"],
  remarks: ["REMARKS", "REMARK"],
};

const workOrderMap = {
  jcNo: ["JC NO.", "JC NO", "JOB CARD NO.", "JobCardNo"],
  location: ["LOCATION"],
  poDate: ["PO DATE"],
  fgPoNo: ["FG PO NO."],
  rmPoNo: ["RM PO NO."],
  partCode: ["PART CODE", "PART NO"],
  description: ["DESCRIPTION"],
  numberOfSetups: ["NUMBER OF SETUP"],
  optionNumber: ["OPTION NUMBER"],
  status: ["STATUS"],
  sampleRemark: ["SAMPLE REMARK"],
  grade: ["GRADE"],
  orderKg: ["ORD. KG."],
  rmInwardKg: ["RM INWARD KG."],
  orderPcs: ["ORD. PCS."],
  rmDeliveryDate: ["RM DELIVERY DATE"],
  rmInwardDate: ["RM I/W DATE"],
  deliveryDate: ["DELIVERY DATE"],
  fgDeliveryDateGiven: ["FG DELIVERY DATE GIVEN"],
  deliveryRemark: ["DELIVERY REMARK"],
  plannerPriority: ["PLANNER PRIORITY"],
  priorityRemark: ["PRIORITY REMARK"],
};

const employeeMap = {
  empId: ["EMP ID", "Emp ID"],
  employeeType: ["EMPLOYEE TYPE", "Employee Type"],
  employeeName: ["EMPLOYEE NAME", "Employee Name"],
  location: ["LOCATION", "Location"],
  doj: ["DOJ"],
  terminatedDate: ["TERMINATED DATE", "Terminated Date"],
  status: ["STATUS", "Status"],
};

const setupChecklistMap = {
  srNo: ["SR NO."],
  jcNo: ["JC NO.", "JC NO", "JobCardNo"],
  setupDate: ["SETUP DATE"],
  shift: ["SHIFT", "Shift"],
  location: ["LOCATION", "Location"],
  machineNo: ["M/C NO", "MACHINE NO"],
  partNo: ["PART NO", "PART CODE"],
  optionNumber: ["OPTION NUMBER", "OPTION NO"],
  setupNo: ["SETUP NO.", "SETUP NO", "SET UP"],
  rimmerAvailability: ["RIMMER AVAILABILITY"],
  modhiyu: ["MODHIYU"],
  setterCode: ["SETTER Code", "SETTER CODE"],
  helperCode: ["HELPER Code", "HELPER CODE"],
  settingStartTime: ["SETTING START TIME"],
  settingEndTime: ["SETTING END TIME"],
  qcController: ["QC CONTROLLER"],
  remarks: ["REMARKS", "REMARK"],
};

function buildRouteLookup(workbook) {
  const lookup = new Map();
  for (const row of rows(workbook, "Planning_Route_Master")) {
    const partNo = text(rowValue(row, "PART CODE", "PART NO"));
    const setupNo = text(rowValue(row, "SETUP CODE", "SETUP NO.", "SET UP"));
    if (!partNo || !setupNo) continue;
    const key = routeKey(partNo, setupNo);
    if (lookup.has(key)) continue;
    lookup.set(key, {
      machineType: text(rowValue(row, "MACHINE TYPE")),
      machineUsed: text(rowValue(row, "MACHINE USED")),
      setupName: text(rowValue(row, "SETUP NAME")),
    });
  }
  return lookup;
}

function buildEmployeeLookup(workbook) {
  const lookup = new Map();
  for (const row of rows(workbook, "Employee_Master")) {
    const empId = text(rowValue(row, "Emp ID", "EMP ID"));
    if (!empId) continue;
    lookup.set(empId, {
      name: text(rowValue(row, "Employee Name", "EMPLOYEE NAME")) || empId,
      department: text(rowValue(row, "Department", "DEPARTMENT")),
    });
  }
  return lookup;
}

function parseProductionEntries(workbook, routeLookup, employeeLookup) {
  const entries = [];
  for (const row of rows(workbook, "Software_Raw_Import")) {
    if (!isValidRawRow(row)) continue;
    const prodDate = isoDate(rowValue(row, "PROD DATE", "PRODUCTION DATE"));
    const machine = text(rowValue(row, "M/C NO", "MACHINE NO"));
    const rawOperator = text(rowValue(row, "OPERATOR ID", "OPERATOR NAME"));
    if (!prodDate || !machine || !rawOperator) continue;

    const partCode = text(rowValue(row, "PART NO", "PART CODE")) || "-";
    const setupNo = text(rowValue(row, "SET UP", "SETUP CODE", "SETUP NO."));
    const route = routeLookup.get(routeKey(partCode, setupNo)) ?? {};
    const rejection = firstRejection(row);
    const downtime = downtimeFromRow(row);
    const employee = employeeLookup.get(rawOperator);

    entries.push(dropUndefined({
      prodDate,
      operatorId: rawOperator,
      operatorName: employee?.name ?? rawOperator,
      machineType: route.machineType || text(rowValue(row, "MACHINE TYPE", "MC TYPE")) || "Unspecified",
      machine,
      partCode,
      jobCard: text(rowValue(row, "JobCardNo", "JOB CARD NO.", "JC NO.")) || undefined,
      setupNo: setupNo || undefined,
      outputQty: number(rowValue(row, "PROD QTY IN PCS", "PRODUCTION QTY (PCS)")),
      actualQty: optionalNumberValue(rowValue(row, "ACTUAL QTY IN PCS", "ACTUAL QTY")),
      targetQty: number(rowValue(row, "Target Pcs", "TARGET QTY (PCS)", "TARGE PCS")),
      rejectQty: rejection.total,
      rejectionType: rejection.type || undefined,
      rejectionRemark: rejection.remark || text(rowValue(row, "REMARKS", "REMARK")) || undefined,
      downtimeMinutes: downtime.minutes || undefined,
      downtimeReason: downtime.reason || undefined,
    }));
  }
  return entries;
}

function parseAttendanceRecords(workbook, employeeLookup) {
  return rows(workbook, "Attendance")
    .map((row) => {
      const operatorId = text(rowValue(row, "Emp ID", "EMP ID"));
      const monthKey = attendanceMonthKey(row);
      if (!operatorId || !monthKey) return undefined;
      return dropUndefined({
        operatorId,
        operatorName: text(rowValue(row, "Employee Name", "EMPLOYEE NAME")) || employeeLookup.get(operatorId)?.name,
        monthKey,
        workingDays: number(rowValue(row, "Working Days", "WORKING DAYS")),
        presentDays: number(rowValue(row, "Days Present", "DAYS PRESENT")),
        score: optionalNumberValue(rowValue(row, "Attendance Score", "ATTENDANCE SCORE")),
      });
    })
    .filter(Boolean);
}

function parseTrainingRecords(workbook, employeeLookup) {
  return rows(workbook, "Training_Tracker")
    .map((row) => {
      const operatorId = text(rowValue(row, "Emp ID", "EMP ID"));
      const trainingType = text(rowValue(row, "Training Type", "TRAINING TYPE"));
      const status = text(rowValue(row, "Status", "STATUS"));
      if (!operatorId && !trainingType && !status) return undefined;
      return dropUndefined({
        operatorId,
        operatorName: text(rowValue(row, "Employee Name", "EMPLOYEE NAME")) || employeeLookup.get(operatorId)?.name,
        department: text(rowValue(row, "Department", "DEPARTMENT", "Location", "LOCATION")) || employeeLookup.get(operatorId)?.department,
        date: isoDate(rowValue(row, "Date", "DATE")) || undefined,
        trainingType: trainingType || "Unspecified",
        reason: text(rowValue(row, "Reason/Finding", "REASON/FINDING")) || undefined,
        trainer: text(rowValue(row, "Trainer Name", "TRAINER NAME", "Trainer Code", "TRAINER CODE")) || undefined,
        status: status || "Pending",
      });
    })
    .filter(Boolean);
}

function parseDataEntries(workbook, entryType, sheetName, fieldMap) {
  return rows(workbook, sheetName)
    .map((row) => mapFields(row, fieldMap))
    .filter((payload) => Object.values(payload).some((value) => text(value)))
    .map((payload) => dataEntry(entryType, payload));
}

function parseRawSheetEntries(workbook, entryType, sheetName, includeRow) {
  return rows(workbook, sheetName)
    .filter((row) => includeRow(row))
    .map((row) => rawSheetPayload(row.raw))
    .filter((payload) => Object.values(payload).some((value) => text(value)))
    .map((payload) => dataEntry(entryType, payload));
}

function rawSheetPayload(row) {
  const payload = {};
  for (const [header, value] of Object.entries(row)) {
    const cleaned = cleanCell(value, header);
    if (cleaned !== undefined && cleaned !== "") payload[text(header)] = cleaned;
  }
  return payload;
}

function parseRmInwardEntries(workbook) {
  return rows(workbook, "Work_Order_Import")
    .map((row) => mapFields(row, {
      jcNo: ["JC NO.", "JC NO", "JOB CARD NO.", "JobCardNo"],
      rmInwardDate: ["RM I/W DATE"],
      rmInwardKg: ["RM INWARD KG."],
      status: ["STATUS"],
      remark: ["DELIVERY REMARK", "REMARK"],
    }))
    .filter((payload) => text(payload.jcNo) && (text(payload.rmInwardDate) || text(payload.rmInwardKg)))
    .map((payload) => dataEntry("rm_inward", payload));
}

function dataEntry(entryType, payload) {
  return {
    entryType,
    key: dataEntryKey(entryType, payload),
    payload,
  };
}

function dataEntryKey(entryType, payload) {
  if (["route", "cycle", "tooling"].includes(entryType)) {
    return text(payload.partNo || payload.partCode);
  }
  if (entryType === "work_order" || entryType === "rm_inward" || entryType === "setup_checklist") {
    return text(payload.jcNo);
  }
  if (entryType === "employee") {
    return text(payload.empId);
  }
  if (entryType === "planning_holiday") {
    return [payload.date, payload.scope, payload.machine, payload.department].map(text).join("|");
  }
  return "";
}

function parseRouteSelections(workbook) {
  return rows(workbook, "Planner_Route_Selection_Log")
    .map((row) => dropUndefined({
      jcNo: text(rowValue(row, "JC NO.", "JC NO")),
      optionNumber: text(rowValue(row, "SELECTED ROUTE OPTION", "OPTION NUMBER")),
      createdAt: isoDateTime(rowValue(row, "LOGGED ON")) || undefined,
    }))
    .filter((row) => row.jcNo && row.optionNumber);
}

function parsePlannerPriorities(workbook) {
  return rows(workbook, "Planner_Priority_Log")
    .map((row) => dropUndefined({
      target: text(rowValue(row, "TARGET", "JC NO.", "PART CODE")),
      priority: text(rowValue(row, "PRIORITY")) || "Normal",
      remark: text(rowValue(row, "REASON", "REMARK")) || undefined,
      createdAt: isoDateTime(rowValue(row, "LOGGED ON")) || undefined,
    }))
    .filter((row) => row.target);
}

function parseMachineConstraints(workbook) {
  return rows(workbook, "Planner_Machine_Constraints")
    .map((row) => dropUndefined({
      machineNo: text(rowValue(row, "MACHINE NO.", "MACHINE NO", "M/C NO")),
      unavailableFrom: isoDate(rowValue(row, "UNAVAILABLE FROM")) || "",
      unavailableTo: isoDate(rowValue(row, "UNAVAILABLE TO")) || "",
      reason: text(rowValue(row, "REASON")) || text(rowValue(row, "STATUS")) || "Imported machine constraint",
      remark: text(rowValue(row, "REMARK")) || undefined,
      rescheduleAction: text(rowValue(row, "STATUS")) || undefined,
      createdAt: isoDateTime(rowValue(row, "LOGGED ON")) || undefined,
    }))
    .filter((row) => row.machineNo);
}

function parsePlanOverrides(workbook) {
  return rows(workbook, "Planner_Plan_Overrides")
    .map((row) => dropUndefined({
      target: text(rowValue(row, "JC NO.", "JC NO", "PART CODE")),
      setupNo: text(rowValue(row, "SETUP NO.", "SETUP NO")) || undefined,
      fromMachine: text(rowValue(row, "FROM MACHINE")) || undefined,
      toMachine: text(rowValue(row, "TO MACHINE")) || "",
      reason: text(rowValue(row, "REASON")) || undefined,
      createdAt: isoDateTime(rowValue(row, "LOGGED ON")) || undefined,
    }))
    .filter((row) => row.target && row.toMachine);
}

function parseRouteChanges(workbook) {
  return rows(workbook, "Planner_Route_Changes")
    .map((row) => dropUndefined({
      target: text(rowValue(row, "TARGET", "JC NO.", "JC NO", "PART CODE")),
      newOption: text(rowValue(row, "NEW OPTION", "NEW ROUTE OPTION")) || "",
      changeAfterSetup: text(rowValue(row, "CHANGE AFTER SETUP")) || undefined,
      applyFromSetup: text(rowValue(row, "APPLY FROM SETUP")) || undefined,
      wipQty: optionalNumberValue(rowValue(row, "WIP QTY")),
      reason: text(rowValue(row, "REASON")) || undefined,
      createdAt: isoDateTime(rowValue(row, "LOGGED ON")) || undefined,
    }))
    .filter((row) => row.target && row.newOption);
}

function parseSetupCompletions(workbook) {
  return rows(workbook, "Setup_Completion_Log")
    .map((row) => dropUndefined({
      jcNo: text(rowValue(row, "JC NO.", "JC NO")),
      setupNo: text(rowValue(row, "SETUP NO.", "SETUP NO")) || undefined,
      machine: text(rowValue(row, "MACHINE", "M/C NO", "MACHINE NO")) || undefined,
      completedBy: text(rowValue(row, "COMPLETED BY", "UPDATED BY")) || "Imported",
      remark: text(rowValue(row, "REMARK", "REMARKS")) || undefined,
      createdAt: isoDateTime(rowValue(row, "LOGGED ON", "UPDATED DATE")) || undefined,
    }))
    .filter((row) => row.jcNo);
}

function rows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils
    .sheet_to_json(sheet, {
      defval: "",
      raw: true,
      blankrows: false,
    })
    .map((row) => ({ raw: row, normalized: normalizeRow(row) }));
}

function normalizeRow(row) {
  const normalized = new Map();
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey || normalized.has(normalizedKey)) continue;
    normalized.set(normalizedKey, value);
  }
  return normalized;
}

function normalizeHeader(value) {
  return text(value).toUpperCase().replace(/\s+/g, " ").trim();
}

function rowValue(row, ...names) {
  for (const name of names) {
    const value = row.normalized.get(normalizeHeader(name));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function mapFields(row, fieldMap) {
  const payload = {};
  for (const [field, names] of Object.entries(fieldMap)) {
    const value = cleanCell(rowValue(row, ...names), field);
    if (value !== undefined && value !== "") payload[field] = value;
  }
  return payload;
}

function cleanCell(value, header = "") {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && isDateHeader(header)) {
    return excelSerialIsoDate(value);
  }
  if (value instanceof Date) {
    if (value.getFullYear() === 1899 || value.getFullYear() === 1900) {
      return value.toTimeString().slice(0, 8);
    }
    return localIsoDate(value);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return String(value).trim();
}

function isValidRawRow(row) {
  const value = rowValue(row, "Sr");
  return Number.isFinite(Number(value));
}

function routeKey(partNo, setupNo) {
  return `${text(partNo)}|${text(setupNo)}`;
}

function firstRejection(row) {
  let total = 0;
  let type = "";
  let remark = "";
  for (let index = 1; index <= 7; index += 1) {
    const qty = number(rowValue(row, `RejQty${index}`));
    if (qty <= 0) continue;
    total += qty;
    if (!type) type = text(rowValue(row, `RejType${index}`));
    if (!remark) remark = text(rowValue(row, `RejRemarks${index}`, `RejReason${index}`));
  }
  const legacyReject = number(rowValue(row, "REJ QTY IN PCS", "REJECTION QTY (PCS)"));
  if (!total && legacyReject > 0) {
    total = legacyReject;
    type = "Unclassified Rejection";
  }
  return { total, type, remark };
}

function downtimeFromRow(row) {
  const reasons = [
    ["QC approval", rowValue(row, "QCDown")],
    ["Machine setting", rowValue(row, "SettingDown")],
    ["No raw material", rowValue(row, "NoRMDown")],
    ["No operator", rowValue(row, "NoOpDown")],
    ["No electricity", rowValue(row, "NoElecDown")],
    ["Other", rowValue(row, "OtherDown")],
  ]
    .map(([reason, value]) => ({ reason, minutes: durationMinutes(value) }))
    .filter((item) => item.minutes > 0);
  const reasonTotal = reasons.reduce((sum, item) => sum + item.minutes, 0);
  const total = durationMinutes(rowValue(row, "M/C DOWN TIME", "DownTime", "TOTAL DOWNTIME MINUTES"));
  const top = reasons.sort((a, b) => b.minutes - a.minutes)[0];
  return {
    minutes: Math.max(reasonTotal, total),
    reason: top?.reason || (total > 0 ? "Unassigned downtime" : ""),
  };
}

function attendanceMonthKey(row) {
  const rawMonth = rowValue(row, "Month");
  const rawYear = rowValue(row, "year");
  if (rawMonth instanceof Date) return localIsoMonth(rawMonth);
  const monthText = text(rawMonth).toLowerCase();
  const month = monthNames[monthText] ?? Number(rawMonth);
  const year = Number(rawYear);
  if (!month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

const monthNames = {
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

function isoDate(value) {
  const date = asDate(value);
  return date ? localIsoDate(date) : "";
}

function isoDateTime(value) {
  const date = asDate(value);
  return date ? date.toISOString() : "";
}

function excelSerialIsoDate(value) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return value;
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function isDateHeader(header) {
  return /\b(DATE|DOJ|LOGGED ON)\b/i.test(String(header));
}

function localIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localIsoMonth(date) {
  return localIsoDate(date).slice(0, 7);
}

function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)));
  }
  const valueText = text(value);
  if (!valueText) return undefined;
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function durationMinutes(value) {
  if (value instanceof Date) {
    return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60;
  }
  const numeric = number(value);
  if (!numeric) return 0;
  return numeric <= 1 ? numeric * 24 * 60 : numeric;
}

function optionalNumberValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function countPayload(payload) {
  return Object.fromEntries(Object.entries(payload).map(([key, rowsToCount]) => [key, rowsToCount.length]));
}

function countDataEntriesByType(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.entryType] = (counts[entry.entryType] ?? 0) + 1;
  }
  return counts;
}

function addImportMetadata(payload, importedAt) {
  return Object.fromEntries(
    Object.entries(payload).map(([table, rowsToImport]) => [
      table,
      rowsToImport.map((row) => ({
        ...row,
        createdAt: typeof row.createdAt === "string" && row.createdAt ? row.createdAt : importedAt,
      })),
    ]),
  );
}

function writeTableImportFiles(payload) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "mrmpl-workbook-import-"));
  const files = {};
  for (const [table, rowsToImport] of Object.entries(payload)) {
    const filePath = path.join(outDir, `${table}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(rowsToImport, null, 2)}\n`);
    files[table] = filePath;
  }
  return { outDir, files };
}

function importTable(table, filePath, mode) {
  const args = ["convex", "import", "--table", table, mode, "--yes", "--format", "jsonArray", filePath];
  execFileSync(
    process.platform === "win32" ? "cmd.exe" : "npx",
    process.platform === "win32" ? ["/c", "npx.cmd", ...args] : args,
    {
      cwd: appDir,
      env: process.env,
      stdio: "inherit",
    },
  );
}

async function main() {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  const parsed = entryTypeFilter ? parseEntryTypeWorkbook(workbookPath, entryTypeFilter) : parseWorkbook(workbookPath);
  if (!entryTypeFilter && !includePlannerActions) {
    parsed.routeSelections = [];
    parsed.plannerPriorities = [];
    parsed.machineConstraints = [];
    parsed.planOverrides = [];
    parsed.routeChanges = [];
    parsed.dispatchApprovals = [];
    parsed.setupCompletions = [];
  }
  const counts = countPayload(parsed);

  console.log(`Workbook: ${workbookPath}`);
  if (entryTypeFilter) console.log(`Entry type: ${entryTypeFilter}`);
  if (!entryTypeFilter && !includePlannerActions) console.log("Planner action/decision tables are skipped. Pass --include-planner-actions to import them as data.");
  console.table(counts);
  if (parsed.dataEntries) console.table(countDataEntriesByType(parsed.dataEntries));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to import into Convex.");
    return;
  }

  if (process.env.CONVEX_SELF_HOSTED_URL && !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY) {
    throw new Error("CONVEX_SELF_HOSTED_ADMIN_KEY is required when importing into a self-hosted Convex backend.");
  }

  if (!process.env.CONVEX_DEPLOYMENT && !process.env.NEXT_PUBLIC_CONVEX_URL && !process.env.CONVEX_SELF_HOSTED_URL) {
    throw new Error("Convex deployment env is required. Set CONVEX_DEPLOYMENT/NEXT_PUBLIC_CONVEX_URL for cloud or CONVEX_SELF_HOSTED_URL/CONVEX_SELF_HOSTED_ADMIN_KEY for local self-hosted Convex in apps/web/.env.local.");
  }

  const importedAt = new Date(fs.statSync(workbookPath).mtimeMs).toISOString();
  const importPayload = addImportMetadata(parsed, importedAt);
  const { outDir, files } = writeTableImportFiles(importPayload);
  const mode = replace ? "--replace" : "--append";

  console.log(`Prepared Convex import files in ${outDir}`);
  console.log(`${replace ? "Replacing" : "Appending to"} ${entryTypeFilter ? "selected entry type" : "workbook tables"} in the selected Convex deployment.`);

  for (const [table, filePath] of Object.entries(files)) {
    console.log(`${table}: ${importPayload[table].length} rows`);
    importTable(table, filePath, mode);
  }

  console.log("Workbook import complete.");
}

await main();
