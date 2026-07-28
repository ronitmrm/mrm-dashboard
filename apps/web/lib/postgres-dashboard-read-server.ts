import {
  createAuthorizationRepository,
  createDashboardReadModelRepository,
} from "@workspace/db"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import type { NextRequest } from "next/server"

import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"

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
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) {
    throw new DashboardReadError(
      401,
      "Authentication is required to access the dashboard API."
    )
  }

  const connectionString = readAuthEnvironment().connectionString
  const authorization = createAuthorizationRepository({ connectionString })
  try {
    if (
      !(await authorization.hasCapability(
        session.user.id,
        "operations.dashboard.read"
      ))
    ) {
      throw new DashboardReadError(
        403,
        "You do not have permission to view the operations dashboard."
      )
    }
  } finally {
    await authorization.close()
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
