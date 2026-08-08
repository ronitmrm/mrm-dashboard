import {
  createAuthorizationRepository,
  createDashboardReadModelRepository,
} from "@workspace/db"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import type { NextRequest } from "next/server"

import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import { authorizationRequestTelemetryForCurrentScope } from "./auth/authorization-request-telemetry"
import { telemetryRequestId } from "./request-telemetry"

export class DashboardReadError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function withDashboardReadRepository<T>(
  request: NextRequest,
  operation: (context: {
    actorEmail: string
    organizationId: string
    repository: ReturnType<typeof createDashboardReadModelRepository>
  }) => Promise<T>
) {
  const authorizationTelemetry = authorizationRequestTelemetryForCurrentScope({
    requestId: telemetryRequestId(request),
  })
  const { telemetry } = authorizationTelemetry
  telemetry.recordSessionRead()
  let authorization: ReturnType<typeof createAuthorizationRepository> | null =
    null
  let connectionString = ""
  let session: Awaited<
    ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>
  >
  try {
    session = await getAuth().api.getSession({ headers: request.headers })
    if (!session) {
      telemetry.setOutcome("unauthenticated")
      throw new DashboardReadError(
        401,
        "Authentication is required to access the dashboard API."
      )
    }

    connectionString = readAuthEnvironment().connectionString
    authorization = createAuthorizationRepository({ connectionString })
    telemetry.recordGrantRead()
    if (
      !(await authorization.hasCapability(
        session.user.id,
        "operations.dashboard.read"
      ))
    ) {
      telemetry.setOutcome("unauthorized")
      throw new DashboardReadError(
        403,
        "You do not have permission to view the operations dashboard."
      )
    }
    telemetry.setOutcome("allowed")
  } finally {
    try {
      await authorization?.close()
    } finally {
      authorizationTelemetry.finish()
    }
  }

  const repository = createDashboardReadModelRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation({
      actorEmail: session.user.email || session.user.name || session.user.id,
      organizationId,
      repository,
    })
  } finally {
    await repository.close()
  }
}

export async function readPostgresDashboard(
  request: NextRequest,
  filters: Record<string, string | undefined>,
  requestedProductionFloor?: string | null
) {
  return withDashboardReadRepository(
    request,
    async ({ organizationId, repository }) => {
      const payload = await repository.latest(
        organizationId,
        filters,
        normalizeProductionFloorCode(requestedProductionFloor)
      )
      if (payload) return payload
      await repository.requestRefresh(organizationId)
      return { cacheStatus: "missing", filters }
    }
  )
}

export async function readPostgresDashboardState(
  request: NextRequest,
  filters: Record<string, string | undefined>,
  requestedProductionFloor?: string | null,
  knownVersion?: number
) {
  return withDashboardReadRepository(
    request,
    async ({ organizationId, repository }) => {
      const productionFloorCode = normalizeProductionFloorCode(
        requestedProductionFloor
      )
      const state = await repository.state(
        organizationId,
        filters,
        productionFloorCode,
        knownVersion
      )
      const envelope = {
        productionFloorCode,
        status: state.status,
        version: state.version,
      }
      if (state.notModified) {
        return {
          ...envelope,
          coverage: null,
          dashboard: null,
          notModified: true,
        }
      }
      if (state.dashboard) {
        return {
          ...envelope,
          coverage: state.coverage,
          dashboard: state.dashboard,
          notModified: false,
        }
      }
      await repository.requestRefresh(organizationId)
      return {
        ...envelope,
        coverage: null,
        dashboard: {
          cacheStatus: "missing",
          filters,
          productionFloorCode,
        },
        notModified: false,
        status: { ...state.status, isRefreshing: true },
      }
    }
  )
}

export async function authorizePostgresDashboardEvents(request: NextRequest) {
  return withDashboardReadRepository(request, async ({ organizationId }) => ({
    organizationId,
  }))
}

export async function readPostgresDashboardStatus(request: NextRequest) {
  return withDashboardReadRepository(
    request,
    ({ organizationId, repository }) => repository.status(organizationId)
  )
}

export async function requestPostgresDashboardRefresh(request: NextRequest) {
  return withDashboardReadRepository(
    request,
    ({ organizationId, repository }) =>
      repository.requestRefresh(organizationId)
  )
}

export async function readPostgresCorrectionCandidates(
  request: NextRequest,
  limit: number
) {
  return withDashboardReadRepository(
    request,
    ({ organizationId, repository }) =>
      repository.correctionCandidates(organizationId, limit)
  )
}

export async function requestPostgresDashboardCorrection(
  request: NextRequest,
  input: {
    correctedBy?: string
    reason: string
    targetId: string
    targetKey?: string
    targetLabel?: string
    targetTable: string
  }
) {
  return withDashboardReadRepository(
    request,
    ({ actorEmail, organizationId, repository }) =>
      repository.reverseEntry({
        ...input,
        correctedBy: input.correctedBy || actorEmail,
        organizationId,
      })
  )
}
