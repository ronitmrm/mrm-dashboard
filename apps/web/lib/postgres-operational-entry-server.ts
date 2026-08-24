import "server-only"

import {
  createAuthorizationRepository,
  createMaintenanceRepository,
  createQualityRepository,
  createRecruitmentRepository,
  createWorkforceRepository,
} from "@workspace/db"
import type { NextRequest } from "next/server"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"

import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import { operationalEntryPlan } from "@/lib/postgres-operational-entry"
import { sharedEmployeeMasterRows } from "@/lib/shared-employee-master"
import { withPostgresRepository } from "@/lib/postgres-repository-lifecycle"
import { authorizationRequestTelemetryForCurrentScope } from "./auth/authorization-request-telemetry"
import { telemetryRequestId } from "./request-telemetry"
import { productionCapabilityForTab } from "./auth/production-capabilities"

const operationalEntryTypes = new Set([
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

async function authorizedActor(request: NextRequest, capability: string) {
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
    if (!(await authorization.hasCapability(session.user.id, capability))) {
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
      return {
        ...page,
        currentDashboardUser: {
          displayId: actor.actorUser.email || actor.actorUser.id,
          email: actor.actorUser.email,
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
  const actor = await authorizedActor(request, "operations.dashboard.read")
  return withPostgresRepository(
    createRecruitmentRepository(actor),
    async (repository) => {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      return {
        rows: sharedEmployeeMasterRows(
          await repository.listPosts(organizationId)
        ),
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
  payload: Record<string, unknown>
) {
  const plan = operationalEntryPlan(entryType, payload)
  if (!plan) return null
  const actor = await authorizedActor(request, plan.capability)

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
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "rejection-reason") {
          return await repository.upsertRejectionReason({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "rejection-remark") {
          return await repository.upsertRejectionRemark({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "parameter") {
          return await repository.upsertParameterDefinition({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "first-piece") {
          return await repository.recordFirstPieceInspection({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "hourly") {
          return await repository.recordHourlyCheck({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        if (plan.operation === "setup-template") {
          return await repository.upsertSetupChecklistTemplate({
            ...plan.input,
            actorUserId: actor.actorUserId,
            items: plan.input.items.map((item) => ({ ...item })),
            organizationId,
          })
        }
        if (plan.operation === "legacy-setup-session") {
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
            payload: plan.input.payload,
            revision: 1,
          })
          return await repository.saveSetupChecklistSession({
            ...plan.input,
            actorUserId: actor.actorUserId,
            organizationId,
          })
        }
        let result: { id: string } | undefined
        for (const phase of plan.phases) {
          result = await repository.saveSetupChecklistSession({
            ...phase.input,
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
          ...plan.input,
          actorUserId: actor.actorUserId,
          items: [],
          organizationId,
        })
      }
      if (plan.operation === "checklist-item") {
        return await repository.upsertChecklistItem({
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
      if (plan.operation === "breakdown-task") {
        return await repository.completeBreakdownTask({
          ...plan.input,
          actorUserId: actor.actorUserId,
          organizationId,
        })
      }
      return await repository.completeTask({
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
