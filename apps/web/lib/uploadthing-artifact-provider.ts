import { UTApi, UTFile } from "uploadthing/server"

import type { ArtifactStorageProvider } from "@workspace/db"

type Environment = Record<string, string | undefined>

type UploadThingClient = {
  deleteFiles(key: string): Promise<{ deletedCount: number; success: boolean }>
  getFileUrls(key: string): Promise<{
    data: readonly { key: string; url: string }[]
  }>
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
  client?: UploadThingClient,
  fetchImplementation: typeof fetch = fetch
): ArtifactStorageProvider {
  const { token } = readUploadThingEnvironment(environment)
  const api: UploadThingClient = client ?? new UTApi({ token })
  const uploadedUrls = new Map<string, string>()

  async function resolvePublicUrl(key: string) {
    const uploadedUrl = uploadedUrls.get(key)
    if (uploadedUrl) return uploadedUrl
    try {
      const result = await api.getFileUrls(key)
      const url = result.data.find((file) => file.key === key)?.url
      if (url) return url
    } catch (error) {
      throw new Error("UploadThing could not resolve the retained file.", {
        cause: error,
      })
    }
    throw new Error("UploadThing could not resolve the retained file.")
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
        if (!response.ok)
          throw new Error("UploadThing returned a failed response.")
        return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        throw new Error("UploadThing could not read the retained file.", {
          cause: error,
        })
      }
    },

    async resolveLegacyPublicUrl({ key }) {
      return resolvePublicUrl(key)
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
      uploadedUrls.set(result.data.key, result.data.ufsUrl)
      return { key: result.data.key }
    },
  }
}
