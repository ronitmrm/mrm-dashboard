import { UTApi } from "uploadthing/server"

import {
  ArtifactStorageError,
  type ArtifactStoredObjectProvider,
} from "@workspace/db"

type Environment = Record<string, string | undefined>

type UploadThingClient = {
  deleteFiles(key: string): Promise<{ deletedCount: number; success: boolean }>
  getFileUrls(key: string): Promise<{
    data: readonly { key: string; url: string }[]
  }>
}

export function readUploadThingEnvironment(
  environment: Environment = process.env
) {
  const token = environment.UPLOADTHING_TOKEN?.trim()
  if (!token) {
    throw new Error(
      "UPLOADTHING_TOKEN is required for legacy retained-file access. Configure it as a server-only environment variable."
    )
  }
  return { token }
}

export function createUploadThingArtifactProvider(
  environment: Environment = process.env,
  client?: UploadThingClient,
  fetchImplementation: typeof fetch = fetch
): ArtifactStoredObjectProvider {
  const { token } = readUploadThingEnvironment(environment)
  const api: UploadThingClient = client ?? new UTApi({ token })
  async function resolvePublicUrl(key: string) {
    try {
      const result = await api.getFileUrls(key)
      const url = result.data.find((file) => file.key === key)?.url
      if (url) return url
    } catch (error) {
      throw new ArtifactStorageError(
        "provider-failure",
        "UploadThing could not resolve the retained file.",
        { cause: error }
      )
    }
    throw new ArtifactStorageError(
      "not-found",
      "The retained file was not found in UploadThing."
    )
  }

  return {
    identifier: "uploadthing",

    async delete({ key }) {
      try {
        const result = await api.deleteFiles(key)
        if (!result.success) throw new Error("UploadThing rejected deletion.")
      } catch (error) {
        throw new Error("UploadThing could not delete the retained file.", {
          cause: error,
        })
      }
    },

    async read({ key }) {
      try {
        const response = await fetchImplementation(
          await resolvePublicUrl(key),
          {
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (response.status === 404 || response.status === 410) {
          throw new ArtifactStorageError(
            "not-found",
            "The retained file was not found in UploadThing."
          )
        }
        if (!response.ok) {
          throw new ArtifactStorageError(
            "provider-failure",
            "UploadThing returned a failed response."
          )
        }
        return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        if (error instanceof ArtifactStorageError) throw error
        throw new ArtifactStorageError(
          "provider-failure",
          "UploadThing could not read the retained file.",
          { cause: error }
        )
      }
    },
  }
}
