import {
  createDashboardPlanningRepository,
  createMasterDataLifecycleRepository,
  createProductionShopFloorRepository,
  isMasterDataKind,
} from "@workspace/db"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { validConfirmedPrioritySetupNumbers } from "@workspace/db/planning-rules"
import { NextResponse, type NextRequest } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { hasProductionFloorTaskCapability } from "../../../lib/auth/production-floor-task-capabilities"
import { istDateValue } from "../../../lib/date-time"
import { planningProductionFloorPayload } from "../../../lib/planning-production-floor"
import {
  authorizationRequestTelemetryForCurrentScope,
  withAuthorizationRequestTelemetry,
} from "../../../lib/auth/authorization-request-telemetry"
import {
  readRequestAuthenticatedSession,
  readRequestGrantedCapabilitySet,
} from "../../../lib/auth/request-authorization"
import { browserImportPolicy } from "@/lib/dashboard-api-policy"
import {
  autoCodedMasterTemplateFields,
  csvImportRowSourceId,
  importAutoCodedMasterRows,
} from "../../../lib/auto-coded-master-import"
import {
  dashboardErrorResponse,
  dashboardMutationCapabilities,
  DashboardRequestPolicyError,
  requiredDashboardText,
  readDashboardJsonBody,
} from "../../../lib/dashboard-route-policy"
import { executeBoundedImport } from "../../../lib/bounded-import"
import {
  normalizeInterruptedSetups,
  normalizeQueueBeforeSetups,
  normalizeQueuePlacements,
  normalizeRemainingSetups,
  planningSetupNumber,
} from "@/lib/dashboard-planning-input"
import {
  machineMasterImportPayload,
  planningImportRowError,
  planningImportValidationError,
  workOrderNumberForPayload,
} from "@/lib/planning-master-import"
import { shouldQueuePlanningRefresh } from "@/lib/planning-refresh-policy"
import { productionModuleIsEnabled } from "@/lib/production-module"
import { withHttpPerformanceOperation } from "../../../lib/http-operation-telemetry"
import { normalizeUserEnteredPayload } from "@workspace/db/user-entry-text"
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
  readPostgresEmployeeMaster,
  readPostgresHourlyQualityPage,
  readPostgresSetupChecklistPage,
} from "@/lib/postgres-operational-entry-server"
import { telemetryRequestId } from "../../../lib/request-telemetry"
import {
  isCompanyWideMasterEntryType,
  masterPayloadForScope,
} from "../../../lib/master-data-navigation"
import {
  parseTemplateUpload,
  TemplateUploadError,
} from "../../../lib/template-upload"

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

function dashboardRouteError(err: unknown) {
  const status =
    err instanceof RouteError ||
    err instanceof OperationalEntryError ||
    err instanceof DashboardReadError ||
    err instanceof DashboardRequestPolicyError ||
    err instanceof TemplateUploadError
      ? err.status
      : 500
  if (status >= 500) console.error("Dashboard API request failed", err)
  const response = dashboardErrorResponse(err, status)
  return json({ error: response.error }, response.status)
}

