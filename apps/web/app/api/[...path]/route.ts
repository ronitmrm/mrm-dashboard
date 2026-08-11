import {
  createDashboardPlanningRepository,
  createProductionShopFloorRepository,
} from "@workspace/db"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import { NextResponse, type NextRequest } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  authorizationRequestTelemetryForCurrentScope,
  withAuthorizationRequestTelemetry,
} from "../../../lib/auth/authorization-request-telemetry"
import {
  readRequestAuthenticatedSession,
  readRequestGrantedCapabilitySet,
} from "../../../lib/auth/request-authorization"
import {
  browserImportPolicy,
  exportUnavailablePayload,
} from "@/lib/dashboard-api-policy"
import {
  normalizeInterruptedSetups,
  normalizeQueueBeforeSetups,
  normalizeQueuePlacements,
  normalizeRemainingSetups,
  planningSetupNumber,
} from "@/lib/dashboard-planning-input"
import { shouldQueuePlanningRefresh } from "@/lib/planning-refresh-policy"
import { productionModuleIsEnabled } from "@/lib/production-module"
import { withHttpPerformanceOperation } from "../../../lib/http-operation-telemetry"
import { normalizeUserEnteredPayload } from "../../../lib/user-entry-text"
import {
  DashboardReadError,
  readPostgresCorrectionCandidates,
  readPostgresDashboard,
  readPostgresDashboardState,
  readPostgresDashboardStatus,
  requestPostgresDashboardCorrection,
  requestPostgresDashboardRefresh,
} from "@/lib/postgres-dashboard-read-server"
import {
  executePostgresOperationalEntry,
  isPostgresOperationalEntryType,
  OperationalEntryError,
  readPostgresHourlyQualityPage,
  readPostgresSetupChecklistPage,
} from "@/lib/postgres-operational-entry-server"
import { telemetryRequestId } from "../../../lib/request-telemetry"

class RouteError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

const dataEntryTemplateFields: Record<string, string[]> = {
  route: [
    "partNo",
    "optionNumber",
    "setupNo",
    "numberOfSetups",
    "setupName",
    "machineUsed",
    "machineType",
    "stageWeight",
    "rodSize",
    "cuttingLength",
    "finishedGoodsLength",
  ],
  cycle: [
    "partNo",
    "optionNumber",
    "setupNo",
    "setupName",
    "machineUsed",
    "operationWeight",
    "cycleTime",
    "loadingUnloading",
  ],
  tooling: [
    "partNo",
    "optionNumber",
    "setupNo",
    "setupName",
    "machineUsed",
    "fixture",
    "fixtureQty",
    "tooling",
    "toolingQty",
    "foamTool",
    "foamToolQty",
    "remarks",
  ],
  work_order: [
    "jcNo",
    "partCode",
    "fgPoNo",
    "rmPoNo",
    "poDate",
    "orderPcs",
    "orderKg",
  ],
  rm_inward: [
    "jcNo",
    "fgPoNo",
    "rmPoNo",
    "partCode",
    "orderPcs",
    "orderKg",
    "rmInwardDate",
    "rmInwardKg",
    "status",
    "remark",
  ],
  employee: [
    "empId",
    "employeeType",
    "employeeName",
    "location",
    "doj",
    "terminatedDate",
    "status",
  ],
  machine_master: [
    "machineNo",
    "machineFamily",
    "machineType",
    "machineName",
    "location",
    "capacity",
    "status",
    "remarks",
  ],
  maintenance_master: [
    "maintenanceCode",
    "maintenanceTitle",
    "frequencyDays",
    "frequencyBasis",
    "checklistCode",
    "estimatedMinutes",
    "status",
    "remark",
  ],
  maintenance_checklist_master: [
    "checklistCode",
    "checklistTitle",
    "sequence",
    "stepDescription",
    "inputType",
    "remark",
  ],
  setup_checklist_master: [
    "checklistCode",
    "checklistTitle",
    "sequence",
    "checkPoint",
    "inputType",
    "required",
    "section",
    "effectiveFrom",
    "status",
    "remark",
  ],
  rejection_type_master: ["code", "typeOfRejection", "status", "remark"],
  rejection_remark_master: ["code", "rejectionRemark", "status", "remark"],
  rejection_reason_master: ["code", "rejectionReason", "status", "remark"],
  quality_parameter_master: [
    "partNo",
    "optionNumber",
    "setupNo",
    "sequence",
    "parameterName",
    "specification",
    "instrumentUsed",
    "tolerancePlus",
    "toleranceMinus",
    "inputType",
    "remark",
  ],
  planning_holiday: [
    "date",
    "reason",
    "scope",
    "department",
    "remark",
  ],
  first_piece_inspection_master: [
    "jcNo",
    "uid",
    "optionNumber",
    "setupNo",
    "description",
    "specification",
    "instrumentUsed",
    "tolerancePlus",
    "toleranceMinus",
  ],
  setup_checklist: [
    "jcNo",
    "setupDate",
    "machineNo",
    "partNo",
    "optionNumber",
    "setupNo",
    "shift",
    "setterCode",
    "helperCode",
    "settingStartTime",
    "settingEndTime",
    "qcController",
    "rimmerAvailability",
    "modhiyu",
    "remarks",
  ],
  software_raw: [
    "prodDate",
    "operatorId",
    "operatorName",
    "machineType",
    "machine",
    "partCode",
    "jobCard",
    "setupNo",
    "outputQty",
    "actualQty",
    "targetQty",
    "rejectQty",
    "rejectionType",
    "rejectionRemark",
    "downtimeMinutes",
    "downtimeReason",
  ],
}

