import { createDashboardReadModelRepository } from "@workspace/db"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import type { NextRequest } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { authorizationRequestTelemetryForCurrentScope } from "./auth/authorization-request-telemetry"
import {
  readRequestAuthenticatedSession,
  readRequestGrantedCapabilitySet,
} from "./auth/request-authorization"
import { telemetryRequestId } from "./request-telemetry"
import { hasProductionFloorAccess } from "./auth/production-floor-capabilities"

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
    actorUserId: string
    organizationId: string
    repository: ReturnType<typeof createDashboardReadModelRepository>
  }) => Promise<T>,
  capability = "operations.dashboard.read",
  requestedProductionFloor?: string | null
) {
  const authorizationTelemetry = authorizationRequestTelemetryForCurrentScope({
    requestId: telemetryRequestId(request),
  })
  const { telemetry } = authorizationTelemetry
  let connectionString = ""
  let session: Awaited<ReturnType<typeof readRequestAuthenticatedSession>>
  try {
    session = await readRequestAuthenticatedSession(request.headers, telemetry)
    if (!session) {
      telemetry.setOutcome("unauthenticated")
      throw new DashboardReadError(
        401,
        "Authentication is required to access the dashboard API."
      )
    }

    connectionString = readAuthEnvironment().connectionString
    const granted = await readRequestGrantedCapabilitySet(
      session.user.id,
      telemetry
    )
    const floor = requestedProductionFloor
      ? normalizeProductionFloorCode(requestedProductionFloor)
      : null
    const hasFloorGrant = floor && hasProductionFloorAccess(granted, floor)
    const authorized =
      granted.has(capability) &&
      (!floor ||
        capability !== "operations.dashboard.read" ||
        hasFloorGrant ||
        granted.has("operations.production_dashboard.read"))
    if (!authorized) {
      telemetry.setOutcome("unauthorized")
      throw new DashboardReadError(
        403,
        "You do not have permission to perform this dashboard action."
      )
    }
    telemetry.setOutcome("allowed")
  } finally {
    authorizationTelemetry.finish()
  }

  const repository = createDashboardReadModelRepository({ connectionString })
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
    },
    "operations.dashboard.read",
    requestedProductionFloor
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
    },
    "operations.dashboard.read",
    requestedProductionFloor
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
    correctionKind: string
    reason: string
    recordId: string
  }
) {
  try {
    return await withDashboardReadRepository(
      request,
      ({ actorUserId, organizationId, repository }) =>
        repository.reverseEntry({
          ...input,
          actorUserId,
          organizationId,
        }),
      "operations.corrections.write"
    )
  } catch (error) {
    const correctableMessages = new Set([
      "Active correction target was not found.",
      "Correction actor is required.",
      "Correction kind is required.",
      "Correction reason is required.",
      "Correction record id is required.",
    ])
    if (error instanceof Error && correctableMessages.has(error.message)) {
      throw new DashboardReadError(400, error.message)
    }
    throw error
  }
}
