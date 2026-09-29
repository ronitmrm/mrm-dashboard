import "server-only"

import {
  createAuthorizationRepository,
  createMaintenanceRepository,
  createQualityRepository,
  createRecruitmentRepository,
  createWorkforceRepository,
} from "@workspace/db"
import type { NextRequest } from "next/server"
import {
  normalizeProductionFloorCode,
  parseProductionFloorCode,
} from "@workspace/db/production-floors"

import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import { operationalEntryPlan } from "@/lib/postgres-operational-entry"
import { activeEmployeeForCode, sharedEmployeeMasterRows } from "@/lib/shared-employee-master"
import { withPostgresRepository } from "@/lib/postgres-repository-lifecycle"
import { authorizationRequestTelemetryForCurrentScope } from "./auth/authorization-request-telemetry"
import { telemetryRequestId } from "./request-telemetry"
import { productionCapabilityForTab } from "./auth/production-capabilities"
import { productionMasterCapability } from "./auth/production-master-access"
import { masterCapability } from "./auth/master-capabilities"
import { signedInPerformer } from "./auth/signed-in-machinist"

const operationalEntryTypes = new Set([
  "parameter_master",
  "measuring_instrument_master",
  "attendance",
  "attendance_record",
  "employee",
  "first_piece_inspection_master",
  "first_piece_inspection_report",
  "hourly_quality_check",
  "maintenance_checklist_master",
  "maintenance_master",
  "maintenance_schedule",
  "maintenance_task",
  "quality_parameter_master",
  "rejection_reason_master",
  "rejection_remark_master",
  "rejection_type_master",
  "setup_checklist",
  "setup_checklist_master",
  "setup_checklist_session",
  "training",
  "training_record",
])
export class OperationalEntryError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function isPostgresOperationalEntryType(entryType: string) {
  return operationalEntryTypes.has(entryType)
}

function requiredProductionFloor(value: unknown) {
  const floor = parseProductionFloorCode(value)
  if (!floor) throw new OperationalEntryError(400, "Select a production unit.")
  return floor
}

async function authorizedActor(request: NextRequest, capability: string | string[]) {
  const authorizationTelemetry = authorizationRequestTelemetryForCurrentScope({
    requestId: telemetryRequestId(request),
  })
  const { telemetry } = authorizationTelemetry
  telemetry.recordSessionRead()
  let authorization: ReturnType<typeof createAuthorizationRepository> | null =
    null
  try {
    const session = await getAuth().api.getSession({ headers: request.headers })
    if (!session) {
      telemetry.setOutcome("unauthenticated")
      throw new OperationalEntryError(
        401,
        "Authentication is required to access the dashboard API."
      )
    }
    const connectionString = readAuthEnvironment().connectionString
    authorization = createAuthorizationRepository({ connectionString })
    telemetry.recordGrantRead()
    const capabilities = Array.isArray(capability) ? capability : [capability]
    let allowed = false
    for (const key of capabilities) {
      if (await authorization.hasCapability(session.user.id, key)) {
        allowed = true
        break
      }
    }
    if (!allowed) {
      telemetry.setOutcome("unauthorized")
      throw new OperationalEntryError(
        403,
        "You do not have permission to perform this dashboard action."
      )
    }
    telemetry.setOutcome("allowed")
    return {
      actorUser: session.user,
      actorUserId: session.user.id,
      connectionString,
    }
  } finally {
    try {
      await authorization?.close()
    } finally {
      authorizationTelemetry.finish()
    }
  }
}

export async function readPostgresHourlyQualityPage(
  request: NextRequest,
  checkKey?: string | null,
  productionFloorCode?: string | null
) {
  const floor = normalizeProductionFloorCode(productionFloorCode)
  const actor = await authorizedActor(
    request,
    productionCapabilityForTab("qualityControlTasksTab", floor)!
  )
  return withPostgresRepository(
    createQualityRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const page = await repository.readHourlyQualityPage({
        checkKey,
        organizationId,
        productionFloorCode: floor,
      })
      const inspector = await signedInPerformer({
        connectionString: actor.connectionString,
        organizationId,
        userId: actor.actorUserId,
        userName: actor.actorUser.name,
      })
      return {
        ...page,
        currentDashboardUser: {
          displayId: inspector
            ? [inspector.code, inspector.name].filter(Boolean).join(" · ")
            : "",
          email: actor.actorUser.email,
          employeeCode: inspector?.code ?? "",
          name: actor.actorUser.name,
          userId: actor.actorUser.id,
        },
      }
    },
    {
      operation: "quality.hourly.read",
      requestId: telemetryRequestId(request),
      subsystem: "quality",
    }
  )
}