async function dataTemplateResponse(entryType: string, request: NextRequest) {
  const fields = dataEntryTemplateFields[entryType]
  if (!fields) {
    throw new RouteError(400, `Unknown data template entry type: ${entryType}`)
  }
  if (entryType === "rm_inward") {
    return rmInwardTemplateResponse(request, fields)
  }
  return csvResponse(
    `${entryType}_template.csv`,
    `${fields.map(csvCell).join(",")}\n`
  )
}

async function rmInwardTemplateResponse(
  request: NextRequest,
  fields: string[]
) {
  const snapshot = await readPostgresDashboard(request, {})
  const productionControl = plainRecord(plainRecord(snapshot).productionControl)
  const workOrders = Array.isArray(productionControl.workOrders)
    ? productionControl.workOrders
    : []
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
    }))
  return csvResponse("rm_inward_template.csv", csvRows(fields, pendingRows))
}

function csvResponse(filename: string, body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

function csvCell(value: unknown) {
  const textValue = String(value ?? "")
  return /[",\r\n]/.test(textValue)
    ? `"${textValue.replaceAll('"', '""')}"`
    : textValue
}

function csvRows(fields: string[], rows: Array<Record<string, unknown>>) {
  return (
    [
      fields.map(csvCell).join(","),
      ...rows.map((row) =>
        fields.map((field) => csvCell(row[field])).join(",")
      ),
    ].join("\n") + "\n"
  )
}

async function authorizedDashboardSession(
  request: NextRequest,
  capability: string
) {
  const authorizationTelemetry = authorizationRequestTelemetryForCurrentScope({
    requestId: telemetryRequestId(request),
  })
  const { telemetry } = authorizationTelemetry
  try {
    const session = await readRequestAuthenticatedSession(
      request.headers,
      telemetry
    )
    if (!session) {
      telemetry.setOutcome("unauthenticated")
      throw new RouteError(
        401,
        "Authentication is required to access the dashboard API."
      )
    }
    const connectionString = readAuthEnvironment().connectionString
    const granted = await readRequestGrantedCapabilitySet(
      session.user.id,
      telemetry
    )
    if (!granted.has(capability)) {
      telemetry.setOutcome("unauthorized")
      throw new RouteError(
        403,
        "You do not have permission to perform this dashboard action."
      )
    }
    telemetry.setOutcome("allowed")
    return { connectionString, session }
  } catch (error) {
    if (!(error instanceof RouteError)) telemetry.setOutcome("error")
    throw error
  } finally {
    authorizationTelemetry.finish()
  }
}

async function authenticatedPlanningContext(
  request: NextRequest,
  capability: string
) {
  const { connectionString, session } = await authorizedDashboardSession(
    request,
    capability
  )
  const repository = createDashboardPlanningRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return { actorUserId: session.user.id, organizationId, repository }
  } catch (error) {
    await repository.close()
    throw error
  }
}

async function withPlanningRepository<T>(
  request: NextRequest,
  capability: string,
  operation: (
    context: Awaited<ReturnType<typeof authenticatedPlanningContext>>
  ) => Promise<T>
) {
  const context = await authenticatedPlanningContext(request, capability)
  try {
    return await operation(context)
  } finally {
    await context.repository.close()
  }
}

async function authenticatedProductionContext(
  request: NextRequest,
  capability: string
) {
  const { connectionString, session } = await authorizedDashboardSession(
    request,
    capability
  )
  const repository = createProductionShopFloorRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return { actorUserId: session.user.id, organizationId, repository }
  } catch (error) {
    await repository.close()
    throw error
  }
}

