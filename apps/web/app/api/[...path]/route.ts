import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse, type NextRequest } from "next/server";

import { api } from "@/convex/_generated/api";
import type { ProductionEntry } from "@/lib/dashboard-domain";
import { PUBLIC_CONVEX_URL } from "@/lib/convex-env";

class RouteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function workbookPlaceholder(filename: string, body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const dataEntryTemplateFields: Record<string, string[]> = {
  route: ["partNo", "optionNumber", "setupNo", "numberOfSetups", "setupName", "machineUsed", "machineType", "stageWeight", "rodSize", "cuttingLength", "finishedGoodsLength"],
  cycle: ["partNo", "optionNumber", "setupNo", "setupName", "machineUsed", "operationWeight", "cycleTime", "loadingUnloading"],
  tooling: ["partNo", "optionNumber", "setupNo", "setupName", "machineUsed", "fixture", "fixtureQty", "tooling", "toolingQty", "foamTool", "foamToolQty", "remarks"],
  work_order: ["jcNo", "partCode", "fgPoNo", "rmPoNo", "poDate", "orderPcs", "orderKg", "numberOfSetups", "optionNumber", "rmInwardKg", "rmInwardDate", "deliveryDate", "plannerPriority", "description", "deliveryRemark"],
  rm_inward: ["jcNo", "fgPoNo", "rmPoNo", "partCode", "orderPcs", "orderKg", "rmInwardDate", "rmInwardKg", "status", "remark"],
  employee: ["empId", "employeeType", "employeeName", "location", "doj", "terminatedDate", "status"],
  machine_master: ["machineNo", "machineType", "machineName", "location", "capacity", "status", "remarks"],
  first_piece_inspection_master: ["jcNo", "uid", "optionNumber", "setupNo", "description", "specification", "instrumentUsed", "tolerancePlus", "toleranceMinus"],
  setup_checklist: ["jcNo", "setupDate", "machineNo", "partNo", "optionNumber", "setupNo", "shift", "setterCode", "helperCode", "settingStartTime", "settingEndTime", "qcController", "rimmerAvailability", "modhiyu", "remarks"],
  software_raw: ["prodDate", "operatorId", "operatorName", "machineType", "machine", "partCode", "jobCard", "setupNo", "outputQty", "actualQty", "targetQty", "rejectQty", "rejectionType", "rejectionRemark", "downtimeMinutes", "downtimeReason"],
};

async function dataTemplateResponse(entryType: string, convex: ConvexHttpClient) {
  const fields = dataEntryTemplateFields[entryType];
  if (!fields) {
    throw new RouteError(400, `Unknown data template entry type: ${entryType}`);
  }
  if (entryType === "rm_inward") {
    return rmInwardTemplateResponse(convex, fields);
  }
  return csvResponse(`${entryType}_template.csv`, `${fields.map(csvCell).join(",")}\n`);
}

async function rmInwardTemplateResponse(convex: ConvexHttpClient, fields: string[]) {
  const snapshot = await convex.query(api.dashboard.snapshot, {});
  const productionControl = plainRecord(plainRecord(snapshot).productionControl);
  const workOrders = Array.isArray(productionControl.workOrders) ? productionControl.workOrders : [];
  const pendingRows = workOrders
    .map((row) => plainRecord(row))
    .filter((row) => text(row.rmStatus).toLowerCase() !== "received")
    .map((row) => ({
      jcNo: row.jcNo,
      fgPoNo: row.fgPoNo,
      rmPoNo: row.rmPoNo,
      partCode: row.partCode,
      orderPcs: row.orderPcs,
      orderKg: row.orderKg,
      rmInwardDate: "",
      rmInwardKg: "",
      status: "",
      remark: "",
    }));
  return csvResponse("rm_inward_template.csv", csvRows(fields, pendingRows));
}

function csvResponse(filename: string, body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(value: unknown) {
  const textValue = String(value ?? "");
  return /[",\r\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

function csvRows(fields: string[], rows: Array<Record<string, unknown>>) {
  return [
    fields.map(csvCell).join(","),
    ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(",")),
  ].join("\n") + "\n";
}

async function authenticatedConvexClient() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new RouteError(401, "Authentication is required to access the dashboard API.");
  }

  return new ConvexHttpClient(PUBLIC_CONVEX_URL, {
    auth: token,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const path = (await context.params).path.join("/");
  const search = request.nextUrl.searchParams;

  try {
    const convex = await authenticatedConvexClient();

    if (path === "status") {
      const payload = await convex.query(api.dashboard.status, {});
      return json({
        workbook: "Convex",
        ...payload,
      });
    }

    if (path === "dashboard") {
      const filters = {
        operatorId: search.get("operatorId") || undefined,
        machineType: search.get("machineType") || undefined,
        machine: search.get("machine") || undefined,
        month: search.get("month") || undefined,
        startDate: search.get("startDate") || undefined,
        endDate: search.get("endDate") || undefined,
      };
      const payload = await convex.query(api.dashboard.snapshot, filters);
      return json(payload);
    }

    if (path === "data-template") {
      const entryType = search.get("entryType") || "template";
      return await dataTemplateResponse(entryType, convex);
    }

    if (path === "data-export") {
      const entryType = search.get("entryType") || "data";
      return workbookPlaceholder(`${entryType}_export.csv`, "entryType,payload\n");
    }

    if (path === "export-workbook") {
      const scope = search.get("scope") || "full";
      return workbookPlaceholder(`mrmpl_${scope}_export.csv`, "section,status\nConvex export,available\n");
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Request failed" }, err instanceof RouteError ? err.status : 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const path = (await context.params).path.join("/");
  const body = await request.json().catch(() => ({}));

  try {
    const convex = await authenticatedConvexClient();

    if (path === "route-selection") {
      const result = await convex.mutation(api.dashboard.saveRouteSelection, {
        jcNo: String(body.jcNo || ""),
        optionNumber: String(body.optionNumber || ""),
      });
      return json({ ...result, rowsUpdated: 1, message: "Route option saved." });
    }

    if (path === "planner-priority") {
      const result = await convex.mutation(api.dashboard.savePlannerPriority, {
        target: String(body.target || ""),
        jcNo: body.jcNo ? String(body.jcNo) : undefined,
        partCode: body.partCode ? String(body.partCode) : undefined,
        priority: String(body.priority || "Normal"),
        approvalMode: body.approvalMode ? String(body.approvalMode) : undefined,
        interruptedJcNo: body.interruptedJcNo ? String(body.interruptedJcNo) : undefined,
        interruptedSetupNo: body.interruptedSetupNo ? String(body.interruptedSetupNo) : undefined,
        interruptedMachine: body.interruptedMachine ? String(body.interruptedMachine) : undefined,
        interruptedFinishedQty: body.interruptedFinishedQty === undefined || body.interruptedFinishedQty === "" ? undefined : Number(body.interruptedFinishedQty),
        interruptedSetups: priorityInterruptedSetups(body.interruptedSetups),
        remark: body.remark ? String(body.remark) : undefined,
      });
      return json({ ...result, rowsUpdated: 1, jobCards: body.target ? [body.target] : [] });
    }

    if (path === "machine-constraint") {
      const result = await convex.mutation(api.dashboard.saveMachineConstraint, {
        machineNo: String(body.machineNo || ""),
        unavailableFrom: String(body.unavailableFrom || ""),
        unavailableTo: String(body.unavailableTo || ""),
        reason: String(body.reason || ""),
        remark: body.remark ? String(body.remark) : undefined,
        rescheduleAction: body.rescheduleAction ? String(body.rescheduleAction) : undefined,
      });
      return json({ ...result, message: "Machine issue saved." });
    }

    if (path === "plan-override") {
      const result = await convex.mutation(api.dashboard.savePlanOverride, {
        target: String(body.target || ""),
        toMachine: String(body.toMachine || ""),
        setupNo: body.setupNo ? String(body.setupNo) : undefined,
        fromMachine: body.fromMachine ? String(body.fromMachine) : undefined,
        reason: body.reason ? String(body.reason) : undefined,
      });
      return json({ ...result, message: "Plan override saved." });
    }

    if (path === "route-change") {
      const result = await convex.mutation(api.dashboard.saveRouteChange, {
        target: String(body.target || ""),
        newOption: String(body.newOption || ""),
        changeAfterSetup: body.changeAfterSetup ? String(body.changeAfterSetup) : undefined,
        applyFromSetup: body.applyFromSetup ? String(body.applyFromSetup) : undefined,
        wipQty: body.wipQty === undefined || body.wipQty === "" ? undefined : Number(body.wipQty),
        reason: body.reason ? String(body.reason) : undefined,
      });
      return json({
        ...result,
        oldOption: body.changeAfterSetup || "",
        newOption: body.newOption || "",
        message: "Route change saved.",
      });
    }

    if (path === "reschedule") {
      throw new RouteError(501, "Reschedule is not wired to a Convex mutation yet.");
    }

    if (path === "dispatch-approval") {
      const result = await convex.mutation(api.dashboard.saveDispatchApproval, {
        jcNo: String(body.jcNo || ""),
        approvedBy: String(body.approvedBy || ""),
        remark: body.remark ? String(body.remark) : undefined,
      });
      return json({ ...result, message: "Dispatch approved." });
    }

    if (path === "mark-complete") {
      const result = await convex.mutation(api.dashboard.markComplete, {
        jcNo: String(body.jcNo || ""),
        completedBy: String(body.completedBy || ""),
        remark: body.remark ? String(body.remark) : undefined,
        setupNo: body.setupNo ? String(body.setupNo) : undefined,
        machine: body.machine ? String(body.machine) : undefined,
      });
      return json({ ...result, message: "Job card completion saved." });
    }

    if (path === "data-entry") {
      const entryType = String(body.entryType || "");
      const payload = plainRecord(body.payload);
      if (entryType === "software_raw") {
        const productionEntry = toProductionEntry(payload);
        const result = await convex.mutation(api.dashboard.saveProductionEntry, productionEntry);
        return json({ ...result, rowsUpdated: 1, row: "productionEntries", savedText: "Saved production row." });
      }

      const result = await convex.mutation(api.dashboard.saveDataEntry, {
        entryType,
        payload,
      });
      return json({ ...result, rowsUpdated: 1, savedText: "Saved to Convex." });
    }

    if (path === "data-import") {
      const entryType = String(body.entryType || "");
      const fileName = String(body.fileName || "");
      const fileBase64 = String(body.fileBase64 || "");
      const importedRows = parseTemplateUpload(entryType, fileName, fileBase64);
      let inserted = 0;

      for (const payload of importedRows) {
        if (entryType === "software_raw") {
          await convex.mutation(api.dashboard.saveProductionEntry, toProductionEntry(payload));
        } else {
          await convex.mutation(api.dashboard.saveDataEntry, {
            entryType,
            key: dataEntryKey(entryType, payload),
            payload,
          });
        }
        inserted += 1;
      }

      return json({ ok: true, rowsUpdated: inserted, inserted, message: `Imported ${inserted} ${entryType.replaceAll("_", " ")} rows.` });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Request failed" }, err instanceof RouteError ? err.status : 400);
  }
}

function priorityInterruptedSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter((row) => typeof row === "object" && row !== null && !Array.isArray(row))
    .map((row) => row as Record<string, unknown>)
    .map((row) => ({
      jcNo: String(row.jcNo || ""),
      setupNo: String(row.setupNo || ""),
      machine: String(row.machine || ""),
      finishedQty: row.finishedQty === undefined || row.finishedQty === "" ? undefined : Number(row.finishedQty),
    }))
    .filter((row) => row.jcNo && row.setupNo && row.machine);
  return rows.length ? rows : undefined;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value);
}

function optionalText(value: unknown) {
  const cleaned = text(value);
  return cleaned || undefined;
}

function parseTemplateUpload(entryType: string, fileName: string, fileBase64: string) {
  if (!dataEntryTemplateFields[entryType]) {
    throw new RouteError(400, `Unknown import entry type: ${entryType}`);
  }
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new RouteError(400, "Upload the filled CSV template downloaded from this screen.");
  }
  const csvText = decodeDataUrl(fileBase64);
  return parseCsv(csvText).map(normalizeImportedPayload).filter((row) => Object.values(row).some((value) => text(value)));
}

function decodeDataUrl(value: string) {
  const [, encoded = value] = value.split(",", 2);
  return Buffer.from(encoded, "base64").toString("utf8").replace(/^\uFEFF/, "");
}

function parseCsv(csvText: string): Array<Record<string, unknown>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...bodyRows] = rows;
  const cleanHeaders = headers.map((header) => header.trim()).filter(Boolean);
  return bodyRows
    .filter((bodyRow) => bodyRow.some((value) => value.trim()))
    .map((bodyRow) => Object.fromEntries(cleanHeaders.map((header, index) => [header, bodyRow[index]?.trim() ?? ""])));
}

function normalizeImportedPayload(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeImportedValue(value)]));
}

