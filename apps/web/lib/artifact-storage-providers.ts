import "server-only"

import {
  ArtifactStorageError,
  type ArtifactStoredObjectProvider,
  type ArtifactStorageProviderIdentifier,
} from "@workspace/db"

import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"
import { createLocalDiskArtifactProvider } from "./local-disk-artifact-provider"

type Environment = Record<string, string | undefined>

function localDiskDirectory(environment: Environment) {
  return environment.ARTIFACT_STORAGE_DIRECTORY?.trim() || undefined
}

/** Where new files are stored: the server disk when configured, else Google Cloud. */
export function createArtifactStorage(environment: Environment = process.env) {
  const directory = localDiskDirectory(environment)
  return directory
    ? createLocalDiskArtifactProvider(directory)
    : createGoogleCloudArtifactProvider(environment)
}

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
  const directory = localDiskDirectory(process.env)
  if (identifier === "local-disk" && directory) {
    return lazyProvider(identifier, () =>
      createLocalDiskArtifactProvider(directory)
    )
  }
  if (identifier === "google-cloud-storage") {
    return lazyProvider(identifier, () => createGoogleCloudArtifactProvider())
  }
  throw new ArtifactStorageError(
    "provider-failure",
    "The retained file uses a storage provider that is unavailable after cutover."
  )
}