async function withProductionRepository<T>(
  request: NextRequest,
  capability: string,
  operation: (
    context: Awaited<ReturnType<typeof authenticatedProductionContext>>
  ) => Promise<T>
) {
  const context = await authenticatedProductionContext(request, capability)
  try {
    return await operation(context)
  } finally {
    await context.repository.close()
  }
}

const postgresMasterEntryTypes = new Set([
  "cycle",
  "machine_master",
  "planning_holiday",
  "route",
  "tooling",
  "work_order",
])

type PlanningContext = Awaited<ReturnType<typeof authenticatedPlanningContext>>

async function savePlanningMasterEntry(
  { actorUserId, organizationId, repository }: PlanningContext,
  entryType: string,
  payload: Record<string, unknown>
) {
  if (entryType === "machine_master") {
    return repository.upsertMachine({
      actorUserId,
      machineNumber: text(payload.machineNo),
      name: optionalText(payload.machineName),
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      sourcePayload: payload,
    })
  }

  if (entryType === "work_order") {
    return repository.upsertWorkOrder({
      actorUserId,
      dueDate: optionalText(payload.deliveryDate),
      itemUid: text(payload.partCode),
      jobCardNumber: text(payload.jcNo),
      orderedQuantity: numeric(payload.orderPcs),
      organizationId,
      sourcePayload: payload,
      workOrderNumber: text(payload.fgPoNo) || text(payload.jcNo),
    })
  }

  const setupNumber = planningSetupNumber(payload.setupNo)
  if (!setupNumber && ["route", "cycle", "tooling"].includes(entryType)) {
    throw new RouteError(400, "A positive setup number is required.")
  }
  const itemUid = text(payload.partNo)
  const routeCode = text(payload.optionNumber) || "1"

  if (entryType === "route") {
    return repository.upsertRouteOption({
      actorUserId,
      itemUid,
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      replaceSetups: false,
      routeCode,
      setups: [
        {
          legacySetupCode: text(payload.setupNo),
          operationCode: text(payload.setupName) || `SETUP-${setupNumber}`,
          operationName: optionalText(payload.setupName),
          sequence: setupNumber!,
          setupNumber: setupNumber!,
        },
      ],
      sourcePayload: payload,
    })
  }

  if (entryType === "cycle") {
    return repository.upsertCycleStandard({
      actorUserId,
      cycleTimeSeconds: numeric(payload.cycleTime),
      itemUid,
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      routeCode,
      setupNumber: setupNumber!,
      setupTimeMinutes: numeric(payload.loadingUnloading),
      sourcePayload: payload,
    })
  }

  if (entryType === "tooling") {
    const toolingRows = [
      {
        code: optionalText(payload.fixture),
        quantity: payload.fixtureQty,
        type: "Fixture",
      },
      {
        code: optionalText(payload.tooling),
        quantity: payload.toolingQty,
        type: "Tooling",
      },
      {
        code: optionalText(payload.foamTool),
        quantity: payload.foamToolQty,
        type: "Foam tool",
      },
    ].filter((row): row is { code: string; quantity: unknown; type: string } =>
      Boolean(row.code)
    )
    if (!toolingRows.length) {
      throw new RouteError(400, "At least one fixture or tool is required.")
    }
    const results = []
    for (const row of toolingRows) {
      results.push(
        await repository.upsertTooling({
          actorUserId,
          description: optionalText(payload.remarks) || row.type,
          itemUid,
          organizationId,
          productionFloorCode: text(payload.productionFloorCode),
          quantity: numeric(row.quantity) || 1,
          routeCode,
          setupNumber: setupNumber!,
          sourcePayload: payload,
          toolCode: row.code,
        })
      )
    }
    return { id: results[0]!.id, ids: results.map((result) => result.id) }
  }

  if (entryType === "planning_holiday") {
    const exceptionType = [
      "holiday",
      optionalText(payload.scope),
      optionalText(payload.machine),
      optionalText(payload.department),
    ]
      .filter(Boolean)
      .join(":")
    return repository.upsertPlanningCalendarException({
      actorUserId,
      exceptionDate: text(payload.date),
      exceptionType,
      name: text(payload.reason) || text(payload.remark) || "Planning holiday",
      organizationId,
      sourcePayload: payload,
      workingMinutes: 0,
    })
  }

  throw new RouteError(
    400,
    `Unsupported PostgreSQL master entry type: ${entryType}`
  )
}

