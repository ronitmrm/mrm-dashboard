import "server-only"

import {
  ArtifactStorageError,
  type ArtifactStoredObjectProvider,
  type ArtifactStorageProviderIdentifier,
} from "@workspace/db"

import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"

function lazyProvider(
  identifier: ArtifactStorageProviderIdentifier,
  create: () => ArtifactStoredObjectProvider
): ArtifactStoredObjectProvider {
  let provider: ArtifactStoredObjectProvider | undefined
  const current = () => (provider ??= create())

  return {
    identifier,
    async delete(input) {
      return current().delete(input)
    },
    async read(input) {
      return current().read(input)
    },
  }
}

export function createStoredArtifactProvider(
  identifier: ArtifactStorageProviderIdentifier
) {
  if (identifier !== "google-cloud-storage") {
    throw new ArtifactStorageError(
      "provider-failure",
      "The retained file uses a storage provider that is unavailable after cutover."
    )
  }
  return lazyProvider(identifier, () => createGoogleCloudArtifactProvider())
}
