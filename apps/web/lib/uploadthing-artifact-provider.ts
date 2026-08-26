import { UTApi, UTFile } from "uploadthing/server"

import type { ArtifactStorageProvider } from "@workspace/db"

type Environment = Record<string, string | undefined>

type UploadThingClient = {
  deleteFiles(key: string): Promise<unknown>
  uploadFiles(
    file: UTFile,
    options: { acl: "public-read"; contentDisposition: "attachment" }
  ): Promise<
    | { data: { key: string; ufsUrl: string }; error: null }
    | { data: null; error: { message: string } }
  >
}

export function readUploadThingEnvironment(
  environment: Environment = process.env
) {
  const token = environment.UPLOADTHING_TOKEN?.trim()
  if (!token) {
    throw new Error(
      "UPLOADTHING_TOKEN is required for retained file uploads. Configure it as a server-only environment variable."
    )
  }
  return { token }
}

export function createUploadThingArtifactProvider(
  environment: Environment = process.env,
  client?: UploadThingClient
): ArtifactStorageProvider {
  const { token } = readUploadThingEnvironment(environment)
  const api: UploadThingClient = client ?? new UTApi({ token })

  return {
    async delete({ key }) {
      try {
        await api.deleteFiles(key)
      } catch (error) {
        throw new Error("UploadThing could not delete the retained file.", {
          cause: error,
        })
      }
    },

    async upload({ bytes, customId, mediaType, name }) {
      const file = new UTFile([Uint8Array.from(bytes)], name, {
        customId,
        type: mediaType,
      })
      let result: Awaited<ReturnType<UploadThingClient["uploadFiles"]>>
      try {
        result = await api.uploadFiles(file, {
          acl: "public-read",
          contentDisposition: "attachment",
        })
      } catch (error) {
        throw new Error("UploadThing could not store the retained file.", {
          cause: error,
        })
      }
      if (result.error) {
        throw new Error(
          `UploadThing could not store the retained file: ${result.error.message}`
        )
      }
      return { key: result.data.key, url: result.data.ufsUrl }
    },
  }
}