async function get(request: NextRequest, context: RouteContext) {
  if (!productionModuleIsEnabled()) {
    return json({ error: "Production module is temporarily disabled" }, 404)
  }

  const path = (await context.params).path.join("/")
  const search = request.nextUrl.searchParams

  try {
    if (path === "hourly-quality") {
      return json(
        await readPostgresHourlyQualityPage(
          request,
          search.get("checkKey"),
          search.get("floor")
        )
      )
    }

    if (path === "setup-checklist") {
      return json(
        await readPostgresSetupChecklistPage(
          request,
          search.get("sessionId"),
          search.get("floor")
        )
      )
    }

    if (path === "dashboard") {
      return json(
        await readPostgresDashboard(
          request,
          {
            endDate: search.get("endDate") || undefined,
            machine: search.get("machine") || undefined,
            machineType: search.get("machineType") || undefined,
            month: search.get("month") || undefined,
            operatorId: search.get("operatorId") || undefined,
            startDate: search.get("startDate") || undefined,
          },
          search.get("floor")
        )
      )
    }

    if (path === "dashboard-state") {
      return json(
        await readPostgresDashboardState(
          request,
          {
            endDate: search.get("endDate") || undefined,
            machine: search.get("machine") || undefined,
            machineType: search.get("machineType") || undefined,
            month: search.get("month") || undefined,
            operatorId: search.get("operatorId") || undefined,
            startDate: search.get("startDate") || undefined,
          },
          search.get("floor"),
          (() => {
            const value = Number(search.get("knownVersion"))
            return Number.isSafeInteger(value) && value > 0 ? value : undefined
          })()
        )
      )
    }

    if (path === "dashboard-refresh-status") {
      return json(await readPostgresDashboardStatus(request))
    }

    if (path === "correction-candidates") {
      return json({
        rows: await readPostgresCorrectionCandidates(
          request,
          Number(search.get("limit") || 200)
        ),
      })
    }

    if (path === "status") {
      return json({
        appVersion: "design-system-dashboard",
        source: "postgresql",
        workbook: "PostgreSQL",
        ...(await readPostgresDashboardStatus(request)),
      })
    }

    if (path === "data-template") {
      const entryType = search.get("entryType") || "template"
      return await dataTemplateResponse(entryType, request)
    }

    if (path === "data-export") {
      const payload = exportUnavailablePayload(path)!
      return json({ error: payload.error }, payload.status)
    }

    if (path === "export-workbook") {
      const payload = exportUnavailablePayload(path)!
      return json({ error: payload.error }, payload.status)
    }

    return json({ error: "Not found" }, 404)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Request failed" },
      err instanceof RouteError ||
        err instanceof OperationalEntryError ||
        err instanceof DashboardReadError
        ? err.status
        : 500
    )
  }
}