export async function readPostgresSetupChecklistPage(
  request: NextRequest,
  sessionKey?: string | null,
  productionFloorCode?: string | null
) {
  const floor = normalizeProductionFloorCode(productionFloorCode)
  const actor = await authorizedActor(
    request,
    productionCapabilityForTab("machinistTasksTab", floor)!
  )
  return withPostgresRepository(
    createQualityRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      return await repository.readSetupChecklistPage({
        organizationId,
        productionFloorCode: floor,
        sessionKey,
      })
    },
    {
      operation: "quality.setup_checklist.read",
      requestId: telemetryRequestId(request),
      subsystem: "quality",
    }
  )
}

export async function readPostgresEmployeeMaster(request: NextRequest) {
  const actor = await authorizedActor(request, [
    "operations.dashboard.read",
    "maintenance.workspace.read",
  ])
  return withPostgresRepository(
    createRecruitmentRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const authorization = createAuthorizationRepository(actor)
      try {
        const [posts, currentEmployeeCode] = await Promise.all([
          repository.listPosts(organizationId),
          authorization.linkedEmployeeCode(actor.actorUserId, organizationId),
        ])
        const rows = sharedEmployeeMasterRows(posts)
        const currentEmployeeName = activeEmployeeForCode(rows, currentEmployeeCode ?? "")?.name ?? null
        return {
          currentEmployeeCode,
          currentUserName: actor.actorUser.name,
          currentEmployeeName,
          rows,
        }
      } finally {
        await authorization.close()
      }
    },
    {
      operation: "workforce.employee_master.read",
      requestId: telemetryRequestId(request),
      subsystem: "workforce",
    }
  )
}

