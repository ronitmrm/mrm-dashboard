import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises"
import path from "node:path"

import {
  artifactUploadChunkMaxBytes,
  ArtifactStorageError,
  type ArtifactResumableUploadProvider,
  type ArtifactStorageProvider,
  type ServerResumableUploadSession,
} from "@workspace/db"

const keyPattern = /^(artifacts|pending-artifact-uploads)\/[0-9a-f]{64}$/
const sessionPrefix = "local-disk:"

function objectKey(
  prefix: "artifacts" | "pending-artifact-uploads",
  customId: string
) {
  return `${prefix}/${createHash("sha256").update(customId, "utf8").digest("hex")}`
}

function isMissing(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  )
}

function failure(message: string, cause: unknown): never {
  if (cause instanceof ArtifactStorageError) throw cause
  throw new ArtifactStorageError(
    isMissing(cause) ? "not-found" : "provider-failure",
    message,
    { cause }
  )
}

/**
 * Retained files on the server's own disk, for self-hosted deployments.
 * Object keys match the Google Cloud layout so copied files keep their keys.
 */
export function createLocalDiskArtifactProvider(
  rootDirectory: string
): ArtifactStorageProvider & ArtifactResumableUploadProvider {
  if (!path.isAbsolute(rootDirectory)) {
    throw new Error("ARTIFACT_STORAGE_DIRECTORY must be an absolute path.")
  }

  function filePath(key: string) {
    if (!keyPattern.test(key)) {
      throw new ArtifactStorageError(
        "integrity-failure",
        "The retained file key is invalid."
      )
    }
    return path.join(rootDirectory, key)
  }

  function sessionKey(session: ServerResumableUploadSession) {
    const key = session.startsWith(sessionPrefix)
      ? session.slice(sessionPrefix.length)
      : ""
    if (!key.startsWith("pending-artifact-uploads/")) {
      throw new ArtifactStorageError(
        "not-found",
        "The local upload session is unavailable."
      )
    }
    return key
  }

  async function generationOf(file: string) {
    const stats = await stat(file, { bigint: true })
    return `${stats.ino}-${stats.mtimeNs}`
  }

  async function status(
    key: string,
    expectedByteSize: number
  ): Promise<{ complete: boolean; nextOffset: number }> {
    const file = filePath(key)
    try {
      return { complete: false, nextOffset: (await stat(`${file}.part`)).size }
    } catch (error) {
      if (!isMissing(error))
        failure("Local upload status is unavailable.", error)
    }
    try {
      if ((await stat(file)).size === expectedByteSize) {
        return { complete: true, nextOffset: expectedByteSize }
      }
    } catch (error) {
      failure("The local upload session is unavailable.", error)
    }
    throw new ArtifactStorageError(
      "integrity-failure",
      "The local upload has an unexpected size."
    )
  }

  return {
    identifier: "local-disk",
    preserveUploadsOnRollback: true,

    async cancelResumable({ session }) {
      await rm(`${filePath(sessionKey(session))}.part`, { force: true })
    },

    async deleteTemporary({ generation, key }) {
      const file = filePath(key)
      try {
        if ((await generationOf(file)) === generation) await rm(file)
      } catch (error) {
        if (!isMissing(error)) {
          failure("The temporary upload could not be deleted.", error)
        }
      }
    },

    async getResumableStatus({ expectedByteSize, session }) {
      return status(sessionKey(session), expectedByteSize)
    },

    async readTemporary({ key }) {
      const file = filePath(key)
      try {
        const generation = await generationOf(file)
        return { bytes: await readFile(file), generation }
      } catch (error) {
        failure("The temporary upload could not be read.", error)
      }
    },

    async startResumable({ customId }) {
      const key = objectKey("pending-artifact-uploads", customId)
      const file = filePath(key)
      try {
        await mkdir(path.dirname(file), { recursive: true })
        await (await open(`${file}.part`, "wx")).close()
      } catch (error) {
        failure("The temporary upload could not be started.", error)
      }
      return {
        key,
        session: `${sessionPrefix}${key}` as ServerResumableUploadSession,
      }
    },

    async uploadResumableChunk({ bytes, expectedByteSize, offset, session }) {
      const key = sessionKey(session)
      const nextOffset = offset + bytes.byteLength
      if (
        bytes.byteLength === 0 ||
        bytes.byteLength > artifactUploadChunkMaxBytes ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        nextOffset > expectedByteSize
      ) {
        throw new ArtifactStorageError(
          "integrity-failure",
          "The temporary upload chunk is invalid."
        )
      }
      const progress = await status(key, expectedByteSize)
      if (progress.complete || progress.nextOffset !== offset) return progress

      const file = filePath(key)
      try {
        const handle = await open(`${file}.part`, "r+")
        try {
          await handle.write(bytes, 0, bytes.byteLength, offset)
          await handle.sync()
        } finally {
          await handle.close()
        }
        if (nextOffset < expectedByteSize) {
          return { complete: false, nextOffset }
        }
        await rename(`${file}.part`, file)
        return { complete: true, nextOffset }
      } catch (error) {
        failure("The temporary upload chunk could not be stored.", error)
      }
    },

    async delete({ key }) {
      try {
        await rm(filePath(key), { force: true })
      } catch (error) {
        failure("The retained file could not be deleted.", error)
      }
    },

    async read({ key }) {
      try {
        return await readFile(filePath(key))
      } catch (error) {
        failure("The retained file could not be read.", error)
      }
    },

    async upload({ bytes, customId }) {
      const key = objectKey("artifacts", customId)
      const file = filePath(key)
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await mkdir(path.dirname(file), { recursive: true })
        const handle = await open(temporary, "wx")
        try {
          await handle.writeFile(bytes)
          await handle.sync()
        } finally {
          await handle.close()
        }
        // link() never replaces an existing file, so retries cannot overwrite.
        await link(temporary, file).catch(async (error: unknown) => {
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "EEXIST"
          ) {
            throw error
          }
          if (!(await readFile(file)).equals(bytes)) {
            throw new ArtifactStorageError(
              "integrity-failure",
              "Different bytes already exist at the retained file key."
            )
          }
        })
      } catch (error) {
        failure("The retained file could not be stored.", error)
      } finally {
        await rm(temporary, { force: true })
      }
      return { key }
    },
  }
}