async function post(request: NextRequest, context: RouteContext) {
  if (!productionModuleIsEnabled()) {
    return json({ error: "Production module is temporarily disabled" }, 404)
  }

  const path = (await context.params).path.join("/")
  const body = normalizeUserEnteredPayload(
    plainRecord(await request.json().catch(() => ({})))
  )

  try {
    if (path === "dashboard-refresh") {
      return json(await requestPostgresDashboardRefresh(request))
    }

    if (path === "attendance" || path === "training") {
      const result = await executePostgresOperationalEntry(
        request,
        path,
        plainRecord(body)
      )
      return json({
        ...result,
        rowsUpdated: 1,
        savedText: "Saved to PostgreSQL.",
      })
    }

    if (path === "route-selection") {
      const result = await withPlanningRepository(
        request,
        "operations.route_selection.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.selectRoute({
            actorUserId,
            jobCardNumber: String(body.jcNo || ""),
            organizationId,
            productionFloorCode: text(body.productionFloorCode),
            routeCode: String(body.optionNumber || ""),
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          rowsUpdated: 1,
          message: "Route option saved.",
        })
      )
    }

    if (path === "planner-priority") {
      const result = await withPlanningRepository(
        request,
        "planning.priority.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordPlannerPriority({
            actorUserId,
            approvalMode: optionalText(body.approvalMode),
            interruptedFinishedQuantity:
              body.interruptedFinishedQty === undefined ||
              body.interruptedFinishedQty === ""
                ? undefined
                : numeric(body.interruptedFinishedQty),
            interruptedJobCardNumber: optionalText(body.interruptedJcNo),
            interruptedMachineNumber: optionalText(body.interruptedMachine),
            interruptedSetupNumber: planningSetupNumber(
              body.interruptedSetupNo
            ),
            interruptedSetups: normalizeInterruptedSetups(
              body.interruptedSetups
            ),
            jobCardNumber: String(body.target || body.jcNo || ""),
            organizationId,
            partCode: optionalText(body.partCode),
            priority: String(body.priority || "Normal"),
            productionFloorCode: text(body.productionFloorCode),
            queueBeforeSetups: normalizeQueueBeforeSetups(
              body.queueBeforeSetups
            ),
            remark: body.remark ? String(body.remark) : undefined,
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          rowsUpdated: 1,
          jobCards: body.target ? [body.target] : [],
        })
      )
    }

    if (path === "machine-constraint") {
      const result = await withPlanningRepository(
        request,
        "planning.constraint.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordMachineConstraint({
            actorUserId,
            interruptedSetups: normalizeInterruptedSetups(
              body.interruptedSetups
            ),
            machineNumber: String(body.machineNo || ""),
            organizationId,
            planningMode: optionalText(body.planningMode),
            productionFloorCode: text(body.productionFloorCode),
            queuePlacements: normalizeQueuePlacements(body.queuePlacements),
            reason: String(body.reason || ""),
            remark: optionalText(body.remark),
            rescheduleAction: optionalText(body.rescheduleAction),
            unavailableFrom: String(body.unavailableFrom || ""),
            unavailableTo: body.unavailableTo
              ? String(body.unavailableTo)
              : undefined,
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Machine issue saved.",
        })
      )
    }

    if (path === "plan-override") {
      const result = await withPlanningRepository(
        request,
        "planning.override.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordPlanOverride({
            actorUserId,
            fromMachineNumber: body.fromMachine
              ? String(body.fromMachine)
              : undefined,
            interruptedSetups: normalizeInterruptedSetups(
              body.interruptedSetups
            ),
            jobCardNumber: String(body.target || ""),
            organizationId,
            productionFloorCode: text(body.productionFloorCode),
            queuePlacements: normalizeQueuePlacements(body.queuePlacements),
            reason: String(body.reason || "Planner machine override"),
            setupNumber: planningSetupNumber(body.setupNo),
            toMachineNumber: String(body.toMachine || ""),
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Plan override saved.",
        })
      )
    }

    if (path === "route-change") {
      const result = await withPlanningRepository(
        request,
        "planning.route_change.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordRouteChange({
            actorUserId,
            applyFromSetup: planningSetupNumber(body.applyFromSetup),
            changeAfterSetup: planningSetupNumber(body.changeAfterSetup),
            jobCardNumber: String(body.target || ""),
            newRouteCode: String(body.newOption || ""),
            organizationId,
            productionFloorCode: text(body.productionFloorCode),
            remainingSetups: normalizeRemainingSetups(body.remainingSetups),
            reason: String(body.reason || "Planner route change"),
            wipQuantity:
              body.wipQty === undefined || body.wipQty === ""
                ? undefined
                : numeric(body.wipQty),
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          oldOption: body.changeAfterSetup || "",
          newOption: body.newOption || "",
          message: "Route change saved.",
        })
      )
    }

    if (path === "dispatch-approval") {
      const result = await withProductionRepository(
        request,
        "operations.dispatch.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordDispatchApproval({
            actorUserId,
            approvedBy: text(body.approvedBy),
            jobCardNumber: text(body.jcNo),
            organizationId,
            productionFloorCode: text(body.productionFloorCode),
            remark: optionalText(body.remark),
          })
      )
      return json({ ...result, message: "Dispatch approved." })
    }

    if (path === "mark-complete") {
      const result = await withProductionRepository(
        request,
        "operations.shop_floor.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordSetupCompletion({
            actorUserId,
            completedBy: text(body.completedBy),
            jobCardNumber: text(body.jcNo),
            machineNumber: optionalText(body.machine),
            operationSetupCode: optionalText(body.setupNo),
            organizationId,
            productionFloorCode: text(body.productionFloorCode),
            remark: optionalText(body.remark),
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Job card completion saved.",
        })
      )
    }

    if (path === "reverse-entry") {
      const result = await requestPostgresDashboardCorrection(request, {
        correctedBy: optionalText(body.correctedBy),
        reason: text(body.reason),
        targetId: text(body.targetId),
        targetKey: optionalText(body.targetKey),
        targetLabel: optionalText(body.targetLabel),
        targetTable: text(body.targetTable),
      })
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Entry reversed. Live status recalculated.",
        })
      )
    }

    if (path === "production-entry/reverse") {
      const result = await withProductionRepository(
        request,
        "operations.production.write",
        ({ actorUserId, repository }) =>
          repository.reverseProductionEntry({
            actorUserId,
            productionEntryId: text(body.productionEntryId),
            reason: text(body.reason),
          })
      )
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Production entry reversed.",
        })
      )
    }

    if (path === "data-entry") {
      const entryType = String(body.entryType || "")
      const payload = productionFloorPayload(
        plainRecord(body.payload),
        body.productionFloorCode
      )
      if (isPostgresOperationalEntryType(entryType)) {
        const result = await executePostgresOperationalEntry(
          request,
          entryType,
          payload
        )
        return json({
          ...result,
          rowsUpdated: 1,
          savedText: "Saved to PostgreSQL.",
        })
      }
      if (entryType === "production_card") {
        const cardNumber =
          text(payload.cardId) || dataEntryKey(entryType, payload) || ""
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.upsertProductionCard({
              actorUserId,
              cardNumber,
              jobCardNumber: text(payload.jobCard || payload.jcNo),
              organizationId,
              payload,
              productionFloorCode: text(payload.productionFloorCode),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Saved production card.",
          })
        )
      }
      if (entryType === "rm_inward") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.upsertRawMaterialReceipt({
              actorUserId,
              organizationId,
              payload,
              productionFloorCode: text(payload.productionFloorCode),
              quantityKg: firstNumeric(payload.rmInwardKg),
              receiptNumber: text(payload.rmPoNo) || text(payload.jcNo),
              receivedOn:
                text(payload.rmInwardDate) ||
                new Date().toISOString().slice(0, 10),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Saved raw-material receipt.",
          })
        )
      }
      if (entryType === "shop_floor_status") {
        const result = await withProductionRepository(
          request,
          "operations.shop_floor.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.recordShopFloorStage({
              actorUserId,
              jobCardNumber: text(payload.jcNo || payload.jobCard),
              machineNumber: text(payload.machine || payload.machineNo),
              operationSetupCode: text(payload.setupNo),
              organizationId,
              payload,
              productionFloorCode: text(payload.productionFloorCode),
              stage: text(payload.stage),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Saved shop-floor status.",
          })
        )
      }
      if (entryType === "software_raw") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.recordProductionEntry({
              actorUserId,
              jobCardNumber: text(payload.jobCard || payload.jcNo),
              machineNumber: optionalText(payload.machine),
              operationSetupCode: optionalText(payload.setupNo),
              operatorCode: optionalText(payload.operatorId),
              organizationId,
              payload,
              productionFloorCode: text(payload.productionFloorCode),
              productionDate:
                text(payload.prodDate) || new Date().toISOString().slice(0, 10),
              quantityGood: firstNumeric(payload.outputQty, payload.actualQty),
              quantityRejected: firstNumeric(payload.rejectQty),
              shift: optionalText(payload.shift),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Saved production output.",
          })
        )
      }
    }

    if (
      path === "data-import" &&
      ["rm_inward", "software_raw"].includes(String(body.entryType || ""))
    ) {
      const entryType = String(body.entryType || "")
      const fileName = String(body.fileName || "")
      const fileBase64 = String(body.fileBase64 || "")
      const importedRows = parseTemplateUpload(
        entryType,
        fileName,
        fileBase64
      ).map((payload) =>
        productionFloorPayload(payload, body.productionFloorCode)
      )
      const importPolicy = browserImportPolicy(entryType, importedRows.length)
      if (!importPolicy.ok) {
        throw new RouteError(importPolicy.status, importPolicy.error)
      }
      const inserted = await withProductionRepository(
        request,
        "operations.production.write",
        async ({ actorUserId, organizationId, repository }) => {
          let count = 0
          for (const payload of importedRows) {
            if (entryType === "rm_inward") {
              await repository.upsertRawMaterialReceipt({
                actorUserId,
                organizationId,
                payload,
                productionFloorCode: text(payload.productionFloorCode),
                quantityKg: firstNumeric(payload.rmInwardKg),
                receiptNumber: text(payload.rmPoNo) || text(payload.jcNo),
                receivedOn:
                  text(payload.rmInwardDate) ||
                  new Date().toISOString().slice(0, 10),
              })
            } else {
              await repository.recordProductionEntry({
                actorUserId,
                jobCardNumber: text(payload.jobCard || payload.jcNo),
                machineNumber: optionalText(payload.machine),
                operationSetupCode: optionalText(payload.setupNo),
                operatorCode: optionalText(payload.operatorId),
                organizationId,
                payload,
                productionFloorCode: text(payload.productionFloorCode),
                productionDate:
                  text(payload.prodDate) ||
                  new Date().toISOString().slice(0, 10),
                quantityGood: firstNumeric(
                  payload.outputQty,
                  payload.actualQty
                ),
                quantityRejected: firstNumeric(payload.rejectQty),
                shift: optionalText(payload.shift),
              })
            }
            count += 1
          }
          return count
        }
      )
      return json(
        await withPlanningRefresh(path, body, {
          inserted,
          message: `Imported ${inserted} ${entryType.replaceAll("_", " ")} rows.`,
          ok: true,
          rowsUpdated: inserted,
        })
      )
    }

    if (path === "data-entry") {
      const entryType = String(body.entryType || "")
      if (postgresMasterEntryTypes.has(entryType)) {
        const payload = productionFloorPayload(
          plainRecord(body.payload),
          body.productionFloorCode
        )
        const result = await withPlanningRepository(
          request,
          "operations.shop_floor.write",
          (planningContext) =>
            savePlanningMasterEntry(planningContext, entryType, payload)
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Saved to PostgreSQL.",
          })
        )
      }
    }

    if (path === "data-import") {
      const entryType = String(body.entryType || "")
      if (isPostgresOperationalEntryType(entryType)) {
        const fileName = String(body.fileName || "")
        const fileBase64 = String(body.fileBase64 || "")
        const importedRows = parseTemplateUpload(
          entryType,
          fileName,
          fileBase64
        ).map((payload) =>
          productionFloorPayload(payload, body.productionFloorCode)
        )
        const importPolicy = browserImportPolicy(entryType, importedRows.length)
        if (!importPolicy.ok) {
          throw new RouteError(importPolicy.status, importPolicy.error)
        }
        for (const payload of importedRows) {
          await executePostgresOperationalEntry(request, entryType, payload)
        }
        return json({
          inserted: importedRows.length,
          message: `Imported ${importedRows.length} ${entryType.replaceAll("_", " ")} rows.`,
          ok: true,
          rowsUpdated: importedRows.length,
        })
      }
      if (postgresMasterEntryTypes.has(entryType)) {
        const fileName = String(body.fileName || "")
        const fileBase64 = String(body.fileBase64 || "")
        const importedRows = parseTemplateUpload(
          entryType,
          fileName,
          fileBase64
        )
        const importPolicy = browserImportPolicy(entryType, importedRows.length)
        if (!importPolicy.ok) {
          throw new RouteError(importPolicy.status, importPolicy.error)
        }
        const inserted = await withPlanningRepository(
          request,
          "operations.shop_floor.write",
          async (planningContext) => {
            let count = 0
            for (const payload of importedRows) {
              await savePlanningMasterEntry(planningContext, entryType, payload)
              count += 1
            }
            return count
          }
        )
        return json(
          await withPlanningRefresh(path, body, {
            inserted,
            message: `Imported ${inserted} ${entryType.replaceAll("_", " ")} rows.`,
            ok: true,
            rowsUpdated: inserted,
          })
        )
      }
    }

    if (path === "reschedule") {
      throw new RouteError(501, "Reschedule is not implemented.")
    }

    if (path === "data-entry" || path === "data-import") {
      throw new RouteError(
        400,
        `Unsupported PostgreSQL entry type: ${String(body.entryType || "")}`
      )
    }

    return json({ error: "Not found" }, 404)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Request failed" },
      err instanceof RouteError ||
        err instanceof OperationalEntryError ||
        err instanceof DashboardReadError
        ? err.status
        : 400
    )
  }
}

