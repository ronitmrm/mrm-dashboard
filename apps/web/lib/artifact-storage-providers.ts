import "server-only"

import type {
  ArtifactStorageProvider,
  ArtifactStorageProviderIdentifier,
} from "@workspace/db"

import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"
import { createUploadThingArtifactProvider } from "./uploadthing-artifact-provider"

function lazyProvider(
  identifier: ArtifactStorageProviderIdentifier,
  create: () => ArtifactStorageProvider
): ArtifactStorageProvider {
  let provider: ArtifactStorageProvider | undefined
  const current = () => (provider ??= create())

  const base: ArtifactStorageProvider = {
    identifier,
    async delete(input) {
      return current().delete(input)
    },
    async read(input) {
      return current().read(input)
    },
    async upload(input) {
      return current().upload(input)
    },
  }

  if (identifier === "google-cloud-storage") {
    return { ...base, preserveUploadsOnRollback: true }
  }
  return {
    ...base,
    async resolveLegacyPublicUrl(input) {
      const resolve = current().resolveLegacyPublicUrl
      if (!resolve) {
        throw new Error("Stored Artifact provider has no legacy URL resolver.")
      }
      return resolve(input)
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
