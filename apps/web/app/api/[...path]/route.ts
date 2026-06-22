import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse, type NextRequest } from "next/server";

import { api } from "@/convex/_generated/api";
import type { ProductionEntry } from "@/lib/dashboard-domain";

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

async function authenticatedConvexClient() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new RouteError(401, "Authentication is required to access the dashboard API.");
  }

  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL as string, {
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
      return workbookPlaceholder(`${entryType}_template.csv`, "field,value\n");
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
        priority: String(body.priority || "Normal"),
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
      throw new RouteError(501, "Bulk Excel import needs an authenticated Convex upload/import action.");
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Request failed" }, err instanceof RouteError ? err.status : 400);
  }
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