async function withPlanningRefresh(
  path: string,
  body: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  if (!shouldQueuePlanningRefresh(path, body)) return payload
  return {
    ...payload,
    planningRefresh: {
      mode: "queued",
      ok: true,
    },
  }
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function productionFloorPayload(
  payload: Record<string, unknown>,
  requestedFloor: unknown
): Record<string, unknown> {
  return {
    ...payload,
    productionFloorCode: normalizeProductionFloorCode(
      requestedFloor ?? payload.productionFloorCode
    ),
  }
}

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value === undefined || value === null
      ? ""
      : String(value)
}

function optionalText(value: unknown) {
  const cleaned = text(value)
  return cleaned || undefined
}

function parseTemplateUpload(
  entryType: string,
  fileName: string,
  fileBase64: string
) {
  if (!dataEntryTemplateFields[entryType]) {
    throw new RouteError(400, `Unknown import entry type: ${entryType}`)
  }
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new RouteError(
      400,
      "Upload the filled CSV template downloaded from this screen."
    )
  }
  const csvText = decodeDataUrl(fileBase64)
  return parseCsv(csvText)
    .map(normalizeImportedPayload)
    .map((payload) => normalizeUserEnteredPayload(payload))
    .filter((row) => Object.values(row).some((value) => text(value)))
}