const dataEntryTemplateFields: Record<string, string[]> = {
  setup_name_master: ["setupName"],
  route: [
    "partNo",
    "optionNumber",
    "setupNo",
    "numberOfSetups",
    "setupName",
    "machineFamily",
    "machineType",
    "stageWeight",
  ],
  cycle: ["partNo", "optionNumber", "setupNo", "cycleTime"],
  tooling: [
    "partNo",
    "optionNumber",
    "setupNo",
    "setupName",
    "fixture",
    "tooling",
    "foamTool",
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
  rm_inward: ["jcNo", "rmPoNo", "partCode", "rmInwardDate", "rmInwardKg"],
  machine_master: [
    "machineNo",
    "productionUnit",
    "machineFamily",
    "machineType",
    "machineName",
    "location",
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
  planning_holiday: ["date", "reason", "scope", "department", "remark"],
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
const dataEntryTemplateTypes = new Set(Object.keys(dataEntryTemplateFields))

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
    `${autoCodedMasterTemplateFields(entryType, fields).map(csvCell).join(",")}\n`
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
      rmPoNo: row.rmPoNo,
      partCode: row.partCode,
      rmInwardDate: "",
      rmInwardKg: "",
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

async function preauthorizeDashboardMutation(
  request: NextRequest,
  path: string,
  body: Record<string, unknown>
) {
  const capabilities = dashboardMutationCapabilities(path)
  if (!capabilities) throw new RouteError(404, "Not found")
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
    const granted = await readRequestGrantedCapabilitySet(
      session.user.id,
      telemetry
    )
    const hasTaskCapability = capabilities.some((capability) =>
      granted.has(capability)
    )
    const hasFloorTaskCapability = hasProductionFloorTaskCapability(
      granted,
      path,
      body
    )
    if (!hasTaskCapability || !hasFloorTaskCapability) {
      telemetry.setOutcome("unauthorized")
      throw new RouteError(
        403,
        "You do not have permission to perform this dashboard action."
      )
    }
    telemetry.setOutcome("allowed")
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
  "setup_name_master",
  "tooling",
  "work_order",
])

type PlanningContext = Awaited<ReturnType<typeof authenticatedPlanningContext>>

async function savePlanningMasterEntry(
  { actorUserId, organizationId, repository }: PlanningContext,
  entryType: string,
  payload: Record<string, unknown>
) {
  if (entryType === "setup_name_master") {
    return repository.upsertSetupName({
      actorUserId,
      name: text(payload.setupName),
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      sourcePayload: payload,
    })
  }

  if (entryType === "machine_master") {
    const requestedFloor = parseProductionFloorCode(payload.productionFloorCode)
    if (!requestedFloor) {
      throw new RouteError(
        400,
        "A valid Production Unit is required. Use Conventional-01, Conventional-02, CNC-01, or Forging."
      )
    }
    const location = text(payload.location)
    if (!location) {
      throw new RouteError(400, "Machine location is required.")
    }
    return repository.upsertMachine({
      actorUserId,
      machineNumber: text(payload.machineNo),
      name: optionalText(payload.machineName),
      organizationId,
      productionFloorCode: requestedFloor,
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
      workOrderNumber: workOrderNumberForPayload(payload),
    })
  }

  const setupNumber = planningSetupNumber(payload.setupNo)
  if (!setupNumber && ["route", "cycle", "tooling"].includes(entryType)) {
    throw new RouteError(400, "A positive setup number is required.")
  }
  const itemUid = text(payload.partNo)
  const routeCode = text(payload.optionNumber) || "1"

  if (entryType === "route") {
    const sourcePayload = {
      ...payload,
      machineUsed: text(payload.machineFamily) || payload.machineUsed,
    }
    return repository.upsertRouteOption({
      actorUserId,
      itemUid,
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      replaceSetups: false,
      requireSetupNameMaster: true,
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
      sourcePayload,
    })
  }

  if (entryType === "cycle") {
    const cycleTime = numeric(payload.cycleTime)
    return repository.upsertCycleStandard({
      actorUserId,
      cycleTimeSeconds: cycleTime,
      itemUid,
      organizationId,
      productionFloorCode: text(payload.productionFloorCode),
      routeCode,
      setupNumber: setupNumber!,
      setupTimeMinutes: 0,
      sourcePayload: payload,
    })
  }

  if (entryType === "tooling") {
    const toolingRows = [
      {
        code: optionalText(payload.fixture),
        type: "Fixture",
      },
      {
        code: optionalText(payload.tooling),
        type: "Tooling",
      },
      {
        code: optionalText(payload.foamTool),
        type: "Foam tool",
      },
    ].filter((row): row is { code: string; type: string } => Boolean(row.code))
    if (!toolingRows.length) {
      throw new RouteError(400, "At least one fixture or tool is required.")
    }
    const results = []
    for (const row of toolingRows) {
      try {
        results.push(
          await repository.upsertTooling({
            actorUserId,
            description: optionalText(payload.remarks) || row.type,
            itemUid,
            organizationId,
            productionFloorCode: text(payload.productionFloorCode),
            quantity: 1,
            routeCode,
            setupNumber: setupNumber!,
            sourcePayload: payload,
            toolCode: row.code,
          })
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (
          message.startsWith("Create the tooling Asset Code in Store first")
        ) {
          throw new RouteError(400, message)
        }
        throw error
      }
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

    if (path === "employee-master") {
      return json(await readPostgresEmployeeMaster(request))
    }

    if (path.startsWith("job-cards/")) {
      return json(
        await withProductionRepository(
          request,
          "operations.dashboard.read",
          ({ organizationId, repository }) =>
            repository.readJobCardWorkspace({
              jobCardNumber: path.slice("job-cards/".length),
              organizationId,
              productionFloorCode: search.get("floor") || undefined,
            })
        )
      )
    }

    if (path === "production-sessions") {
      return json(
        await withProductionRepository(
          request,
          "operations.dashboard.read",
          ({ organizationId, repository }) => {
            const input = {
              endDate: search.get("endDate") || undefined,
              limit: optionalNumeric(search.get("limit")),
              offset: optionalNumeric(search.get("offset")),
              organizationId,
              productionFloorCode: search.get("floor") || undefined,
              sessionId: search.get("sessionId") || undefined,
              startDate: search.get("startDate") || undefined,
            }
            return search.get("view") === "events"
              ? repository.readProductionSessionEvents(input)
              : repository.readProductionSessions({
                  ...input,
                  status:
                    search.get("status") === "open" ||
                    search.get("status") === "closed"
                      ? (search.get("status") as "open" | "closed")
                      : undefined,
                })
          }
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

    return json({ error: "Not found" }, 404)
  } catch (err) {
    return dashboardRouteError(err)
  }
}

async function post(request: NextRequest, context: RouteContext) {
  if (!productionModuleIsEnabled()) {
    return json({ error: "Production module is temporarily disabled" }, 404)
  }

  const path = (await context.params).path.join("/")

  try {
    const body = normalizeUserEnteredPayload(
      plainRecord(await readDashboardJsonBody(request))
    )
    await preauthorizeDashboardMutation(request, path, plainRecord(body))

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

    if (path === "job-card-delivery-target") {
      const result = await withProductionRepository(
        request,
        "planning.override.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.saveJobCardDeliveryTarget({
            actorUserId,
            jobCardNumber: text(body.jcNo),
            jobCardOverrideWorkingDays:
              body.jobCardOverrideWorkingDays === null ||
              body.jobCardOverrideWorkingDays === ""
                ? null
                : numeric(body.jobCardOverrideWorkingDays),
            organizationId,
            productDefaultWorkingDays:
              body.productDefaultWorkingDays === null ||
              body.productDefaultWorkingDays === ""
                ? null
                : numeric(body.productDefaultWorkingDays),
          })
      )
      return json({ ...result, message: "Delivery target saved." })
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
      const confirmedSetupNumbers = validConfirmedPrioritySetupNumbers(
        body.confirmedSetupNumbers
      )
      if (!confirmedSetupNumbers) {
        throw new RouteError(
          400,
          "Confirm every priority setup in sequence before applying the priority."
        )
      }
      const result = await withPlanningRepository(
        request,
        "planning.priority.write",
        ({ actorUserId, organizationId, repository }) =>
          repository.recordPlannerPriority({
            actorUserId,
            approvalMode: optionalText(body.approvalMode),
            confirmedSetupNumbers,
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
        correctionKind: text(body.correctionKind || body.targetTable),
        reason: requiredDashboardText(body.reason, "Reversal reason"),
        recordId: text(body.recordId || body.targetId),
      })
      return json(
        await withPlanningRefresh(path, body, {
          ...result,
          message: "Entry reversed. Live status recalculated.",
        })
      )
    }

    if (path === "master-delete") {
      try {
        const kind = text(body.kind)
        if (!isMasterDataKind(kind)) {
          throw new RouteError(400, "This master does not support deletion.")
        }
        const result = await withMasterDataLifecycleRepository(
          request,
          ({ actorUserId, organizationId, repository }) =>
            repository.deleteMaster({
              actorUserId,
              kind,
              organizationId,
              reason: requiredDashboardText(body.reason, "Deletion reason"),
              recordId: requiredDashboardText(body.recordId, "Master record"),
              replacementRecordId: optionalText(body.replacementRecordId),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            message: result.replacementId
              ? "Master references moved and the duplicate was deleted."
              : "Unused master deleted.",
          })
        )
      } catch (error) {
        throw new RouteError(
          400,
          error instanceof Error ? error.message : "Master deletion failed."
        )
      }
    }

    if (path === "data-entry") {
      const entryType = String(body.entryType || "")
      const rawPayload = masterPayloadForScope(
        entryType,
        plainRecord(body.payload)
      )
      const payload = isCompanyWideMasterEntryType(entryType)
        ? rawPayload
        : productionFloorPayload(rawPayload, body.productionFloorCode)
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
      if (entryType === "production_session_start") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.startProductionSession({
              actorUserId,
              cycleTimeSeconds: optionalNumeric(payload.cycleTime),
              jobCardNumber: text(payload.jobCard || payload.jcNo),
              machineNumber: text(payload.machine || payload.machineNo),
              measurementMethod: text(payload.measurementMethod),
              operationSetupCode: text(payload.setupNo),
              operatorCode: text(payload.operatorCode || payload.operatorId),
              organizationId,
              pieceWeightGrams: firstNumeric(
                payload.pieceWeightGrams,
                payload.pieceWeight
              ),
              productionDate: text(payload.productionDate || payload.prodDate),
              productionFloorCode: text(payload.productionFloorCode),
              shift: text(payload.shift),
              sourcePayload: payload,
              startCount: optionalNumeric(payload.startCount),
              startedAt: text(payload.startedAt),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Production session started.",
          })
        )
      }
      if (entryType === "production_session_close") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.closeProductionSession({
              actorUserId,
              crateCount: optionalNumeric(
                payload.crateCount ?? payload.cratesUsed
              ),
              crateWeightKg: optionalNumeric(payload.crateWeightKg),
              endCount: optionalNumeric(payload.endCount),
              endedAt: text(payload.endedAt),
              endReason: text(payload.endReason),
              enteredRole: text(payload.enteredRole) || undefined,
              grossWeightKg: optionalNumeric(
                payload.grossWeightKg ?? payload.grossWeight
              ),
              organizationId,
              sessionId: text(payload.sessionId),
            })
        )
        return json(
          await withPlanningRefresh(path, body, {
            ...result,
            rowsUpdated: 1,
            savedText: "Production session closed.",
          })
        )
      }
      if (entryType === "production_session_downtime") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.recordProductionSessionDowntime({
              actorUserId,
              endedAt: text(payload.endedAt),
              enteredRole: text(payload.enteredRole),
              organizationId,
              reasonCode: text(payload.reasonCode || payload.downtimeCode),
              reasonName: text(payload.reasonName || payload.downtimeReason),
              sessionId: text(payload.sessionId),
              startedAt: text(payload.startedAt),
            })
        )
        return json({ ...result, rowsUpdated: 1, savedText: "Downtime saved." })
      }
      if (entryType === "production_session_downtime_start") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.startProductionSessionDowntime({
              actorUserId,
              enteredRole: text(payload.enteredRole),
              organizationId,
              reasonCode: text(payload.reasonCode || payload.downtimeCode),
              reasonName: text(payload.reasonName || payload.downtimeReason),
              sessionId: text(payload.sessionId),
              startedAt: text(payload.startedAt),
            })
        )
        return json({
          ...result,
          rowsUpdated: 1,
          savedText: "Downtime started.",
        })
      }
      if (entryType === "production_session_downtime_end") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.endProductionSessionDowntime({
              actorUserId,
              endOutcome: text(payload.endOutcome),
              endedAt: text(payload.endedAt),
              organizationId,
              sessionId: text(payload.sessionId),
            })
        )
        return json({
          ...result,
          rowsUpdated: 1,
          savedText:
            result.endOutcome === "shift_end_unresolved"
              ? "Downtime closed and carried to the next shift."
              : "Downtime closed; production can resume.",
        })
      }
      if (entryType === "production_session_downtime_carry_resolve") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.resolveCarriedProductionSessionDowntime({
              actorUserId,
              eventId: text(payload.eventId),
              organizationId,
              resolvedAt: text(payload.resolvedAt),
            })
        )
        return json({
          ...result,
          rowsUpdated: 1,
          savedText: "Carried machine problem resolved.",
        })
      }
      if (entryType === "production_session_rejection") {
        const result = await withProductionRepository(
          request,
          "operations.production.write",
          ({ actorUserId, organizationId, repository }) =>
            repository.recordProductionSessionRejection({
              actorUserId,
              enteredRole: "quality",
              organizationId,
              quantity: firstNumeric(payload.quantity, payload.rejectQty),
              reasonCode: text(
                payload.reasonCode || payload.rejectionReasonCode
              ),
              reasonName: text(payload.reasonName || payload.rejectionReason),
              remarkCode: text(
                payload.remarkCode || payload.rejectionRemarkCode
              ),
              remarkName: text(payload.remarkName || payload.rejectionRemark),
              sessionId: text(payload.sessionId),
              typeCode: text(payload.typeCode || payload.rejectionTypeCode),
              typeName: text(payload.typeName || payload.rejectionType),
            })
        )
        return json({
          ...result,
          rowsUpdated: 1,
          savedText: "Rejection saved.",
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
              receivedOn: text(payload.rmInwardDate) || istDateValue(),
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
              productionDate: text(payload.prodDate) || istDateValue(),
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
      const importBatch = parseTemplateUpload(
        entryType,
        fileName,
        fileBase64,
        dataEntryTemplateTypes
      )
      const importedRows = importBatch.rows.map((payload) =>
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
          if (entryType === "rm_inward") {
            await repository.upsertRawMaterialReceipts(
              importedRows.map((payload) => ({
                actorUserId,
                organizationId,
                payload,
                productionFloorCode: text(payload.productionFloorCode),
                quantityKg: firstNumeric(payload.rmInwardKg),
                receiptNumber: text(payload.rmPoNo) || text(payload.jcNo),
                receivedOn: text(payload.rmInwardDate) || istDateValue(),
              }))
            )
            return importedRows.length
          }
          let count = 0
          for (const payload of importedRows) {
            await repository.recordProductionEntry({
              actorUserId,
              jobCardNumber: text(payload.jobCard || payload.jcNo),
              machineNumber: optionalText(payload.machine),
              operationSetupCode: optionalText(payload.setupNo),
              operatorCode: optionalText(payload.operatorId),
              organizationId,
              payload,
              productionFloorCode: text(payload.productionFloorCode),
              productionDate: text(payload.prodDate) || istDateValue(),
              quantityGood: firstNumeric(payload.outputQty, payload.actualQty),
              quantityRejected: firstNumeric(payload.rejectQty),
              shift: optionalText(payload.shift),
              sourceId: csvImportRowSourceId(entryType, payload),
            })
            count += 1
          }
          return count
        }
      )
      return json(
        await withPlanningRefresh(path, body, {
          inserted,
          duplicatesSkipped: importBatch.duplicateCount,
          message: importMessage(
            entryType,
            inserted,
            importBatch.duplicateCount
          ),
          ok: true,
          rowsUpdated: inserted,
        })
      )
    }

    if (path === "data-entry") {
      const entryType = String(body.entryType || "")
      if (postgresMasterEntryTypes.has(entryType)) {
        const rawPayload = plainRecord(body.payload)
        const payload =
          entryType === "machine_master"
            ? machineMasterImportPayload(rawPayload, body.productionFloorCode)
            : productionFloorPayload(rawPayload, body.productionFloorCode)
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
            savedText:
              entryType === "work_order"
                ? "Work Order accepted. Missing masters are held in Part Readiness for planner action."
                : "Saved to PostgreSQL.",
          })
        )
      }
    }

    if (path === "data-import") {
      const entryType = String(body.entryType || "")
      if (isPostgresOperationalEntryType(entryType)) {
        const fileName = String(body.fileName || "")
        const fileBase64 = String(body.fileBase64 || "")
        const importBatch = parseTemplateUpload(
          entryType,
          fileName,
          fileBase64,
          dataEntryTemplateTypes
        )
        const importedRows = importBatch.rows.map((payload) => {
          const rawPayload = masterPayloadForScope(entryType, payload)
          if (isCompanyWideMasterEntryType(entryType)) return rawPayload
          return entryType === "machine_master"
            ? machineMasterImportPayload(rawPayload, body.productionFloorCode)
            : productionFloorPayload(rawPayload, body.productionFloorCode)
        })
        const importPolicy = browserImportPolicy(entryType, importedRows.length)
        if (!importPolicy.ok) {
          throw new RouteError(importPolicy.status, importPolicy.error)
        }
        await importAutoCodedMasterRows(entryType, importedRows, (payload) =>
          executePostgresOperationalEntry(request, entryType, payload)
        )
        return json({
          inserted: importedRows.length,
          duplicatesSkipped: importBatch.duplicateCount,
          message: importMessage(
            entryType,
            importedRows.length,
            importBatch.duplicateCount
          ),
          ok: true,
          rowsUpdated: importedRows.length,
        })
      }
      if (postgresMasterEntryTypes.has(entryType)) {
        const fileName = String(body.fileName || "")
        const fileBase64 = String(body.fileBase64 || "")
        const importBatch = parseTemplateUpload(
          entryType,
          fileName,
          fileBase64,
          dataEntryTemplateTypes
        )
        const importedRows = importBatch.rows.map((payload) =>
          entryType === "machine_master"
            ? machineMasterImportPayload(payload, body.productionFloorCode)
            : productionFloorPayload(payload, body.productionFloorCode)
        )
        const importPolicy = browserImportPolicy(entryType, importedRows.length)
        if (!importPolicy.ok) {
          throw new RouteError(importPolicy.status, importPolicy.error)
        }
        const inserted = await withPlanningRepository(
          request,
          "operations.shop_floor.write",
          async (planningContext) => {
            if (
              ["route", "cycle", "tooling", "work_order"].includes(entryType)
            ) {
              const missingItemUids = ["cycle", "tooling"].includes(entryType)
                ? await planningContext.repository.missingItemUids(
                    planningContext.organizationId,
                    importedRows.map((payload) => text(payload.partNo))
                  )
                : []
              const validationError = planningImportValidationError(
                entryType,
                importedRows,
                missingItemUids
              )
              if (validationError) {
                throw new RouteError(400, validationError)
              }
            }
            await executeBoundedImport(
              importedRows,
              async (payload, index) => {
                try {
                  await savePlanningMasterEntry(
                    planningContext,
                    entryType,
                    payload
                  )
                } catch (error) {
                  throw new RouteError(
                    400,
                    planningImportRowError(entryType, index, payload, error)
                  )
                }
              },
              entryType === "machine_master" ? 4 : 1
            )
            return importedRows.length
          }
        )
        return json(
          await withPlanningRefresh(path, body, {
            inserted,
            duplicatesSkipped: importBatch.duplicateCount,
            message:
              entryType === "work_order"
                ? `${importMessage(entryType, inserted, importBatch.duplicateCount)} Missing masters are held in Part Readiness for planner action.`
                : importMessage(
                    entryType,
                    inserted,
                    importBatch.duplicateCount
                  ),
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
    return dashboardRouteError(err)
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
  const scopedPayload = planningProductionFloorPayload(payload, requestedFloor)
  if (!scopedPayload) {
    throw new RouteError(
      400,
      "A valid Production Unit is required. Use Conventional-01, Conventional-02, CNC-01, or Forging."
    )
  }
  return scopedPayload
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

async function withMasterDataLifecycleRepository<T>(
  request: NextRequest,
  operation: (context: {
    actorUserId: string
    organizationId: string
    repository: ReturnType<typeof createMasterDataLifecycleRepository>
  }) => Promise<T>
) {
  const { connectionString, session } = await authorizedDashboardSession(
    request,
    "operations.corrections.write"
  )
  const repository = createMasterDataLifecycleRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation({
      actorUserId: session.user.id,
      organizationId,
      repository,
    })
  } finally {
    await repository.close()
  }
}

function importMessage(
  entryType: string,
  importedCount: number,
  duplicateCount: number
) {
  const imported = `Imported ${importedCount} ${entryType.replaceAll("_", " ")} rows.`
  if (!duplicateCount) return imported
  const noun = duplicateCount === 1 ? "row" : "rows"
  return `${imported} Skipped ${duplicateCount} repeated ${noun}.`
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

function optionalNumeric(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const knownDashboardApiPaths = new Set([
  "attendance",
  "correction-candidates",
  "dashboard",
  "dashboard-refresh",
  "dashboard-state",
  "data-entry",
  "data-import",
  "data-template",
  "dispatch-approval",
  "hourly-quality",
  "job-card-delivery-target",
  "job-cards",
  "machine-constraint",
  "mark-complete",
  "plan-override",
  "planner-priority",
  "production-sessions",
  "reschedule",
  "reverse-entry",
  "route-change",
  "route-selection",
  "setup-checklist",
  "status",
  "training",
])

function dashboardApiOperation(method: "get" | "post", path: string) {
  const canonicalPath = path.startsWith("job-cards/") ? "job-cards" : path
  const operation = knownDashboardApiPaths.has(canonicalPath)
    ? canonicalPath.replaceAll(/[-/]/g, "_")
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