export async function executePostgresOperationalEntry(
  request: NextRequest,
  entryType: string,
  payload: Record<string, unknown>,
  masterAction: "save" | "import" = "save",
  recordId?: string,
  reviseParameter = false
) {
  const plan = operationalEntryPlan(entryType, payload)
  if (!plan) return null
  const actor = await authorizedActor(
    request,
    productionMasterCapability(
      entryType,
      masterAction,
      payload.productionFloorCode
    ) ?? plan.capability
  )

  if (plan.family === "workforce") {
    return withPostgresRepository(
      createWorkforceRepository(actor),
      async (repository) => {
        const organizationId = await repository.organizationIdForCode("MRMPL")
        if (plan.operation === "employee") {
          return await repository.upsertEmployee({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "attendance") {
          return await repository.recordAttendance({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        return await repository.recordTraining({
          ...plan.input,
          actorUserId: actor.actorUserId,
          organizationId,
        })
      },
      {
        operation: `${plan.family}.${plan.operation}.write`,
        requestId: telemetryRequestId(request),
        subsystem: plan.family,
      }
    )
  }

  if (plan.family === "quality") {
    return withPostgresRepository(
      createQualityRepository(actor),
      async (repository) => {
        const organizationId = await repository.organizationIdForCode("MRMPL")
        if (plan.operation === "rejection-type") {
          return await repository.upsertRejectionType({
            rejectDuplicates: masterAction === "save",
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "rejection-reason") {
          return await repository.upsertRejectionReason({
            rejectDuplicates: masterAction === "save",
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "rejection-remark") {
          return await repository.upsertRejectionRemark({
            rejectDuplicates: masterAction === "save",
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "parameter") {
          return await repository.upsertParameterDefinition({
            rejectDuplicates: masterAction === "save",
            reviseExisting: reviseParameter,
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "reference") {
          return await repository.upsertQualityReference({
            ...plan.input,
            rejectDuplicates: masterAction === "save",
            actorUserId: actor.actorUserId,
            organizationId,
            recordId,
          })
        }
        if (plan.operation === "first-piece") {
          requiredProductionFloor(payload.productionFloorCode)
          const inspector = await signedInPerformer({
            connectionString: actor.connectionString,
            organizationId,
            userId: actor.actorUserId,
            userName: actor.actorUser.name,
          })
          if (!inspector) {
            throw new OperationalEntryError(
              403,
              "Your account needs a name to record this inspection."
            )
          }
          return await repository.recordFirstPieceInspection({
            ...plan.input,
            actorUserId: actor.actorUserId,
            approvedBy: inspector.name,
            organizationId,
            payload: {
              ...plan.input.payload,
              approvedBy: inspector.name,
              approvedByEmployeeCode: inspector.code || null,
            },
          })
        }
        if (plan.operation === "hourly") {
          requiredProductionFloor(payload.productionFloorCode)
          const inspector = await signedInPerformer({
            connectionString: actor.connectionString,
            organizationId,
            userId: actor.actorUserId,
            userName: actor.actorUser.name,
          })
          if (!inspector) {
            throw new OperationalEntryError(
              403,
              "Your account needs a name to record this check."
            )
          }
          const checkedBy = [inspector.code, inspector.name].filter(Boolean).join(" · ")
          return await repository.recordHourlyCheck({
            ...plan.input,
            actorUserId: actor.actorUserId,
            checkedBy,
            organizationId,
            payload: { ...plan.input.payload, checkedBy, checkedByEmployeeCode: inspector.code || null },
          })
        }
        if (plan.operation === "setup-template") {
          return await repository.upsertSetupChecklistTemplate({
            rejectDuplicates: masterAction === "save",
            ...plan.input,
            actorUserId: actor.actorUserId,
            items: plan.input.items.map((item) => ({ ...item })),
            organizationId,
          })
        }
        if (plan.operation === "legacy-setup-session") {
          requiredProductionFloor(payload.productionFloorCode)
          const settingMachinist = await signedInPerformer({
            connectionString: actor.connectionString,
            organizationId,
            userId: actor.actorUserId,
            userName: actor.actorUser.name,
          })
          if (!settingMachinist) {
            throw new OperationalEntryError(
              403,
              "Your account needs a name to record this checklist."
            )
          }
          const settingInput = {
            ...plan.input,
            completedBy: settingMachinist.name,
            payload: {
              ...plan.input.payload,
              setterCode: settingMachinist.code || null,
            },
            results: plan.input.results.map((result) =>
              result.itemKey === "setterCode"
                ? { ...result, value: settingMachinist.code }
                : result
            ),
          }
          const legacyItems = [
            ["modhiyu", "Modhiyu"],
            ["helperCode", "Helper code"],
            ["setterCode", "Setter code"],
            ["qcController", "QC controller"],
            ["settingStartTime", "Setting start time"],
            ["settingEndTime", "Setting end time"],
            ["rimmerAvailability", "Rimmer availability"],
          ] as const
          await repository.upsertSetupChecklistTemplate({
            actorUserId: actor.actorUserId,
            code: "SETUP-legacy",
            items: legacyItems.map(([itemKey, prompt], index) => ({
              inputType: "text",
              itemKey,
              prompt,
              required: false,
              sequence: index + 1,
            })),
            name: "Legacy setup checklist",
            organizationId,
            payload: settingInput.payload,
            revision: 1,
          })
          return await repository.saveSetupChecklistSession({
            ...settingInput,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        let result: { id: string } | undefined
        if (plan.phases.length) requiredProductionFloor(payload.productionFloorCode)
        const settingMachinist = plan.phases.length
          ? await signedInPerformer({
              connectionString: actor.connectionString,
              organizationId,
              userId: actor.actorUserId,
              userName: actor.actorUser.name,
            })
          : null
        if (plan.phases.length && !settingMachinist) {
          throw new OperationalEntryError(
            403,
            "Your account needs a name to record this checklist."
          )
        }
        for (const phase of plan.phases) {
          const attribution = phase.input.phase === "start"
            ? {
                startedBy: settingMachinist?.name,
                startedByEmployeeCode: settingMachinist?.code || null,
              }
            : {
                endedBy: settingMachinist?.name,
                endedByEmployeeCode: settingMachinist?.code || null,
              }
          const settingInput = {
            ...phase.input,
            completedBy: settingMachinist?.name,
            payload: { ...phase.input.payload, ...attribution },
          }
          result = await repository.saveSetupChecklistSession({
            ...settingInput,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (!result) {
          throw new OperationalEntryError(
            400,
            "The setup checklist does not contain any recorded values."
          )
        }
        return result
      },
      {
        operation: `${plan.family}.${plan.operation}.write`,
        requestId: telemetryRequestId(request),
        subsystem: plan.family,
      }
    )
  }

  return withPostgresRepository(
    createMaintenanceRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      if (plan.operation === "definition") {
        return await repository.upsertDefinition({
          rejectDuplicates: masterAction === "save",
          ...plan.input,
          actorUserId: actor.actorUserId,
          items: [],
          organizationId,
        })
      }
      if (plan.operation === "checklist-item") {
        return await repository.upsertChecklistItem({
          rejectDuplicates: masterAction === "save",
          ...plan.input,
          actorUserId: actor.actorUserId,
          organizationId,
        })
      }
      if (plan.operation === "schedule") {
        return await repository.upsertMachineSchedule({
          ...plan.input,
          actorUserId: actor.actorUserId,
          organizationId,
        })
      }
      const performer = plan.operation === "breakdown-task" ||
          plan.operation === "breakdown-complete" ||
          plan.operation === "planned-task"
        ? await signedInPerformer({
            connectionString: actor.connectionString,
            organizationId,
            userId: actor.actorUserId,
            userName: actor.actorUser.name,
          })
        : null
      if (
        (plan.operation === "breakdown-task" ||
          plan.operation === "breakdown-complete" ||
          plan.operation === "planned-task") && !performer
      ) {
        throw new OperationalEntryError(
          403,
          "Your account needs a name to record this maintenance task."
        )
      }
      if (plan.operation === "breakdown-task") {
        return await repository.completeBreakdownTask({
          ...plan.input,
          actorUserId: actor.actorUserId,
          completedBy: performer?.name ?? "",
          organizationId,
          payload: {
            ...plan.input.payload,
            completedBy: performer?.name,
            completedByEmployeeCode: performer?.code || null,
          },
        })
      }
      if (plan.operation === "breakdown-start") {
        return await repository.startBreakdown({
          ...plan.input,
          actorUserId: actor.actorUserId,
          organizationId,
        })
      }
      if (plan.operation === "breakdown-complete") {
        return await repository.completeBreakdown({
          ...plan.input,
          actorUserId: actor.actorUserId,
          completedBy: performer?.name ?? "",
          organizationId,
          payload: {
            ...plan.input.payload,
            completedBy: performer?.name,
            completedByEmployeeCode: performer?.code || null,
          },
        })
      }
      return await repository.completeTask({
        ...plan.input,
        actorUserId: actor.actorUserId,
        completedBy: performer?.name,
        organizationId,
        payload: {
          ...plan.input.payload,
          completedBy: performer?.name,
          completedByEmployeeCode: performer?.code || null,
        },
      })
    },
    {
      operation: `${plan.family}.${plan.operation}.write`,
      requestId: telemetryRequestId(request),
      subsystem: plan.family,
    }
  )
}

export async function savePostgresQualityParameterSet(
  request: NextRequest,
  changes: Array<{ payload: Record<string, unknown>; reviseParameter: boolean }>
) {
  const plans = changes.map(({ payload, reviseParameter }) => {
    const plan = operationalEntryPlan("quality_parameter_master", payload)
    if (plan?.operation !== "parameter") {
      throw new OperationalEntryError(400, "Invalid quality parameter change.")
    }
    return { ...plan.input, reviseExisting: reviseParameter }
  })
  const actor = await authorizedActor(
    request,
    masterCapability(
      "quality_parameter_master",
      "save",
      plans[0]?.productionFloorCode
    )
  )
  return withPostgresRepository(
    createQualityRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      return repository.saveParameterSet(
        plans.map((plan) => ({
          ...plan,
          actorUserId: actor.actorUserId,
          organizationId,
        }))
      )
    },
    {
      operation: "quality.parameter_set.write",
      requestId: telemetryRequestId(request),
      subsystem: "quality",
    }
  )
}