function decodeDataUrl(value: string) {
  const [, encoded = value] = value.split(",", 2)
  return Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/^\uFEFF/, "")
}

function parseCsv(csvText: string): Array<Record<string, unknown>> {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const next = csvText[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const [headers = [], ...bodyRows] = rows
  const cleanHeaders = headers.map((header) => header.trim()).filter(Boolean)
  return bodyRows
    .filter((bodyRow) => bodyRow.some((value) => value.trim()))
    .map((bodyRow) =>
      Object.fromEntries(
        cleanHeaders.map((header, index) => [
          header,
          bodyRow[index]?.trim() ?? "",
        ])
      )
    )
}

function normalizeImportedPayload(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      normalizeImportedValue(value),
    ])
  )
}

function normalizeImportedValue(value: unknown) {
  const cleaned = text(value)
  if (cleaned === "") return ""
  const numericValue = Number(cleaned)
  return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(cleaned)
    ? numericValue
    : cleaned
}

function dataEntryKey(entryType: string, payload: Record<string, unknown>) {
  if (entryType === "quality_parameter_master") {
    return [
      payload.partNo || payload.partCode,
      payload.optionNumber,
      payload.setupNo,
      payload.code || payload.parameterCode,
    ]
      .map(text)
      .join("|")
  }
  if (entryType === "hourly_quality_check") {
    return (
      text(payload.checkId) ||
      [
        payload.prodDate || payload.date,
        payload.shift,
        payload.hourSlot,
        payload.machine || payload.machineNo,
        payload.partCode || payload.partNo,
        payload.optionNumber,
        payload.setupNo,
      ]
        .map(text)
        .join("|")
    )
  }
  if (["route", "cycle", "tooling"].includes(entryType)) {
    return [payload.partNo, payload.optionNumber, payload.setupNo]
      .map(text)
      .join("|")
  }
  if (
    entryType === "work_order" ||
    entryType === "rm_inward" ||
    entryType === "setup_checklist"
  ) {
    return text(payload.jcNo)
  }
  if (entryType === "employee") {
    return text(payload.empId)
  }
  if (entryType === "machine_master") {
    return text(payload.machineNo)
  }
  if (entryType === "planning_holiday") {
    return [payload.date, payload.scope, payload.machine, payload.department]
      .map(text)
      .join("|")
  }
  return undefined
}

