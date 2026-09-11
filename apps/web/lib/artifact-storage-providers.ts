import "server-only"

import type {
  ArtifactStoredObjectProvider,
  ArtifactStorageProviderIdentifier,
} from "@workspace/db"

import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"
import { createUploadThingArtifactProvider } from "./uploadthing-artifact-provider"

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
  return identifier === "google-cloud-storage"
    ? lazyProvider(identifier, () => createGoogleCloudArtifactProvider())
    : lazyProvider(identifier, () => createUploadThingArtifactProvider())
}