function normalizeImportedValue(value: unknown) {
  const cleaned = text(value);
  if (cleaned === "") return "";
  const numericValue = Number(cleaned);
  return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(cleaned) ? numericValue : cleaned;
}

function dataEntryKey(entryType: string, payload: Record<string, unknown>) {
  if (["route", "cycle", "tooling"].includes(entryType)) {
    return [payload.partNo, payload.optionNumber, payload.setupNo].map(text).join("|");
  }
  if (entryType === "work_order" || entryType === "rm_inward" || entryType === "setup_checklist") {
    return text(payload.jcNo);
  }
  if (entryType === "employee") {
    return text(payload.empId);
  }
  if (entryType === "machine_master") {
    return text(payload.machineNo);
  }
  return undefined;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProductionEntry(payload: Record<string, unknown>): ProductionEntry {
  return {
    prodDate: text(payload.prodDate) || new Date().toISOString().slice(0, 10),
    operatorId: text(payload.operatorId) || "Unassigned",
    operatorName: optionalText(payload.operatorName),
    machineType: text(payload.machineType) || "-",
    machine: text(payload.machine) || "-",
    partCode: text(payload.partCode) || "-",
    jobCard: optionalText(payload.jobCard),
    setupNo: optionalText(payload.setupNo),
    outputQty: numeric(payload.outputQty),
    actualQty: numeric(payload.actualQty),
    targetQty: numeric(payload.targetQty),
    rejectQty: numeric(payload.rejectQty),
    rejectionType: optionalText(payload.rejectionType),
    rejectionRemark: optionalText(payload.rejectionRemark),
    downtimeMinutes: numeric(payload.downtimeMinutes),
    downtimeReason: optionalText(payload.downtimeReason),
  };
}