function numeric(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstNumeric(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const knownDashboardApiPaths = new Set([
  "attendance",
  "correction-candidates",
  "dashboard",
  "dashboard-refresh",
  "dashboard-refresh-status",
  "dashboard-state",
  "data-entry",
  "data-export",
  "data-import",
  "data-template",
  "dispatch-approval",
  "export-workbook",
  "hourly-quality",
  "machine-constraint",
  "mark-complete",
  "plan-override",
  "planner-priority",
  "production-entry/reverse",
  "reschedule",
  "reverse-entry",
  "route-change",
  "route-selection",
  "setup-checklist",
  "status",
  "training",
])

function dashboardApiOperation(method: "get" | "post", path: string) {
  const operation = knownDashboardApiPaths.has(path)
    ? path.replaceAll(/[-/]/g, "_")
    : "not_found"
  return `dashboard.api.${method}.${operation}`
}

function withRequestTelemetry(
  request: NextRequest,
  operation: string,
  execute: () => Promise<Response>
) {
  const requestId = telemetryRequestId(request)
  return withAuthorizationRequestTelemetry({ requestId }, () =>
    withHttpPerformanceOperation(
      { operation, request, subsystem: "dashboard" },
      execute
    )
  )
}

export async function GET(request: NextRequest, context: RouteContext) {
  const path = (await context.params).path.join("/")
  return withRequestTelemetry(request, dashboardApiOperation("get", path), () =>
    get(request, context)
  )
}

export async function POST(request: NextRequest, context: RouteContext) {
  const path = (await context.params).path.join("/")
  return withRequestTelemetry(
    request,
    dashboardApiOperation("post", path),
    () => post(request, context)
  )
}
