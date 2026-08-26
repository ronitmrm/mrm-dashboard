import {
  createArtifactLedgerRepository,
  type ArtifactLedgerFilters,
} from "@workspace/db"

import { readAuthEnvironment } from "./auth/auth"
import { requireCapability } from "./auth/require-capability"

type ArtifactLedgerRequest = Omit<ArtifactLedgerFilters, "organizationId"> & {
  organizationId?: string
}

type ArtifactLedgerRepository = Pick<
  ReturnType<typeof createArtifactLedgerRepository>,
  "close" | "list" | "organizationIdForUser"
>

type ArtifactLedgerDependencies = {
  connectionString: string
  createRepository: (input: {
    connectionString: string
  }) => ArtifactLedgerRepository
  requireCapability: (
    capability: string,
    returnPath: string
  ) => Promise<{ user: { id: string } }>
}

export async function readArtifactLedgerWith(
  filters: ArtifactLedgerRequest,
  dependencies: ArtifactLedgerDependencies
) {
  const session = await dependencies.requireCapability(
    "artifacts.read",
    "/administration/artifacts"
  )
  const repository = dependencies.createRepository({
    connectionString: dependencies.connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForUser(
      session.user.id
    )
    return await repository.list({ ...filters, organizationId })
  } finally {
    await repository.close()
  }
}

export function readArtifactLedger(filters: ArtifactLedgerRequest) {
  return readArtifactLedgerWith(filters, {
    connectionString: readAuthEnvironment().connectionString,
    createRepository: createArtifactLedgerRepository,
    requireCapability,
  })
}
