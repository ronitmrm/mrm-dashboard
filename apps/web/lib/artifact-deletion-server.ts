import {
  createArtifactLedgerRepository,
  createArtifactService,
  type ArtifactStorageProvider,
  type ArtifactStoredObjectProvider,
} from "@workspace/db"

import { readAuthEnvironment } from "./auth/auth"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./auth/require-capability"
import { createStoredArtifactProvider } from "./artifact-storage-providers"
import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"

export type ArtifactDeletionRequest = {
  artifactId: string
  confirmation: string
  reason: string
}

type ArtifactDeletionDependencies = {
  connectionString: string
  createArtifactService: (
    input: Parameters<typeof createArtifactService>[0]
  ) => Pick<ReturnType<typeof createArtifactService>, "close" | "delete">
  createLedgerRepository: (
    input: Parameters<typeof createArtifactLedgerRepository>[0]
  ) => Pick<
    ReturnType<typeof createArtifactLedgerRepository>,
    "close" | "organizationIdForUser"
  >
  compatibilityProviders?: readonly ArtifactStoredObjectProvider[]
  provider: ArtifactStorageProvider
  requireCapability: typeof requireCapability
}

type AuthorizedArtifactDeletionDependencies = Omit<
  ArtifactDeletionDependencies,
  "requireCapability"
>

async function deleteArtifactForUserWith(
  request: ArtifactDeletionRequest,
  userId: string,
  dependencies: AuthorizedArtifactDeletionDependencies
) {
  const ledger = dependencies.createLedgerRepository({
    connectionString: dependencies.connectionString,
  })
  let organizationId: string
  try {
    organizationId = await ledger.organizationIdForUser(userId)
  } finally {
    await ledger.close()
  }

  const artifacts = dependencies.createArtifactService({
    compatibilityProviders: dependencies.compatibilityProviders,
    connectionString: dependencies.connectionString,
    provider: dependencies.provider,
  })
  try {
    return await artifacts.delete({
      actorUserId: userId,
      artifactId: request.artifactId,
      confirmation: request.confirmation,
      organizationId,
      reason: request.reason,
    })
  } finally {
    await artifacts.close()
  }
}

export async function deleteArtifactWith(
  request: ArtifactDeletionRequest,
  dependencies: ArtifactDeletionDependencies
) {
  const session = await dependencies.requireCapability(
    "artifacts.delete",
    "/administration/artifacts"
  )
  return deleteArtifactForUserWith(request, session.user.id, dependencies)
}

export function deleteArtifactForUser(
  request: ArtifactDeletionRequest,
  userId: string
) {
  return deleteArtifactForUserWith(request, userId, {
    connectionString: readAuthEnvironment().connectionString,
    createArtifactService,
    createLedgerRepository: createArtifactLedgerRepository,
    compatibilityProviders: [
      createStoredArtifactProvider("uploadthing"),
    ],
    provider: createGoogleCloudArtifactProvider(),
  })
}

export async function canDeleteArtifacts() {
  const session = await requireAuthenticatedSession("/administration/artifacts")
  const capabilities = await listGrantedCapabilities(session.user.id, [
    "artifacts.delete",
  ])
  return capabilities.includes("artifacts.delete")
}
